resource "random_password" "origin_verify" {
  length  = 32
  special = false
}

resource "aws_secretsmanager_secret" "origin_verify" {
  name = "scratch-card/origin-verify"
}

resource "aws_secretsmanager_secret_version" "origin_verify" {
  secret_id     = aws_secretsmanager_secret.origin_verify.id
  secret_string = random_password.origin_verify.result
}

resource "aws_acm_certificate" "edge" {
  provider          = aws.us_east_1
  domain_name       = var.domain_name
  validation_method = "DNS"

  lifecycle {
    create_before_destroy = true
  }
}

resource "aws_wafv2_web_acl" "edge" {
  provider = aws.us_east_1
  name     = "scratch-card"
  scope    = "CLOUDFRONT"

  default_action {
    allow {}
  }

  rule {
    name     = "aws-common"
    priority = 10

    override_action {
      none {}
    }

    statement {
      managed_rule_group_statement {
        name        = "AWSManagedRulesCommonRuleSet"
        vendor_name = "AWS"
      }
    }

    visibility_config {
      cloudwatch_metrics_enabled = true
      metric_name                = "scratch-card-common"
      sampled_requests_enabled   = true
    }
  }

  dynamic "rule" {
    for_each = var.enable_bot_control ? [1] : []

    content {
      name     = "aws-bot-control"
      priority = 20

      override_action {
        none {}
      }

      statement {
        managed_rule_group_statement {
          name        = "AWSManagedRulesBotControlRuleSet"
          vendor_name = "AWS"
        }
      }

      visibility_config {
        cloudwatch_metrics_enabled = true
        metric_name                = "scratch-card-bots"
        sampled_requests_enabled   = true
      }
    }
  }

  rule {
    name     = "play-rate"
    priority = 30

    action {
      block {}
    }

    statement {
      rate_based_statement {
        limit              = 100
        aggregate_key_type = "IP"

        scope_down_statement {
          byte_match_statement {
            positional_constraint = "STARTS_WITH"
            search_string         = "/api/play"

            field_to_match {
              uri_path {}
            }

            text_transformation {
              priority = 0
              type     = "NONE"
            }
          }
        }
      }
    }

    visibility_config {
      cloudwatch_metrics_enabled = true
      metric_name                = "scratch-card-play-rate"
      sampled_requests_enabled   = true
    }
  }

  visibility_config {
    cloudwatch_metrics_enabled = true
    metric_name                = "scratch-card"
    sampled_requests_enabled   = true
  }
}

resource "aws_cloudfront_origin_access_control" "artwork" {
  name                              = "scratch-card-artwork"
  origin_access_control_origin_type = "s3"
  signing_behavior                  = "always"
  signing_protocol                  = "sigv4"
}

resource "aws_cloudfront_distribution" "site" {
  enabled         = true
  aliases         = [var.domain_name]
  price_class     = "PriceClass_100"
  web_acl_id      = aws_wafv2_web_acl.edge.arn
  is_ipv6_enabled = false

  origin {
    domain_name = data.aws_lb.app.dns_name
    origin_id   = "alb"

    custom_origin_config {
      http_port              = 80
      https_port             = 443
      origin_protocol_policy = "https-only"
      origin_ssl_protocols   = ["TLSv1.2"]
    }

    custom_header {
      name  = "X-Origin-Verify"
      value = random_password.origin_verify.result
    }
  }

  origin {
    domain_name              = aws_s3_bucket.artwork.bucket_regional_domain_name
    origin_id                = "artwork"
    origin_access_control_id = aws_cloudfront_origin_access_control.artwork.id
  }

  default_cache_behavior {
    target_origin_id       = "alb"
    viewer_protocol_policy = "redirect-to-https"
    allowed_methods        = ["GET", "HEAD", "OPTIONS", "PUT", "POST", "PATCH", "DELETE"]
    cached_methods         = ["GET", "HEAD"]
    compress               = true

    # CachingDisabled and AllViewer. AllViewer keeps the viewer Host header.
    cache_policy_id          = "4135ea2d-6df8-44a3-9df3-4b5a84be39ad"
    origin_request_policy_id = "216adef6-5c7f-47e4-b989-5492eafa07d3"
  }

  ordered_cache_behavior {
    path_pattern           = "/artwork/*"
    target_origin_id       = "artwork"
    viewer_protocol_policy = "redirect-to-https"
    allowed_methods        = ["GET", "HEAD"]
    cached_methods         = ["GET", "HEAD"]
    compress               = true

    # CachingOptimized. The card face can be cached. The app cannot.
    cache_policy_id = "658327ea-f89d-4fab-a63d-7e88639e58f6"
  }

  restrictions {
    geo_restriction {
      restriction_type = "none"
    }
  }

  viewer_certificate {
    acm_certificate_arn      = aws_acm_certificate.edge.arn
    ssl_support_method       = "sni-only"
    minimum_protocol_version = "TLSv1.2_2021"
  }

  depends_on = [aws_acm_certificate.edge]
}
