import { createPublicKey, verify } from "node:crypto";

const keyCache = new Map();

export class AuthError extends Error {
  constructor() {
    super("unauthenticated");
    this.code = "unauthenticated";
  }
}

export async function authenticate(req) {
  if (process.env.NODE_ENV === "development") {
    return { sub: process.env.DEV_AUTH_SUB || "local-player" };
  }

  const token = req.get("x-amzn-oidc-data");
  if (!token) {
    throw new AuthError();
  }

  const payload = await verifyAlbJwt(token);
  if (!payload.sub) {
    throw new AuthError();
  }
  return { sub: String(payload.sub) };
}

async function verifyAlbJwt(token) {
  const parts = token.split(".");
  if (parts.length !== 3) {
    throw new AuthError();
  }

  const [headerPart, payloadPart, signaturePart] = parts;
  const header = decodeJson(headerPart);
  const payload = decodeJson(payloadPart);

  if (header.alg !== "ES256" || !header.kid) {
    throw new AuthError();
  }
  if (typeof payload.exp !== "number" || payload.exp * 1000 <= Date.now()) {
    throw new AuthError();
  }
  if (process.env.ALB_ARN && payload.signer !== process.env.ALB_ARN) {
    throw new AuthError();
  }

  const pem = await elbPublicKey(header.kid);
  const key = createPublicKey(pem);
  const valid = verify(
    "sha256",
    Buffer.from(`${headerPart}.${payloadPart}`),
    { key, dsaEncoding: "ieee-p1363" },
    Buffer.from(signaturePart, "base64url"),
  );
  if (!valid) {
    throw new AuthError();
  }
  return payload;
}

async function elbPublicKey(kid) {
  const cached = keyCache.get(kid);
  if (cached) {
    return cached;
  }

  const region = process.env.AWS_REGION || "eu-west-2";
  const url = `https://public-keys.auth.elb.${region}.amazonaws.com/${encodeURIComponent(kid)}`;
  const response = await fetch(url);
  if (!response.ok) {
    throw new AuthError();
  }
  const pem = await response.text();
  keyCache.set(kid, pem);
  return pem;
}

function decodeJson(part) {
  try {
    return JSON.parse(Buffer.from(part, "base64url").toString("utf8"));
  } catch {
    throw new AuthError();
  }
}
