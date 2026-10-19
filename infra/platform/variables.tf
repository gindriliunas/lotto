variable "vpc_id" {
  description = "VPC built in the console. This stack does not create another one."
  type        = string
  default     = "vpc-0eae471976e833a79"
}

variable "alb_name" {
  description = "Name of the application load balancer created in the console."
  type        = string
  default     = "scratch-card"
}

variable "user_pool_id" {
  description = "Cognito user pool created in the console."
  type        = string
  default     = "eu-west-2_Pa83SDeqO"
}

variable "cognito_domain_prefix" {
  description = "Prefix of the Cognito domain, without the auth.eu-west-2.amazoncognito.com suffix."
  type        = string
  default     = "eu-west-2pa83sdeqo"
}

variable "domain_name" {
  description = "Public name on the London certificate and the CloudFront distribution."
  type        = string
  default     = "gindri.com"
}

variable "desired_count" {
  description = "Fargate tasks. Leave at 0 until the scratch-card image has been pushed."
  type        = number
  default     = 0
}

variable "enable_bot_control" {
  description = "Attach the paid Bot Control rule group to the play paths."
  type        = bool
  default     = false
}
