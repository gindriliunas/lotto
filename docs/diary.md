# Diary

17 October 2026. A practice scratch card. The game runs on this computer first. AWS comes later, built by hand.

Later chats add the next step here when work in this project is finished.

## Step 1. Create the local app

The folder was empty. A small Node app was added so the game can be played without AWS.

```bash
npm install
npm run dev
```

Open http://localhost:3000. Sign-in is skipped on this computer. The player is `local-player`.

What the app does:

- Each person gets two plays a day. A third play is refused.
- The server decides the prize. The page only shows the foil.
- There is one £1,000,000 jackpot. Only the first claim wins it.
- Scores are saved in a local folder, `.data/`, so they survive a restart.

`npm run check` repeats those rules on a throwaway copy of the data.

A short AWS guide was written at the same time, in `docs/aws-lab.md`. It is notes for later, not something that was switched on. The only AWS files in the repo are two private S3 buckets in `infra/s3`, plus a GitHub check that fails if a bucket is made public.

## Step 2. Create the GitHub repo

A public repo was created: https://github.com/gindriliunas/lotto

It is empty. The code on this computer has not been pushed.

Two reasons:

- The browser may be signed in as `onchaindre`. The repo is under `gindriliunas`.
- This project folder is not its own git repo. Git was started in the home folder instead, so the Lotto files were never sent to GitHub.

## Step 3. Save a ticket picture

A **Save screenshot** button was added under the card. The server draws the picture from the saved play and stores it for that player. On this computer the file goes in `.data/tickets/`. On AWS it would go in a second private bucket. The page cannot upload its own picture of a win.

## Step 4. Fix the empty picture

The saved file was a real image. The page still showed a broken box, because a style rule ignored `hidden` and left an empty image on screen. That rule was fixed. Refresh the page and the last ticket shows under the button.

## Step 5. Draw the design

A high-level picture and three data flows were added: one play, saving a screenshot, and sign-in. They are in `docs/diagrams.md`.

## Step 6. Prove GitHub can assume the AWS role

The role `gindriliunas` was created by hand in AWS and trusted to this repo. The first Deploy runs were denied. GitHub sends a subject with the user id, the repo id, and `environment:production`, and the trust policy had an older subject. After the policy used `repo:gindriliunas@213284389/lotto@1423209416:environment:production`, the run printed `arn:aws:sts::631026310596:assumed-role/gindriliunas/GitHubActions`. That workflow lives on GitHub, not in this folder.

## Step 7. Protect the default branch

A ruleset on https://github.com/gindriliunas/lotto now targets the default branch, `main`. A change has to arrive as a pull request. The bypass list is empty, so the owner is included. Secret scanning, push protection, and Dependabot alerts are on. No status check is required yet, because the Trivy workflow is not on that repo.

## Step 8. Add the six security scans

`.github/workflows/security.yml` runs SAST, SCA, Terraform, container, secret, and DAST on a pull request and on `main`. Semgrep, Trivy, Gitleaks, and OWASP ZAP each fail the check on a serious finding. The Terraform job still refuses a public S3 bucket. This file is in the project folder. It runs on GitHub after a pull request puts it on `main`.

## Step 9. Push the project

This folder is now its own git repo. The home-folder repo was left alone. `main` on GitHub refuses a direct push, so the app and the scans went to the branch `add-scratch-card`. The pull request is https://github.com/gindriliunas/lotto/pull/1. It keeps the Deploy workflow that was already on GitHub.

## Step 10. Send scan results to the Security tab

Each of the six jobs now writes a SARIF report and uploads it. On the pull request the findings show against the change. They appear in the repository Security tab after the workflow runs on `main`. ZAP's own report is JSON, and `scripts/zap-json-to-sarif.mjs` converts it.

## Step 11. Open a second pull request

Pull request 1 was merged before the SARIF upload was pushed, so that change was not on `main`. It is now in https://github.com/gindriliunas/lotto/pull/2.

## Step 12. Fix the Semgrep command

The SAST job failed before it scanned anything. The Semgrep image does not provide a `scan` command, so the workflow now runs `semgrep scan`.

## Step 13. Remove npm from the runtime image

The container scan failed on high vulnerabilities in `brace-expansion`, `picomatch`, `sigstore`, `ip-address`, and `pacote`. Those packages belong to the npm client shipped in `node:22-alpine`, not to the app. The image now deletes npm after `npm ci`, because the running task only needs `node`.

## Step 14. Point ZAP findings at a file

GitHub refused the DAST report because each location was an `http` address. The URL stays in the finding text. The location is now `src/server.js`, which is the process ZAP scanned.

## Step 15. Scans pass

Pull request 2 is merged. SAST, SCA, Terraform, Container, Secret, and DAST all passed, and the SARIF uploads passed too. GitHub for this lab is in place. The next work is the AWS build below.

## Step 16. Show the zones and the NAT gateway

The high-level diagram in `docs/diagrams.md` now shows two Availability Zones, one NAT gateway, and the restriction on each part.

