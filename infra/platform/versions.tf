terraform {
  required_version = ">= 1.10.0"

  # The bucket is created by infra/state. Apply that directory first.
  backend "s3" {
    bucket       = "lotto-terraform-state-631026310596"
    key          = "platform/terraform.tfstate"
    region       = "eu-west-2"
    encrypt      = true
    use_lockfile = true
  }

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
    random = {
      source  = "hashicorp/random"
      version = "~> 3.0"
    }
  }
}

provider "aws" {
  region = "eu-west-2"
}

provider "aws" {
  alias  = "us_east_1"
  region = "us-east-1"
}
