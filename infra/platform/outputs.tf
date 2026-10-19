output "cloudfront_domain" {
  value = aws_cloudfront_distribution.site.domain_name
}

output "name_servers" {
  description = "Set these at the registrar when gindri.com should be served by Route 53."
  value       = aws_route53_zone.site.name_servers
}

output "edge_validation_records" {
  description = "Add these at the DNS host that gindri.com uses today, or the us-east-1 certificate stays pending."
  value = [
    for dvo in aws_acm_certificate.edge.domain_validation_options : {
      name  = dvo.resource_record_name
      type  = dvo.resource_record_type
      value = dvo.resource_record_value
    }
  ]
}

output "ticket_bucket" {
  value = aws_s3_bucket.tickets.bucket
}

output "artwork_bucket" {
  value = aws_s3_bucket.artwork.bucket
}

output "ecs_service" {
  value = aws_ecs_service.app.name
}

output "london_certificate_arn" {
  value = data.aws_acm_certificate.london.arn
}