## Step 17. Name the hierarchy

The high-level design now states the order account, region, VPC, availability zone, subnet, and maps each level to this lab.

## Step 18. Draw the account around the regions

The high-level diagram in `docs/diagrams.md` now draws the AWS account as the outer box. `us-east-1` and `eu-west-2` sit inside it, and the VPC sits inside London.

## Step 19. Add certificates, ports, and security groups

The high-level design now shows both certificates, the port on each hop, and the three security groups: 443 from CloudFront, 3000 from the load balancer, and 5432 from the tasks.

## Step 20. Create the database

The London VPC now has the four subnets, one NAT gateway, the three security groups, and a PostgreSQL database in the private subnets. The password is in Secrets Manager. Rotation of that secret is still to be turned on.

## Step 21. Rotate the database password

Secrets Manager rotation is on for the RDS secret, every 7 days.

## Step 22. Create the image repository

The private ECR repository `scratch-card` is in `eu-west-2`. Basic scanning is on, and a push to that repository is scanned automatically. The repository is empty because Docker is not installed on this computer.

## Step 23. Issue the London certificate

AWS issued the `eu-west-2` certificate for `gindr.com`. The validation CNAME is in the DNS host that the domain actually uses.

## Step 24. Create the load balancer

The application load balancer is in the two public subnets, with the `alb` security group and the London certificate on port 443. It forwards to the target group `scratch-card`. Cognito is not on the listener yet.

## Step 25. Describe the rest in Terraform

`infra/state` created the private bucket `lotto-terraform-state-631026310596`, and `infra/platform` keeps its state there. Apply attached Cognito and the origin check to the existing load balancer, and created the private buckets, ECS service, WAF, and deploy permission. The `us-east-1` certificate for `gindri.com` is issued. CloudFront was refused because this AWS account is not verified for new CloudFront resources. GuardDuty was adopted. The account already has a CloudTrail named `management-events`.

## Step 26. Explain the app in the README

`README.md` now says what the scratch card is, how a play and a screenshot work, and shows the high-level design plus the three data flows. The security section matches what is already on: the server-side draw, GitHub checks, the network, and the Terraform stack. CloudFront is described as waiting on account verification.

## Step 27. Deploy after the security checks

The Deploy workflow starts when the Security workflow succeeds on a push to `main`. A pull request still only runs the scans. The job keeps the `production` environment so the AWS role trust still matches.

## Step 28. Draft the 15-minute talk

A slide deck for the security walk-through is beside the chat. Canva is not connected from this session, so the slides are a canvas rather than a Canva file.

## Step 29. Match the talk to the brief

The 15-minute deck now follows the requested order: architecture, threats, GitHub, the pipeline, AWS, secrets, monitoring, and residual risk. The assumptions are on the first slide.

## Step 30. Write the Cursor prompt and the AWS finish line

`docs/cursor-prompt.md` is the app spec, written as the prompt that produces `src/`, `public/`,
`scripts/`, and the `Dockerfile` from nothing, with the reasoning for each rule kept next to the
rule. `docs/aws-next-steps.md` is the three real items still open in the account: the CloudFront
account verification, the `gindri.com` name-server cutover, and pushing the first image to turn the
ECS service on. Both stay out of `infra/` and `.github/` on purpose.

## Step 31. Pin the deploy to the image that was scanned

Deploy builds one image, scans it, and pushes the commit tag. The service then runs `scratch-card@sha256:...`. ECR tags are immutable, and a manual Deploy run no longer skips the scans. Signing the image is still to do.

## Not done yet

GitHub leftovers:

- Confirm the ruleset requires **Reject a bucket that is not private**. The screen that was saved showed SAST, DAST, SCA, Secret, Container, and the Trivy code-scanning result.
- On the `production` environment, allow deployments from `main` only.
- Set Actions workflow permissions to read-only.
- Turn on MFA for `gindriliunas` if it is not already on.
- Add `npm run check` to `.github/workflows/security.yml`.
- Move `github/codeql-action/upload-sarif` from v3 to v4.
- Sign the image with cosign and verify the signature before Deploy registers the task definition.

AWS, in this order. The settings are in `docs/aws-lab.md`.

1. VPC. Done.
2. Three security groups. Done.
3. RDS and password rotation. Done.
4. ECR repository and scan on push. Done. The image is pushed from GitHub, then ECS: circuit breaker, no public address on the task.
5. Ask AWS Support to verify the account for CloudFront, then run `terraform -chdir=infra/platform apply` again. That creates the distribution and the artwork bucket policy.
6. Point `gindri.com` at `ns-1877.awsdns-42.co.uk`, `ns-81.awsdns-10.com`, `ns-943.awsdns-53.net`, and `ns-1406.awsdns-47.org`, or the site stays on the current DNS host.
7. After this change is on `main`, a passing Security run starts Deploy. Set `desired_count` above 0 or the rolled service still has no tasks.


