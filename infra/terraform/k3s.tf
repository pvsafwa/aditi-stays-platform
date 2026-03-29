data "aws_ami" "ubuntu" {
  most_recent = true
  owners      = ["099720109477"] # Canonical
  filter {
    name   = "name"
    values = ["ubuntu/images/hvm-ssd/ubuntu-jammy-22.04-amd64-server-*"]
  }
}

resource "aws_instance" "k3s_master" {
  ami                    = data.aws_ami.ubuntu.id
  instance_type          = "t3.medium"
  subnet_id              = aws_subnet.public_k3s.id
  vpc_security_group_ids = [aws_security_group.k3s_sg.id]
  iam_instance_profile   = aws_iam_instance_profile.k3s_profile.name
  key_name               = aws_key_pair.k3s_key_pair.key_name

  user_data = <<-EOF
              #!/bin/bash
              set -eux
              apt-get update && apt-get install -y awscli jq curl
              TOKEN=$(aws ssm get-parameter --name "/tourism-platform/dev/k3s-token" --with-decryption --region us-east-1 --query "Parameter.Value" --output text)
              curl -sfL https://get.k3s.io | K3S_TOKEN="$TOKEN" sh -s - server --cluster-init --write-kubeconfig-mode 644
              EOF
  tags      = { Name = "k3s-master" }

  depends_on = [aws_ssm_parameter.k3s_token_param]
}

resource "aws_instance" "k3s_worker" {
  count                  = 2
  ami                    = data.aws_ami.ubuntu.id
  instance_type          = "t3.medium"
  subnet_id              = aws_subnet.public_k3s.id
  vpc_security_group_ids = [aws_security_group.k3s_sg.id]
  iam_instance_profile   = aws_iam_instance_profile.k3s_profile.name
  key_name               = aws_key_pair.k3s_key_pair.key_name

  user_data = <<-EOF
              #!/bin/bash
              set -eux
              apt-get update && apt-get install -y awscli jq curl
              TOKEN=$(aws ssm get-parameter --name "/tourism-platform/dev/k3s-token" --with-decryption --region us-east-1 --query "Parameter.Value" --output text)
              until timeout 2 bash -c "</dev/tcp/${aws_instance.k3s_master.private_ip}/6443"; do sleep 5; done
              curl -sfL https://get.k3s.io | K3S_URL="https://${aws_instance.k3s_master.private_ip}:6443" K3S_TOKEN="$TOKEN" sh -
              EOF
  tags      = { Name = "k3s-worker-${count.index + 1}" }

  depends_on = [aws_instance.k3s_master]
}
