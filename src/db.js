import { readFileSync } from "node:fs";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  GetSecretValueCommand,
  SecretsManagerClient,
} from "@aws-sdk/client-secrets-manager";
import pg from "pg";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

let mode = "closed";
let pglite;
let pool;
let secrets;

export function storeName() {
  return mode;
}

export function localDataDir() {
  return path.resolve(root, process.env.DATA_DIR || ".data");
}

export async function closeDb() {
  if (pglite) {
    await pglite.close();
    pglite = undefined;
  }
  if (pool) {
    await pool.end();
    pool = undefined;
  }
  mode = "closed";
}

export async function initDb() {
  const statements = sqlStatements(
    readFileSync(new URL("./schema.sql", import.meta.url), "utf8"),
  );

  if (process.env.DATABASE_URL || process.env.DB_SECRET_ARN) {
    mode = "pg";
    pool = new pg.Pool(await poolConfig());
    for (const statement of statements) {
      await pool.query(statement);
    }
    return;
  }

  if (process.env.NODE_ENV === "production") {
    throw new Error("DATABASE_URL or DB_SECRET_ARN is required in production");
  }

  mode = "pglite";
  const dataDir = localDataDir();
  await mkdir(dataDir, { recursive: true });
  const { PGlite } = await import("@electric-sql/pglite");
  pglite = new PGlite(dataDir);
  for (const statement of statements) {
    await pglite.exec(statement);
  }
}

export async function query(sql, params = []) {
  return run((executor) => executor.query(sql, params));
}

export async function withTransaction(fn) {
  if (mode === "pglite") {
    return pglite.transaction(fn);
  }

  return run(async (executor) => {
    const client = executor;
    await client.query("BEGIN");
    try {
      const result = await fn(client);
      await client.query("COMMIT");
      return result;
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    }
  }, { dedicated: true });
}

async function run(fn, options = {}) {
  try {
    return await dispatch(fn, options);
  } catch (error) {
    if (error?.code !== "28P01" || !process.env.DB_SECRET_ARN) {
      throw error;
    }
    await pool.end();
    pool = new pg.Pool(await poolConfig({ refresh: true }));
    return dispatch(fn, options);
  }
}

async function dispatch(fn, options) {
  if (mode === "pglite") {
    return fn(pglite);
  }
  if (options.dedicated) {
    const client = await pool.connect();
    try {
      return await fn(client);
    } finally {
      client.release();
    }
  }
  return fn(pool);
}

async function poolConfig({ refresh = false } = {}) {
  const connectionString = process.env.DATABASE_URL || (await databaseUrlFromSecret(refresh));
  const config = { connectionString };
  if (process.env.DB_SECRET_ARN || process.env.DATABASE_SSL === "require") {
    config.ssl = {
      rejectUnauthorized: true,
      ca: readFileSync(path.join(root, "certs", "global-bundle.pem"), "utf8"),
    };
  }
  return config;
}

async function databaseUrlFromSecret(refresh) {
  if (!secrets || refresh) {
    secrets = new SecretsManagerClient({
      region: process.env.AWS_REGION || "eu-west-2",
    });
  }
  const response = await secrets.send(
    new GetSecretValueCommand({ SecretId: process.env.DB_SECRET_ARN }),
  );
  const secret = JSON.parse(response.SecretString);
  const username = encodeURIComponent(secret.username);
  const password = encodeURIComponent(secret.password);
  const port = secret.port || 5432;
  const database = secret.dbname || "postgres";
  return `postgresql://${username}:${password}@${secret.host}:${port}/${database}`;
}

function sqlStatements(sql) {
  return sql
    .split("\n")
    .filter((line) => !line.trim().startsWith("--"))
    .join("\n")
    .split(";")
    .map((statement) => statement.trim())
    .filter(Boolean);
}
