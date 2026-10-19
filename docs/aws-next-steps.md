# Finishing the AWS build by hand

`docs/aws-lab.md` is the full build log — every piece that already exists in account
`631026310596` (`eu-west-2`), why it's there, and the console/CLI steps that created it. Re-read
that before Friday; this file is only the three things left on the punch list in `docs/diary.md`,
written as exact next actions so you don't have to reconstruct them under pressure.

All three are real actions against your real account. Nothing here runs itself — do each one
yourself, in order, because each depends on the one before it.

## 1. Get the account verified for CloudFront, then apply

`terraform -chdir=infra/platform apply` already failed once because this AWS account isn't yet
verified to create new CloudFront distributions — this is an anti-abuse check AWS runs on new or
low-usage accounts, not something wrong with the Terraform.

1. Console → **Support Center** → **Create case** → **Account and billing support** → category
   **Billing** → **Other Account and Billing Questions**, or look for the exact banner AWS shows:
   accounts blocked for this reason usually get a specific "CloudFront access" self-service
   verification flow under **Billing and Cost Management → Account**, rather than needing a ticket
   at all — check there first, it's often instant once you confirm a card/contact details.
2. If it routes to a support case, say plainly: *"My account can't create a CloudFront
   distribution — requesting verification to use CloudFront."* Response time is typically same-day
   to 24h on Basic support.
3. Once verified, re-run:
   ```bash
   terraform -chdir=infra/platform apply
   ```
   This single apply is what creates: the CloudFront distribution, the Origin Access Control, the
   artwork bucket's CloudFront-read policy (it's written with a `depends_on` the distribution, so it
   couldn't apply before now), and the Route 53 alias record pointing `gindri.com` at the
   distribution. Expect it to also pick up anything else that was only half-applied in the last run —
   read the plan before confirming, don't `-auto-approve` this one.
4. Capture the output you need for step 2 below:
   ```bash
   terraform -chdir=infra/platform output name_servers
   ```

**Say out loud in the room, if asked why this took real-world calendar time:** this is the shared
responsibility model showing up operationally, not just in a slide — a cloud account's own anti-abuse
controls are part of the environment you're deploying into, and a realistic delivery plan accounts
for them instead of assuming `terraform apply` is always synchronous with "done."

## 2. Point `gindri.com` at Route 53

The `aws_route53_zone` in `dns.tf` already exists and already holds (after step 1) the alias record
to CloudFront and the validation records for the `us-east-1` certificate. It isn't serving anything
yet because the domain's registrar still points at its current DNS host, not at Route 53.

1. Take the four name servers from `terraform output name_servers` in step 1.
2. At whichever registrar holds `gindri.com` today, replace its name server records with those four
   `awsdns-*` values.
3. Propagation is registrar- and resolver-dependent — budget minutes to low hours, not instant.
   Confirm with:
   ```bash
   dig NS gindri.com +short
   dig gindri.com +short      # should eventually resolve to CloudFront, not the old host
   ```

Don't do this before step 1's apply has actually created the alias record — until then, cutting
over the name servers just points `gindri.com` at an empty Route 53 zone instead of your current
site.

## 3. Push the first image and turn the service on

Two separate things have to both happen — a Terraform variable, and an actual image — and the order
matters less than knowing they're separate:

**The image**, via the pipeline that's already built and already passing (`docs/diary.md` steps
8–15, 27): merge whatever branch currently has the app (`terraform-platform`, or wherever you land
after this) into `main` through a pull request. `security.yml` runs the six scans; if they pass,
`deploy.yml` assumes `arn:aws:iam::631026310596:role/gindriliunas` via OIDC, scans the image it
built, pushes the commit tag, and registers a task definition pinned to that digest. You will hit the `production`
environment's required reviewer — that's the gap already written down under residual risk (you're
both the approver and the requester in this lab; say that plainly if it comes up).

That push alone does **not** start any tasks — `aws_ecs_service.app.desired_count` is driven by
`var.desired_count`, which defaults to `0` specifically so the service doesn't try to run before an
image exists (`variables.tf`: *"Leave at 0 until the scratch-card image has been pushed."*).

**Turning the service on**, once the image exists in ECR — pick one, and know you picked it:

- *The Terraform-consistent way* (recommended — keeps state and reality matching): set
  `desired_count = 1` in a `terraform.tfvars` (or pass `-var desired_count=1`) and
  `terraform -chdir=infra/platform apply` again.
- *The console way, if you specifically want to click it by hand to narrate what's happening*:
  ECS → cluster `scratch-card` → service `scratch-card` → **Update service** → desired tasks → `1`
  → **Update**. Say out loud that you know this drifts from the Terraform variable, and that the
  next `terraform apply` would silently scale it back to 0 unless you also update `variables.tf` —
  that's a real gotcha worth naming unprompted rather than waiting to be asked about drift.

Watch the rollout: **ECS → service → Tasks**, confirm the task reaches `RUNNING` and the target
group shows it `healthy` against `GET /health`. The deployment circuit breaker (already on, in
`compute.tf`) will roll the service back on its own if the task fails that health check — a good
thing to deliberately demonstrate once, by pushing a build that fails `/health`, if you have time
before Friday.

## What's deliberately not in this file

The GitHub leftovers (ruleset check name, `production` environment restricted to `main`, Actions
read-only token permissions, MFA, `npm run check` wired into CI, the CodeQL action version bump) are
config toggles in GitHub's UI, already itemized at the bottom of `docs/diary.md` — there isn't a
dependency chain between them worth a separate runbook, just work the list.

Tearing the whole stack down afterward (NAT gateway, ALB, Multi-AZ RDS, Fargate, WAF — on the order
of £80–150/month if left running) is already covered in `docs/aws-lab.md` under **"Deploy, and what
to delete."** Don't forget it once the interview's done.
