# Cursor build prompt — the scratch-card app

This is the prompt that reproduces `src/`, `public/`, `scripts/`, `Dockerfile`, and `package.json`
exactly as they stand in this repo. It does **not** touch `infra/`, `.github/`, or anything in AWS —
that is the part you are building by hand in the console, on purpose, so paste this into Cursor
only for the application code.

Use it two ways: paste it into a fresh Cursor session against an empty repo to rebuild the app from
nothing, or read it on its own as the spec — every line is a decision you need to be able to defend
live on Friday, not just something that happened to get generated.

---

## The prompt

> Build a small Node.js web app called a "scratch card." It is a demo for a DevSecOps interview, not
> a real gambling product, so keep it small and readable — one Express process, no framework beyond
> that, no build step for the frontend.
>
> **Rules of the game, enforced only on the server:**
> - Each signed-in user gets 2 plays per calendar day, measured in the `Europe/London` timezone. A
>   3rd play in the same day is refused with HTTP 409.
> - There are three weighted outcomes: lose (70%), a small £2 win (25%), and a jackpot attempt (5%).
>   The draw uses `crypto.randomInt`, never `Math.random`.
> - There is exactly one £1,000,000 jackpot. The first play that rolls the jackpot outcome *and*
>   finds the jackpot still available wins it. Every roll after that is stored as an ordinary loss,
>   even though it rolled the same 5% branch.
> - The page is the scratch foil only. It never computes or guesses the prize — it calls the server
>   and renders whatever the server already decided.
>
> **Why a one-time play token, not just "call /api/play":**
> - `POST /api/play-token` checks the user still has a credit and, if so, inserts a token row with a
>   2-minute expiry. It does **not** spend the credit yet.
> - `POST /api/play` takes that token and, in **one SQL transaction**: consumes the token (`UPDATE
>   ... SET consumed_at ... WHERE token = $1 AND consumed_at IS NULL`), spends the daily credit with
>   the conditional `UPDATE` below, draws the outcome, and — if the outcome is a jackpot attempt —
>   locks and claims the single jackpot row with `SELECT ... FOR UPDATE`.
> - If the token was already consumed, or the credit update matches zero rows, roll the whole
>   transaction back and return 409. This closes the double-submit and the double-tab race on the
>   last credit of the day — there is no window where two concurrent requests can both succeed.
>
> The credit spend, as one statement (this is the one line in the whole app that is worth staring
> at until you can explain why it's safe under concurrency):
> ```sql
> UPDATE user_credits
> SET credits_remaining = CASE
>       WHEN last_reset_date < $2::date THEN 2
>       ELSE credits_remaining
>     END - 1,
>     last_reset_date = CASE
>       WHEN last_reset_date < $2::date THEN $2::date
>       ELSE last_reset_date
>     END
> WHERE user_id = $1
>   AND (last_reset_date < $2::date OR credits_remaining > 0)
> RETURNING credits_remaining;
> ```
> There is no cron job that resets credits at midnight. The reset is lazy: it happens inside this
> same `UPDATE`, the next time that person plays after their last-reset date has passed. Explain why
> that's deliberate: a midnight job is one more thing to deploy, monitor, and get right across a
> timezone change; folding the reset into the write that already has to be atomic removes a moving
> part instead of adding one.
>
> **Database schema** (`src/schema.sql`, run as idempotent `CREATE TABLE IF NOT EXISTS` on startup —
> acceptable for a lab; call out in review that production runs migrations as a separate one-off task
> so a bad migration doesn't fire on every replica at boot):
> - `users(id TEXT PRIMARY KEY, created_at)` — id is the Cognito `sub`, never a self-chosen value.
> - `user_credits(user_id PK/FK, credits_remaining INT, last_reset_date DATE)`.
> - `play_tokens(token TEXT PK, user_id FK, expires_at, consumed_at NULLABLE)`.
> - `plays(id BIGSERIAL PK, user_id FK, token UNIQUE, outcome TEXT, prize_pence INT, created_at)` —
>   this table is the audit trail: who played, which token, what they were paid.
> - `prize_tiers(id PK, name, weight INT, prize_pence INT, is_jackpot BOOL)` — seeded 70/25/5 as
>   above. Odds live here, in data, not in an environment variable and not in the client, because a
>   change to the odds should go through a pull request and a reviewer, exactly like a code change.
> - `jackpot(id PK CHECK (id = 1), amount_pence, status CHECK (status IN ('available','claimed')),
>   claimed_by, claimed_at)` — a single-row table so `SELECT ... FOR UPDATE` on `id = 1` is an
>   unambiguous lock.
>
> **Authentication (`src/auth.js`) — do not build a login page:**
> - In AWS, the Cognito login happens on the load balancer listener, not in this app. The app only
>   ever sees the result: the ALB decodes the session and forwards a signed JWT to the app in the
>   `x-amzn-oidc-data` header. Nothing about Cognito — not the client secret, not the password — ever
>   reaches this process.
> - Verify that header yourself, don't trust it blindly: split the JWT, decode the header and payload
>   as base64url JSON, require `alg === "ES256"` and a `kid`, require `exp` to be a number in the
>   future, and — when `ALB_ARN` is set — require the payload's `signer` claim to equal it (so a
>   token minted for a *different* load balancer in the account is rejected). Fetch the region's ELB
>   public key for that `kid` from `https://public-keys.auth.elb.<region>.amazonaws.com/<kid>`, cache
>   it by `kid`, and verify the signature over `header.payload` with `node:crypto`'s `verify` using
>   `dsaEncoding: "ieee-p1363"` (ALB's ES256 signatures are raw r||s, not ASN.1 DER — this is the one
>   detail that silently fails if you skip it). On any failure, throw a dedicated `AuthError` and
>   respond 401; never fall through to a default user.
> - Local development path: when `NODE_ENV === "development"`, skip all of the above and return
>   `{ sub: process.env.DEV_AUTH_SUB || "local-player" }`. Make the production code path physically
>   unable to take this shortcut — gate it on `NODE_ENV`, and have the server **refuse to start** in
>   production if neither `DB_SECRET_ARN` nor `DATABASE_URL` is set, so a misconfigured prod deploy
>   fails loudly at boot instead of silently running as `local-player`.
>
> **Database connection (`src/db.js`):**
> - Local dev with no `DATABASE_URL` set: use `@electric-sql/pglite` so the whole thing runs with
>   zero external services, persisted to `.data/` (or `.data-check/` for the test script) — this is
>   why `npm install && npm run dev` works with no Docker, no Postgres, nothing else installed.
> - Anything else: connect to real PostgreSQL over TLS with the `pg` driver, using the bundled RDS CA
>   certificate. Read the password from AWS Secrets Manager via `DB_SECRET_ARN`
>   (`@aws-sdk/client-secrets-manager`) rather than from `DATABASE_URL` directly in AWS — don't wire
>   up a code path that lets AWS also take a plaintext `DATABASE_URL` in production. If a query fails
>   with Postgres error `28P01` (bad password), re-fetch the secret once and retry the connection —
>   this is what makes RDS's automatic password rotation transparent: no redeploy needed when the
>   password rotates out from under a running task.
>
> **Ticket screenshots (`src/ticket-image.js`, `src/tickets.js`):**
> - `POST /api/plays/:id/screenshot` loads the `plays` row **only if `user_id` matches the
>   authenticated `sub`** — any other id, including a real play id belonging to someone else, is a
>   404, not a 403 (don't confirm the row exists to someone who doesn't own it).
> - Draw the ticket PNG server-side from that row's stored outcome and prize, using `pngjs`. The
>   browser never uploads a picture — there's nothing to validate or spoof on the way in.
> - Store it: if `TICKET_BUCKET` is set, `PutObject` to S3 at key `tickets/{user_id}/{play_id}.png`
>   via `@aws-sdk/client-s3`; otherwise write it under `.data/tickets/{user_id}/{play_id}.png` for
>   local dev. `GET` the same way, checking ownership again before returning the image.
>
> **HTTP surface (`src/server.js`, Express):**
> - `GET /health` — the only route that skips authentication and never touches the database. It
>   exists purely so an ALB target-group health check (which cannot log in) can mark the task healthy.
> - Every other route calls `authenticate(req)` first and returns 401 on failure.
> - `POST /api/play-token`, `POST /api/play`, `GET /api/plays`, `POST /api/plays/:id/screenshot`,
>   `GET /api/plays/:id/screenshot`.
> - Structured JSON logs, one line per event, via plain `console.log(JSON.stringify(...))` — no
>   logging framework needed for something this small. A play log line carries `event`, `userId`,
>   `playId`, `outcome`, `prizePence`. It must **never** include the play token (that's a bearer
>   credential for the 2-minute window it's valid). An unexpected failure logs `event: "error"`. These
>   fields are what the CloudWatch alarms in `infra/platform/ops.tf` and the "Monitoring and
>   operations" section of `docs/aws-lab.md` are written against — the log format and the alarms are
>   not independent design choices, keep them in sync.
>
> **Frontend (`public/`):** one static HTML page, one small vanilla JS file (`scratch.js`), one CSS
> file. No framework, no bundler. It calls the API above and renders the result; it holds no game
> logic worth naming.
>
> **Local dev loop:**
> - `npm run dev` → `NODE_ENV=development node --watch src/server.js`, PGlite-backed, `local-player`.
> - `npm run check` → `scripts/verify-local.mjs` against a throwaway `.data-check/`, replaying: two
>   plays succeed and a third is refused; replaying the same token is refused; the prize on the
>   card equals the prize in the `/api/play` response (the page never rolls its own number); the
>   jackpot pays out exactly once across repeated jackpot-tier rolls.
>
> **`Dockerfile`:** multi-stage, `node:22-alpine`. In the final runtime stage, after `npm ci`,
> **delete the npm client itself** (the app only ever calls `node`, not `npm`, at runtime) — this
> removes `brace-expansion`, `picomatch`, `sigstore`, `ip-address`, and `pacote`, which is where a
> container scan (Trivy) finds high-severity CVEs that belong to npm's own vendored dependencies, not
> to this app. Run as a non-root user. `.dockerignore` excludes `node_modules`, `.data*`, `.git`.
>
> **Environment variables this app reads** — list every one explicitly, and treat all of them as
> optional-in-dev, required-in-prod where noted:
> `NODE_ENV`, `DEV_AUTH_SUB` (dev only), `DATABASE_URL` (dev only — never set in AWS),
> `DB_SECRET_ARN` (prod — Secrets Manager ARN for the RDS credential), `AWS_REGION`,
> `TICKET_BUCKET`, `ALB_ARN` (prod — the signer check in `auth.js`), `PORT` (default 3000).
>
> **Do not:**
> - Do not write any Terraform, GitHub Actions YAML, or anything under `infra/` or `.github/` — that
>   is handled separately and on purpose by hand.
> - Do not add a client-side random number anywhere, even for a "preview" animation — if the foil
>   animation needs a number before the server responds, make it cosmetic and overwrite it with the
>   server's real outcome the moment the response arrives.
> - Do not log the play token, the Cognito JWT, or any value read from Secrets Manager.
> - Do not add a default/fallback user id that's reachable outside `NODE_ENV === "development"`.

---

## Why this is written as "the prompt," not "the code"

If you're using this as interview prep rather than actually rebuilding: the point of writing it this
way is that every paragraph above pairs a *requirement* with the *reason*, which is exactly the shape
the brief is asking you to defend in the room — "we are interested in your reasoning and security
decisions, not simply the number of security technologies you can identify." If you can re-derive
this prompt from memory without re-reading it, you can answer "why didn't you just use
`Math.random()`" or "why is the credit update one UPDATE instead of a read-then-write" without
hesitating.
