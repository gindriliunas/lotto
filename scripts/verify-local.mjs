import { rm } from "node:fs/promises";
import { AuthError, authenticate } from "../src/auth.js";
import { closeDb, initDb, query } from "../src/db.js";
import { PlayError, getSession, issueToken, play } from "../src/play.js";
import { readScreenshot, saveScreenshot } from "../src/tickets.js";

const userId = "local-player";

await rm(".data-check", { recursive: true, force: true });
await initDb();

const session = await getSession(userId);
assert(session.creditsRemaining === 2, "a new player starts with 2 plays");

const first = await issueToken(userId);
const firstPlay = await play(userId, first.token);
assert(firstPlay.creditsRemaining === 1, "the first play leaves 1 credit");
await expectReject(play(userId, first.token), "token_rejected");

const afterFirst = await getSession(userId);
assert(afterFirst.latestPlay.playId === firstPlay.playId, "the session keeps the latest ticket");
const saved = await saveScreenshot(userId, firstPlay.playId);
assert(saved.key.endsWith(`${firstPlay.playId}.png`), "screenshot key names the play");
const png = await readScreenshot(userId, firstPlay.playId);
assert(png[0] === 0x89 && png[1] === 0x50 && png[2] === 0x4e && png[3] === 0x47, "screenshot is a png");
await expectReject(readScreenshot("someone-else", firstPlay.playId), "not_found");

const second = await issueToken(userId);
const secondPlay = await play(userId, second.token);
assert(secondPlay.creditsRemaining === 0, "the second play spends the last credit");
await expectReject(issueToken(userId), "no_credits");

await query(
  `UPDATE user_credits
   SET credits_remaining = 0, last_reset_date = DATE '2000-01-01'
   WHERE user_id = $1`,
  [userId],
);
const resetToken = await issueToken(userId);
const afterReset = await play(userId, resetToken.token);
assert(afterReset.creditsRemaining === 1, "a new London day restores 2 plays and then spends 1");

const otherToken = await issueToken("someone-else");
await expectReject(play(userId, otherToken.token), "token_rejected");
const otherPlay = await play("someone-else", otherToken.token);
assert(otherPlay.playId > 0, "a token still works for the user it was issued to");

await query(
  `UPDATE jackpot
   SET status = 'available', claimed_by = NULL, claimed_at = NULL
   WHERE id = 1`,
);
await query(`DELETE FROM prize_tiers WHERE is_jackpot = FALSE`);
const jackpotToken = await issueToken(userId);
const jackpotPlay = await play(userId, jackpotToken.token);
assert(jackpotPlay.outcome === "jackpot", "the only remaining tier awards the jackpot");
assert(jackpotPlay.prizePence === 100000000, "the jackpot prize is £1,000,000");

const missedToken = await issueToken("someone-else");
const missed = await play("someone-else", missedToken.token);
assert(missed.outcome === "lose", "a second jackpot roll is stored as a loss");
assert(missed.prizePence === 0, "a missed jackpot pays nothing");

process.env.NODE_ENV = "production";
process.env.DEV_AUTH_SUB = "should-be-ignored";
await expectReject(authenticate({ get: () => undefined }), "unauthenticated");

await closeDb();
await rm(".data-check", { recursive: true, force: true });
console.log("local rules ok");

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

async function expectReject(promise, code) {
  try {
    await promise;
  } catch (error) {
    if (error instanceof PlayError || error instanceof AuthError) {
      assert(error.code === code, `expected ${code}, received ${error.code}`);
      return;
    }
    throw error;
  }
  throw new Error(`expected ${code}`);
}
