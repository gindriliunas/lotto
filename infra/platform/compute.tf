resource "aws_lb_listener_rule" "health" {
  listener_arn = data.aws_lb_listener.https.arn
  priority     = 10

  action {
    type             = "forward"
    target_group_arn = data.aws_lb_target_group.app.arn
  }

  condition {
    path_pattern {
      values = ["/health"]
    }
  }
}

resource "aws_lb_listener_rule" "authenticated" {
  listener_arn = data.aws_lb_listener.https.arn
  priority     = 20

  action {
    type = "authenticate-cognito"

    authenticate_cognito {
      user_pool_arn              = data.aws_cognito_user_pool.players.arn
      user_pool_client_id        = aws_cognito_user_pool_client.alb.id
      user_pool_domain           = var.cognito_domain_prefix
      on_unauthenticated_request = "authenticate"
      scope                      = "openid email"
      session_timeout            = 604800
    }
  }

  action {
    type             = "forward"
    target_group_arn = data.aws_lb_target_group.app.arn
  }

  condition {
    http_header {
      http_header_name = "X-Origin-Verify"
      values           = [random_password.origin_verify.result]
    }
  }
}

resource "aws_lb_listener_rule" "reject_direct" {
  listener_arn = data.aws_lb_listener.https.arn
  priority     = 500

  action {
    type = "fixed-response"

    fixed_response {
      content_type = "text/plain"
      message_body = "Forbidden"
      status_code  = "403"
    }
  }

  condition {
    path_pattern {
      values = ["/*"]
    }
  }
}

resource "aws_cloudwatch_log_group" "app" {
  name              = "/ecs/scratch-card"
  retention_in_days = 14
}

resource "aws_iam_role" "execution" {
  name = "scratch-card-execution"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect    = "Allow"
        Principal = { Service = "ecs-tasks.amazonaws.com" }
        Action    = "sts:AssumeRole"
      },
    ]
  })
}

resource "aws_iam_role_policy_attachment" "execution" {
  role       = aws_iam_role.execution.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AmazonECSTaskExecutionRolePolicy"
}

resource "aws_iam_role" "task" {
  name = "scratch-card-task"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect    = "Allow"
        Principal = { Service = "ecs-tasks.amazonaws.com" }
        Action    = "sts:AssumeRole"
      },
    ]
  })
}

resource "aws_iam_role_policy" "task" {
  name = "scratch-card-task"
  role = aws_iam_role.task.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid      = "ReadDatabaseSecret"
        Effect   = "Allow"
        Action   = "secretsmanager:GetSecretValue"
        Resource = local.db_secret_arn
      },
      {
        Sid      = "TicketScreenshots"
        Effect   = "Allow"
        Action   = ["s3:PutObject", "s3:GetObject"]
        Resource = "${aws_s3_bucket.tickets.arn}/*"
      },
    ]
  })
}

resource "aws_ecs_cluster" "app" {
  name = "scratch-card"
}

resource "aws_ecs_task_definition" "app" {
  family                   = "scratch-card"
  requires_compatibilities = ["FARGATE"]
  network_mode             = "awsvpc"
  cpu                      = "256"
  memory                   = "512"
  execution_role_arn       = aws_iam_role.execution.arn
  task_role_arn            = aws_iam_role.task.arn

  container_definitions = jsonencode([
    {
      name      = "scratch-card"
      image     = "${data.aws_ecr_repository.app.repository_url}:latest"
      essential = true
      portMappings = [
        {
          containerPort = 3000
          protocol      = "tcp"
        },
      ]
      environment = [
        { name = "NODE_ENV", value = "production" },
        { name = "AWS_REGION", value = "eu-west-2" },
        { name = "DB_SECRET_ARN", value = local.db_secret_arn },
        { name = "TICKET_BUCKET", value = aws_s3_bucket.tickets.bucket },
        { name = "ALB_ARN", value = data.aws_lb.app.arn },
      ]
      logConfiguration = {
        logDriver = "awslogs"
        options = {
          awslogs-group         = aws_cloudwatch_log_group.app.name
          awslogs-region        = "eu-west-2"
          awslogs-stream-prefix = "app"
        }
      }
    },
  ])
}

resource "aws_ecs_service" "app" {
  name            = "scratch-card"
  cluster         = aws_ecs_cluster.app.id
  task_definition = aws_ecs_task_definition.app.arn
  desired_count   = var.desired_count
  launch_type     = "FARGATE"

  deployment_circuit_breaker {
    enable   = true
    rollback = true
  }

  network_configuration {
    subnets          = [data.aws_subnet.private_a.id, data.aws_subnet.private_b.id]
    security_groups  = [data.aws_security_group.tasks.id]
    assign_public_ip = false
  }

  load_balancer {
    target_group_arn = data.aws_lb_target_group.app.arn
    container_name   = "scratch-card"
    container_port   = 3000
  }

  health_check_grace_period_seconds = 60

  depends_on = [aws_lb_listener_rule.health]
}
