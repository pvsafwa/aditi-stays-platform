resource "random_password" "db_password" {
  length           = 24
  special          = true
  override_special = "!@#%^*-_+=?"
}

resource "aws_ssm_parameter" "db_password" {
  name  = "/${local.name_prefix}/database/master-password"
  type  = "SecureString"
  value = random_password.db_password.result

  tags = {
    Name = "${local.name_prefix}-database-master-password"
  }
}
