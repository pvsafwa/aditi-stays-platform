resource "random_password" "k3s_token" {
  length  = 32
  special = false
}

resource "aws_ssm_parameter" "k3s_token_param" {
  name  = "/tourism-platform/dev/k3s-token"
  type  = "SecureString"
  value = random_password.k3s_token.result
}

resource "random_password" "rds_password" {
  length           = 16
  special          = true
  override_special = "!#$%&*()-_=+[]{}<>:?"
}

resource "aws_ssm_parameter" "rds_password_param" {
  name  = "/tourism-platform/dev/db-password"
  type  = "SecureString"
  value = random_password.rds_password.result
}
