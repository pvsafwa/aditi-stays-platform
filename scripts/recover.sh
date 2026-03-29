#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"

cd "$ROOT_DIR/infra/terraform"
terraform init -input=false
terraform apply -auto-approve -var-file=terraform.tfvars

cd "$ROOT_DIR"
kubectl apply -f infra/k8s/argocd/application.yaml
argocd app sync aditi-stays
argocd app wait aditi-stays --health --timeout 360
kubectl apply -k infra/monitoring || true

echo "Recovery workflow finished. Target RTO: under 6 minutes with warmed AMI/images and pre-provisioned IAM."
