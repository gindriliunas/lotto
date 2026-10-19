data "aws_caller_identity" "current" {}

data "aws_vpc" "lab" {
  id = var.vpc_id
}

data "aws_subnet" "private_a" {
  vpc_id     = data.aws_vpc.lab.id
  cidr_block = "172.51.2.0/24"
}

data "aws_subnet" "private_b" {
  vpc_id     = data.aws_vpc.lab.id
  cidr_block = "172.51.3.0/24"
}

data "aws_security_group" "tasks" {
  name   = "tasks"
  vpc_id = data.aws_vpc.lab.id
}

data "aws_lb" "app" {
  name = var.alb_name
}

data "aws_lb_listener" "https" {
  load_balancer_arn = data.aws_lb.app.arn
  port              = 443
}

data "aws_lb_target_group" "app" {
  name = "scratch-card"
}

data "aws_ecr_repository" "app" {
  name = "scratch-card"
}

data "aws_acm_certificate" "london" {
  domain      = var.domain_name
  statuses    = ["ISSUED"]
  most_recent = true
}

data "aws_db_instances" "all" {}

data "aws_db_instance" "app" {
  db_instance_identifier = one(data.aws_db_instances.all.instance_identifiers)
}

data "aws_cognito_user_pool" "players" {
  user_pool_id = var.user_pool_id
}

data "aws_iam_role" "github" {
  name = "gindriliunas"
}

locals {
  db_secret_arn = data.aws_db_instance.app.master_user_secret[0].secret_arn
}
