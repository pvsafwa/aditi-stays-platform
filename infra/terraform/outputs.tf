output "k3s_master_public_ip" {
  value = aws_instance.k3s_master.public_ip
}

output "k3s_worker_public_ips" {
  value = aws_instance.k3s_worker[*].public_ip
}

output "rds_endpoint" {
  value = aws_db_instance.tourism_db.endpoint
}

output "redis_primary_endpoint" {
  value = aws_elasticache_replication_group.tourism_redis.primary_endpoint_address
}

output "ecr_frontend_repo_url" {
  value = aws_ecr_repository.frontend.repository_url
}

output "ecr_core_api_repo_url" {
  value = aws_ecr_repository.core_api.repository_url
}

output "ecr_chat_service_repo_url" {
  value = aws_ecr_repository.chat_service.repository_url
}

output "ssh_instructions" {
  value = "Run this to connect: ssh -i k3s-key.pem ubuntu@${aws_instance.k3s_master.public_ip}"
}
