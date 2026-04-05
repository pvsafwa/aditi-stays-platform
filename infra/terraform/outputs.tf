output "cluster_name" {
  description = "Logical cluster name used for AWS subnet and node tagging."
  value       = local.cluster_name
}

output "control_plane_public_ip" {
  description = "Public IP for the Kubernetes control plane node."
  value       = aws_instance.control_plane.public_ip
}

output "control_plane_private_ip" {
  description = "Private IP for the Kubernetes control plane node."
  value       = aws_instance.control_plane.private_ip
}

output "worker_private_ips" {
  description = "Private IPs for Kubernetes worker nodes."
  value       = aws_instance.worker[*].private_ip
}

output "worker_instance_ids" {
  description = "SSM target instance IDs for the worker nodes."
  value       = aws_instance.worker[*].id
}

output "rds_endpoint" {
  description = "PostgreSQL endpoint."
  value       = aws_db_instance.postgres.address
}

output "db_password_ssm_parameter" {
  description = "SSM SecureString parameter holding the RDS master password."
  value       = aws_ssm_parameter.db_password.name
}

output "redis_primary_endpoint" {
  description = "Primary Redis endpoint."
  value       = aws_elasticache_replication_group.redis.primary_endpoint_address
}

output "media_bucket_name" {
  description = "S3 bucket for user uploads and media assets."
  value       = aws_s3_bucket.media.id
}

output "ecr_frontend_repository_url" {
  value = aws_ecr_repository.frontend.repository_url
}

output "ecr_core_api_repository_url" {
  value = aws_ecr_repository.core_api.repository_url
}

output "ecr_chat_service_repository_url" {
  value = aws_ecr_repository.chat_service.repository_url
}

output "control_plane_ssh_command" {
  description = "SSH command for the control plane node."
  value       = "ssh -i kubeadm-cluster-key.pem ubuntu@${aws_instance.control_plane.public_ip}"
}

output "worker_ssm_commands" {
  description = "Session Manager commands for worker nodes."
  value       = [for id in aws_instance.worker[*].id : "aws ssm start-session --region ${var.aws_region} --target ${id}"]
}

output "kubeconfig_pull_command" {
  description = "Command to copy the admin kubeconfig from the control plane to your laptop."
  value       = "ssh -i kubeadm-cluster-key.pem ubuntu@${aws_instance.control_plane.public_ip} \"sudo cat /etc/kubernetes/admin.conf\" > ~/.kube/${local.name_prefix}-admin.conf"
}
