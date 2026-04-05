# AWS kubeadm Playground Runbook

This runbook is the step-by-step path for a fresh KodeKloud AWS Playground session using a self-managed Kubernetes cluster on EC2.

## Target architecture
- 1 control plane EC2 instance
- 2 worker EC2 instances
- Ubuntu 22.04 LTS
- containerd
- kubeadm
- Calico CNI
- ingress-nginx
- RDS PostgreSQL
- ElastiCache Redis
- ECR
- S3

## What Terraform does for us
Terraform creates the AWS infrastructure and prepares the nodes with:
- containerd installed and running
- kubeadm, kubelet, and kubectl packages installed on the control plane
- kubeadm and kubelet installed on the workers
- kubelet preconfigured with `cloud-provider=external`
- swap disabled and kernel settings prepared for Kubernetes
- AWS-ready subnet tags, cluster tags, and IAM permissions for the cloud controller path

That means the lab focus becomes:
1. provision infra
2. initialize Kubernetes
3. install the AWS cloud integration
4. join workers
5. install networking and ingress
6. deploy the app

## Step 1: prepare Terraform variables
Copy the example file and replace `YOUR_PUBLIC_IP/32` with your actual public IP.

```bash
cd /Users/safwanpv/Documents/New\ project/infra/terraform
cp terraform.tfvars.example terraform.tfvars
```

## Step 2: initialize and review the plan
```bash
terraform init
terraform plan
```

Focus on understanding:
- control plane EC2
- worker EC2 nodes
- VPC, subnets, and NAT
- RDS and Redis
- ECR repositories
- S3 media bucket

## Step 3: apply the infrastructure
```bash
terraform apply
```

After apply, pay attention to these outputs:
- `cluster_name`
- `control_plane_public_ip`
- `control_plane_private_ip`
- `worker_private_ips`
- `worker_instance_ids`
- `rds_endpoint`
- `redis_primary_endpoint`
- `media_bucket_name`
- ECR repository URLs

## Step 4: connect to the control plane
Use the Terraform output `control_plane_ssh_command`, or run:

```bash
ssh -i kubeadm-cluster-key.pem ubuntu@<CONTROL_PLANE_PUBLIC_IP>
```

## Step 5: initialize Kubernetes on the control plane
First, render a kubeadm config locally using the Terraform outputs:

```bash
cd /Users/safwanpv/Documents/New\ project
./scripts/render-kubeadm-init-config.sh <CONTROL_PLANE_PRIVATE_IP> <CONTROL_PLANE_PUBLIC_IP> <CLUSTER_NAME> > /tmp/kubeadm-init.yaml
scp -i infra/terraform/kubeadm-cluster-key.pem /tmp/kubeadm-init.yaml ubuntu@<CONTROL_PLANE_PUBLIC_IP>:/home/ubuntu/kubeadm-init.yaml
```

Then on the control plane node:

```bash
sudo mv /home/ubuntu/kubeadm-init.yaml /root/kubeadm-init.yaml
sudo kubeadm init --config /root/kubeadm-init.yaml
```

Why this matters:
- `kubeadm init` creates the control plane
- it writes `/etc/kubernetes/admin.conf`
- it prints the worker join command
- the rendered config keeps the cluster aligned with `cloud-provider=external`

## Step 6: configure kubectl on the control plane
Still on the control plane node:

```bash
mkdir -p $HOME/.kube
sudo cp -i /etc/kubernetes/admin.conf $HOME/.kube/config
sudo chown $(id -u):$(id -g) $HOME/.kube/config
kubectl get nodes
```

At this point, the control plane should appear, but workers will still be `NotReady` or absent until they join.

## Step 7: install the AWS cloud-controller-manager
Before installing ingress, add the AWS cloud integration that handles node initialization and AWS load balancer wiring for self-managed clusters.

Why this matters:
- it completes the `cloud-provider=external` setup
- it allows `Service` resources of type `LoadBalancer` to work on AWS
- it is the missing AWS integration layer between upstream Kubernetes and EC2 networking

Use the official `cloud-provider-aws` deployment path for self-managed clusters. We can pin the exact manifest or Helm chart version in the fresh session once the playground comes up.

## Step 8: install Calico
Apply the current official Calico manifest from the Calico project documentation.

After installing Calico, run:

```bash
kubectl get pods -n kube-system
kubectl get nodes
```

## Step 9: join the workers
Take the `kubeadm join ...` command printed by `kubeadm init`.

Open a Session Manager shell into each worker using the Terraform output `worker_ssm_commands`, then run the join command on both workers.

After both joins:

```bash
kubectl get nodes -o wide
```

Expected result:
- 1 control plane node `Ready`
- 2 worker nodes `Ready`

## Step 10: copy kubeconfig to your laptop
Use the Terraform output `kubeconfig_pull_command`, then update the server address inside the copied kubeconfig from `127.0.0.1` to the control plane public IP.

Then locally:

```bash
export KUBECONFIG=~/.kube/aditi-stays-dev-admin.conf
kubectl get nodes
```

## Step 11: install ingress-nginx
Install ingress-nginx after the cluster is healthy. This becomes the ingress class expected by the app manifests in `infra/k8s/base/ingress.yaml`.

Use the upstream Helm chart and make the controller service internet-facing on AWS. The generic example from the ingress-nginx documentation shows the AWS NLB annotations that matter for a `LoadBalancer` service, including `aws-load-balancer-type: nlb` and `aws-load-balancer-scheme: internet-facing`.

## Step 12: app deployment later
Once the cluster is ready, the next layer is:
1. build amd64 images
2. push to ECR
3. create app secrets
4. deploy the manifests
5. verify frontend, API, and chat flows

## Session strategy
For a single 3-hour playground session, the best checkpoint is:
- infra up
- nodes ready
- AWS cloud controller installed
- Calico installed
- ingress-nginx installed

That gives a strong, reusable base for app deployment in the same or next session.
