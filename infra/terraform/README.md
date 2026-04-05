# AWS kubeadm Baseline

This Terraform stack provisions a playground-friendly AWS foundation for a self-managed Kubernetes cluster built with `kubeadm` on Ubuntu.

## What it creates
- 1 control plane EC2 instance in a public subnet
- 2 worker EC2 instances in private subnets
- 1 VPC with 2 public and 2 private subnets
- 1 NAT gateway for private-subnet egress
- RDS PostgreSQL in private subnets
- ElastiCache Redis in private subnets
- ECR repositories for `frontend`, `core-api`, and `chat-service`
- S3 bucket for media and user uploads
- Security groups, IAM instance profile, and an SSH key pair for operators
- AWS-aware subnet and node tags so load balancer integrations can discover the cluster

## Why this shape
This cluster layout is intentionally sized for the KodeKloud AWS Playground while still resembling a real AWS deployment pattern:
- upstream Kubernetes instead of k3s
- managed data services instead of in-cluster Postgres or Redis
- private subnets for workers and data services
- ECR for container images
- AWS cloud-controller-manager ready bootstrap (`cloud-provider=external`)

## What it does not do automatically
This stack prepares the infrastructure and the node prerequisites, but it does not run `kubeadm init` or join commands automatically. That is a deliberate choice so the Kubernetes bootstrap remains visible and teachable during the lab session.

Use the runbook in `docs/aws-kubeadm-playground.md` for the bootstrap steps after `terraform apply`.
