# Scratch card diagrams

The same pictures are in the design canvas. These copies stay in the repo.

## High-level design

`eu-west-2` holds the app and the database. CloudFront, its certificate, and the WAF are in `us-east-1`.

```mermaid
flowchart LR
  browser[Browser] --> route53[Route53]
  route53 --> cloudfront[CloudFront]
  cloudfront --> waf[WAF]
  waf --> alb[ALB_Cognito]
  alb --> ecs[ECS_Fargate]
  ecs --> rds[RDS]
  cloudfront -->|"OAC read"| artwork[S3_artwork]
  ecs -->|"task role"| tickets[S3_tickets]
  ecs --> secrets[SecretsManager]
  alb --> cognito[Cognito]
```

Public subnets hold the load balancer and one NAT gateway. Tasks and RDS have no public address. The artwork bucket is readable only by this CloudFront distribution. The ticket bucket is not.

## Data flow: one play

```mermaid
sequenceDiagram
  participant Page
  participant ALB
  participant App
  participant RDS
  Page->>ALB: POST /api/play-token
  ALB->>App: x-amzn-oidc-data
  App->>RDS: Insert a one-time token if a credit remains
  Page->>ALB: POST /api/play with the token
  ALB->>App: Forward the same signed user
  App->>RDS: Consume the token and decrement the credit
  App->>RDS: Draw from prize_tiers and lock the jackpot if needed
  App->>RDS: Insert the play row
  App-->>Page: Prize already decided
```

A third play the same London day updates no credit row. Sending the same token again rolls the transaction back.

## Data flow: save screenshot

```mermaid
sequenceDiagram
  participant Page
  participant App
  participant RDS
  participant Tickets as S3_tickets
  Page->>App: POST /api/plays/id/screenshot
  App->>RDS: Load the play only if this user owns it
  App->>App: Draw the PNG from that row
  App->>Tickets: PutObject under tickets/user/id.png
  Page->>App: GET the same screenshot
  App->>Tickets: GetObject
  App-->>Page: image/png
```

The browser never uploads the picture. Locally, with `TICKET_BUCKET` unset, the file is written under `.data/tickets/` instead of S3.

## Data flow: sign-in

```mermaid
sequenceDiagram
  participant Browser
  participant CloudFront
  participant ALB
  participant Cognito
  participant App
  Browser->>CloudFront: GET scratch.example.com
  CloudFront->>ALB: Forward the viewer host
  ALB->>Browser: Redirect to the hosted UI
  Browser->>Cognito: Sign in
  Cognito->>Browser: Redirect to /oauth2/idpresponse
  Browser->>ALB: Callback with the code
  ALB->>Browser: Session cookie
  Browser->>ALB: Later play request
  ALB->>App: x-amzn-oidc-data
  App->>App: Verify the ELB signature and signer
```

`/health` is the only path that skips Cognito, because the load balancer health check cannot log in.
