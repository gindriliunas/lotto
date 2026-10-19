variable "bucket_name" {
  description = "Name of the private artwork bucket. Globally unique."
  type        = string
}

variable "ticket_bucket_name" {
  description = "Name of the private bucket that stores ticket screenshots. Globally unique. CloudFront cannot read this bucket."
  type        = string
}

variable "cloudfront_distribution_arn" {
  description = "ARN of the CloudFront distribution allowed to read objects. No other principal can read the bucket."
  type        = string
}
