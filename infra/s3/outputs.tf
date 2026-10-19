output "bucket_name" {
  value = aws_s3_bucket.artwork.bucket
}

output "bucket_arn" {
  value = aws_s3_bucket.artwork.arn
}

output "ticket_bucket_name" {
  value = aws_s3_bucket.tickets.bucket
}

output "ticket_bucket_arn" {
  value = aws_s3_bucket.tickets.arn
}
