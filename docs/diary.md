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


