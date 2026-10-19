resource "aws_cognito_user_pool_client" "alb" {
  name         = "scratch-card"
  user_pool_id = data.aws_cognito_user_pool.players.id

  generate_secret                      = true
  allowed_oauth_flows_user_pool_client = true
  allowed_oauth_flows                  = ["code"]
  allowed_oauth_scopes                 = ["openid", "email"]
  callback_urls                        = ["https://${var.domain_name}/oauth2/idpresponse"]
  logout_urls                          = ["https://${var.domain_name}/"]
  supported_identity_providers         = ["COGNITO"]
}

resource "aws_secretsmanager_secret" "cognito_client" {
  name = "scratch-card/cognito-client"
}

resource "aws_secretsmanager_secret_version" "cognito_client" {
  secret_id     = aws_secretsmanager_secret.cognito_client.id
  secret_string = aws_cognito_user_pool_client.alb.client_secret
}
