resource "aws_elasticache_subnet_group" "redis_subnet_group" {
  name        = "tourism-redis-subnet-group"
  description = "Private subnets for Tourism platform Redis"
  subnet_ids  = [aws_subnet.private_rds_a.id, aws_subnet.private_rds_b.id]
}

resource "aws_elasticache_replication_group" "tourism_redis" {
  replication_group_id       = "tourism-redis"
  description                = "Redis for Tourism platform realtime chat and cache"
  engine                     = "redis"
  engine_version             = "7.1"
  node_type                  = "cache.t4g.micro"
  port                       = 6379
  parameter_group_name       = "default.redis7"
  num_cache_clusters         = 1
  automatic_failover_enabled = false
  multi_az_enabled           = false
  apply_immediately          = true

  subnet_group_name  = aws_elasticache_subnet_group.redis_subnet_group.name
  security_group_ids = [aws_security_group.redis_sg.id]

  at_rest_encryption_enabled = true
  transit_encryption_enabled = false

  tags = {
    Name = "Tourism-Redis"
  }
}
