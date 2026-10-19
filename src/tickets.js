import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { GetObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { localDataDir } from "./db.js";
import { PlayError, getOwnedPlay } from "./play.js";
import { renderTicket } from "./ticket-image.js";

let s3;

export async function saveScreenshot(userId, playId) {
  const play = await ownedPlay(userId, playId);
  const png = renderTicket(play);
  const key = objectKey(userId, play.id);
  await putPng(key, png);
  return { playId: Number(play.id), key };
}

export async function readScreenshot(userId, playId) {
  const play = await ownedPlay(userId, playId);
  const key = objectKey(userId, play.id);
  const png = await getPng(key);
  if (!png) {
    throw new PlayError("not_found");
  }
  return png;
}

async function ownedPlay(userId, playId) {
  const play = await getOwnedPlay(userId, playId);
  if (!play) {
    throw new PlayError("not_found");
  }
  return play;
}

function objectKey(userId, playId) {
  return `tickets/${safeSegment(userId)}/${Number(playId)}.png`;
}

function safeSegment(userId) {
  const safe = String(userId).replace(/[^A-Za-z0-9_-]/g, "");
  if (!safe) {
    throw new PlayError("not_found");
  }
  return safe;
}

async function putPng(key, png) {
  if (process.env.TICKET_BUCKET) {
    await client().send(
      new PutObjectCommand({
        Bucket: process.env.TICKET_BUCKET,
        Key: key,
        Body: png,
        ContentType: "image/png",
        ServerSideEncryption: "AES256",
      }),
    );
    return;
  }
  if (process.env.NODE_ENV === "production") {
    throw new Error("TICKET_BUCKET is required in production");
  }
  const file = localPath(key);
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, png);
}

async function getPng(key) {
  if (process.env.TICKET_BUCKET) {
    try {
      const response = await client().send(
        new GetObjectCommand({
          Bucket: process.env.TICKET_BUCKET,
          Key: key,
        }),
      );
      return Buffer.from(await response.Body.transformToByteArray());
    } catch (error) {
      if (error?.name === "NoSuchKey" || error?.$metadata?.httpStatusCode === 404) {
        return null;
      }
      throw error;
    }
  }
  try {
    return await readFile(localPath(key));
  } catch (error) {
    if (error?.code === "ENOENT") return null;
    throw error;
  }
}

function localPath(key) {
  const root = path.join(localDataDir(), "tickets");
  const file = path.resolve(root, key.replace(/^tickets\//, ""));
  if (!file.startsWith(root + path.sep)) {
    throw new PlayError("not_found");
  }
  return file;
}

function client() {
  if (!s3) {
    s3 = new S3Client({ region: process.env.AWS_REGION || "eu-west-2" });
  }
  return s3;
}
