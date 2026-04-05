variable "aws_region" {
  description = "AWS region for the playground session."
  type        = string
  default     = "us-east-1"
}

variable "project_name" {
  description = "Short project identifier used in resource names and tags."
  type        = string
  default     = "aditi-stays"
}

variable "environment" {
  description = "Environment label for tagging and naming."
  type        = string
  default     = "dev"
}

variable "availability_zones" {
  description = "Two AZs used for public and private subnets."
  type        = list(string)
  default     = ["us-east-1a", "us-east-1b"]

  validation {
    condition     = length(var.availability_zones) == 2
    error_message = "availability_zones must contain exactly two AZs for this playground-friendly layout."
  }
}

variable "vpc_cidr" {
  description = "CIDR range for the VPC."
  type        = string
  default     = "10.40.0.0/16"
}

variable "public_subnet_cidrs" {
  description = "Two public subnet CIDRs."
  type        = list(string)
  default     = ["10.40.0.0/24", "10.40.1.0/24"]

  validation {
    condition     = length(var.public_subnet_cidrs) == 2
    error_message = "public_subnet_cidrs must contain exactly two CIDRs."
  }
}

variable "private_subnet_cidrs" {
  description = "Two private subnet CIDRs used for workers and managed data services."
  type        = list(string)
  default     = ["10.40.10.0/24", "10.40.11.0/24"]

  validation {
    condition     = length(var.private_subnet_cidrs) == 2
    error_message = "private_subnet_cidrs must contain exactly two CIDRs."
  }
}

variable "admin_cidr" {
  description = "Your public IP in CIDR form, used for SSH and Kubernetes API access to the control plane."
  type        = string
}

variable "kubernetes_minor_version" {
  description = "Kubernetes minor version stream installed by kubeadm and kubelet. Example: 1.31"
  type        = string
  default     = "1.31"
}

variable "control_plane_instance_type" {
  description = "EC2 instance type for the control plane node."
  type        = string
  default     = "t3.medium"
}

variable "worker_instance_type" {
  description = "EC2 instance type for worker nodes."
  type        = string
  default     = "t3.medium"
}

variable "worker_count" {
  description = "Number of Kubernetes worker nodes."
  type        = number
  default     = 2

  validation {
    condition     = var.worker_count == 2
    error_message = "This playground design is intentionally fixed to two worker nodes so the total cluster stays at 1 control plane + 2 workers."
  }
}

variable "node_root_volume_size" {
  description = "Root EBS volume size in GiB for EC2 nodes."
  type        = number
  default     = 20

  validation {
    condition     = var.node_root_volume_size >= 16 && var.node_root_volume_size <= 30
    error_message = "node_root_volume_size must stay between 16 and 30 GiB to fit playground storage limits."
  }
}

variable "db_name" {
  description = "Initial PostgreSQL database name."
  type        = string
  default     = "aditistays"
}

variable "db_username" {
  description = "Master PostgreSQL username."
  type        = string
  default     = "platformadmin"
}

variable "db_instance_class" {
  description = "RDS instance class."
  type        = string
  default     = "db.t3.micro"
}

variable "db_allocated_storage" {
  description = "RDS allocated storage in GiB."
  type        = number
  default     = 20
}

variable "redis_node_type" {
  description = "ElastiCache node type."
  type        = string
  default     = "cache.t3.micro"
}

variable "media_bucket_force_destroy" {
  description = "Force-destroy the S3 media bucket on terraform destroy. Helpful for short playground sessions."
  type        = bool
  default     = true
}
