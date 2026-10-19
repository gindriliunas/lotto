import path from "node:path";
import { fileURLToPath } from "node:url";
import express from "express";
import { AuthError, authenticate } from "./auth.js";
import { initDb, storeName } from "./db.js";
import { PlayError, getSession, issueToken, play } from "./play.js";
import { readScreenshot, saveScreenshot } from "./tickets.js";

const app = express();
const publicDir = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../public",
);

app.disable("x-powered-by");
app.use(express.json());

app.get("/health", (_req, res) => {
  res.json({ ok: true });
});

app.get("/api/session", async (req, res) => {
  try {
    const user = await authenticate(req);
    res.json(await getSession(user.sub));
  } catch (error) {
    sendError(res, error);
  }
});

app.post("/api/play-token", async (req, res) => {
  try {
    const user = await authenticate(req);
    res.json(await issueToken(user.sub));
  } catch (error) {
    sendError(res, error);
  }
});

app.post("/api/play", async (req, res) => {
  try {
    const user = await authenticate(req);
    const result = await play(user.sub, req.body?.token);
    console.log(
      JSON.stringify({
        event: "play",
        userId: user.sub,
        playId: result.playId,
        outcome: result.outcome,
        prizePence: result.prizePence,
      }),
    );
    res.json(result);
  } catch (error) {
    sendError(res, error);
  }
});

app.post("/api/plays/:playId/screenshot", async (req, res) => {
  try {
    const user = await authenticate(req);
    const saved = await saveScreenshot(user.sub, req.params.playId);
    console.log(
      JSON.stringify({
        event: "screenshot",
        userId: user.sub,
        playId: saved.playId,
      }),
    );
    res.json(saved);
  } catch (error) {
    sendError(res, error);
  }
});

app.get("/api/plays/:playId/screenshot", async (req, res) => {
  try {
    const user = await authenticate(req);
    const png = await readScreenshot(user.sub, req.params.playId);
    res.set("content-type", "image/png");
    res.set("cache-control", "private, no-store");
    res.send(png);
  } catch (error) {
    sendError(res, error);
  }
});

app.use(express.static(publicDir));

function sendError(res, error) {
  if (error instanceof AuthError) {
    res.status(401).json({ error: "unauthenticated" });
    return;
  }
  if (error instanceof PlayError) {
    const status =
      error.code === "not_found"
        ? 404
        : error.code === "no_credits" || error.code === "token_rejected"
          ? 409
          : 400;
    res.status(status).json({ error: error.code });
    return;
  }
  console.log(
    JSON.stringify({
      event: "error",
      message: error instanceof Error ? error.message : "unknown",
    }),
  );
  res.status(500).json({ error: "server_error" });
}

const port = Number(process.env.PORT || 3000);

initDb()
  .then(() => {
    app.listen(port, () => {
      console.log(JSON.stringify({ event: "listen", port, store: storeName() }));
    });
  })
  .catch((error) => {
    console.log(
      JSON.stringify({
        event: "startup_failed",
        message: error instanceof Error ? error.message : "unknown",
      }),
    );
    process.exit(1);
  });
