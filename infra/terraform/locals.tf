locals {
  name_prefix  = "${var.project_name}-${var.environment}"
  cluster_name = "${local.name_prefix}-cluster"

  common_tags = {
    Project     = var.project_name
    Environment = var.environment
    ManagedBy   = "Terraform"
  }

  public_subnet_map = {
    for index, cidr in var.public_subnet_cidrs :
    "public-${index + 1}" => {
      cidr = cidr
      az   = var.availability_zones[index]
    }
  }

  private_subnet_map = {
    for index, cidr in var.private_subnet_cidrs :
    "private-${index + 1}" => {
      cidr = cidr
      az   = var.availability_zones[index]
    }
  }
}
