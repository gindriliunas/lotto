import { randomInt, randomUUID } from "node:crypto";
import { query, withTransaction } from "./db.js";

export class PlayError extends Error {
  constructor(code) {
    super(code);
    this.code = code;
  }
}

export function londonToday(now = new Date()) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/London",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

export async function getSession(userId) {
  await ensureUser(userId);
  const today = londonToday();
  const credits = await query(
    `SELECT credits_remaining, last_reset_date::text AS last_reset_date
     FROM user_credits
     WHERE user_id = $1`,
    [userId],
  );
  const row = credits.rows[0];
  const creditsRemaining =
    !row || String(row.last_reset_date).slice(0, 10) < today
      ? 2
      : Number(row.credits_remaining);

  const jackpot = await query(
    `SELECT status, amount_pence FROM jackpot WHERE id = 1`,
  );
  const latest = await query(
    `SELECT id, outcome, prize_pence
     FROM plays
     WHERE user_id = $1
     ORDER BY id DESC
     LIMIT 1`,
    [userId],
  );
  const latestRow = latest.rows[0];

  return {
    creditsRemaining,
    jackpotAvailable: jackpot.rows[0].status === "available",
    jackpotPence: Number(jackpot.rows[0].amount_pence),
    latestPlay: latestRow
      ? {
          playId: Number(latestRow.id),
          outcome: latestRow.outcome,
          prizePence: Number(latestRow.prize_pence),
        }
      : null,
  };
}

export async function issueToken(userId) {
  const session = await getSession(userId);
  if (session.creditsRemaining <= 0) {
    throw new PlayError("no_credits");
  }

  const token = randomUUID();
  await query(
    `INSERT INTO play_tokens (token, user_id, expires_at)
     VALUES ($1, $2, NOW() + INTERVAL '2 minutes')`,
    [token, userId],
  );
  return { token, expiresInSeconds: 120 };
}

export async function play(userId, token) {
  if (typeof token !== "string" || token.length === 0) {
    throw new PlayError("token_rejected");
  }

  const today = londonToday();
  const result = await withTransaction(async (tx) => {
    await ensureUser(userId, tx, today);

    const consumed = await tx.query(
      `UPDATE play_tokens
       SET consumed_at = NOW()
       WHERE token = $1
         AND user_id = $2
         AND consumed_at IS NULL
         AND expires_at > NOW()
       RETURNING token`,
      [token, userId],
    );
    if (consumed.rows.length === 0) {
      throw new PlayError("token_rejected");
    }

    // One statement resets a stale day and spends a credit. Two requests cannot both pass.
    const updated = await tx.query(
      `UPDATE user_credits
       SET credits_remaining = CASE
             WHEN last_reset_date < $2::date THEN 2
             ELSE credits_remaining
           END - 1,
           last_reset_date = CASE
             WHEN last_reset_date < $2::date THEN $2::date
             ELSE last_reset_date
           END
       WHERE user_id = $1
         AND (last_reset_date < $2::date OR credits_remaining > 0)
       RETURNING credits_remaining`,
      [userId, today],
    );
    if (updated.rows.length === 0) {
      throw new PlayError("no_credits");
    }

    const draw = await drawOutcome(tx, userId);
    const inserted = await tx.query(
      `INSERT INTO plays (user_id, token, outcome, prize_pence)
       VALUES ($1, $2, $3, $4)
       RETURNING id, outcome, prize_pence`,
      [userId, token, draw.outcome, draw.prizePence],
    );

    return {
      playId: Number(inserted.rows[0].id),
      outcome: inserted.rows[0].outcome,
      prizePence: Number(inserted.rows[0].prize_pence),
      creditsRemaining: Number(updated.rows[0].credits_remaining),
    };
  });

  return result;
}

export async function getOwnedPlay(userId, playId) {
  const id = Number(playId);
  if (!Number.isInteger(id) || id <= 0) {
    return null;
  }
  const result = await query(
    `SELECT id, outcome, prize_pence, created_at
     FROM plays
     WHERE id = $1 AND user_id = $2`,
    [id, userId],
  );
  return result.rows[0] ?? null;
}

async function ensureUser(userId, executor = { query }, today = londonToday()) {
  await executor.query(
    `INSERT INTO users (id) VALUES ($1) ON CONFLICT (id) DO NOTHING`,
    [userId],
  );
  await executor.query(
    `INSERT INTO user_credits (user_id, credits_remaining, last_reset_date)
     VALUES ($1, 2, $2::date)
     ON CONFLICT (user_id) DO NOTHING`,
    [userId, today],
  );
}

async function drawOutcome(tx, userId) {
  const tiers = await tx.query(
    `SELECT name, weight, prize_pence, is_jackpot
     FROM prize_tiers
     ORDER BY id`,
  );
  const total = tiers.rows.reduce((sum, row) => sum + Number(row.weight), 0);
  if (total <= 0) {
    throw new Error("prize tiers are not configured");
  }

  const roll = randomInt(0, total);
  let cursor = 0;
  let picked = tiers.rows[tiers.rows.length - 1];
  for (const tier of tiers.rows) {
    cursor += Number(tier.weight);
    if (roll < cursor) {
      picked = tier;
      break;
    }
  }

  if (!picked.is_jackpot) {
    return { outcome: picked.name, prizePence: Number(picked.prize_pence) };
  }

  const locked = await tx.query(
    `SELECT status, amount_pence FROM jackpot WHERE id = 1 FOR UPDATE`,
  );
  if (locked.rows[0].status !== "available") {
    return { outcome: "lose", prizePence: 0 };
  }

  const claimed = await tx.query(
    `UPDATE jackpot
     SET status = 'claimed', claimed_by = $1, claimed_at = NOW()
     WHERE id = 1 AND status = 'available'
     RETURNING amount_pence`,
    [userId],
  );
  if (claimed.rows.length === 0) {
    return { outcome: "lose", prizePence: 0 };
  }

  return {
    outcome: "jackpot",
    prizePence: Number(claimed.rows[0].amount_pence),
  };
}
