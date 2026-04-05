data "aws_ami" "ubuntu" {
  most_recent = true
  owners      = ["099720109477"]

  filter {
    name   = "name"
    values = ["ubuntu/images/hvm-ssd/ubuntu-jammy-22.04-amd64-server-*"]
  }
}

resource "aws_instance" "control_plane" {
  ami                         = data.aws_ami.ubuntu.id
  instance_type               = var.control_plane_instance_type
  subnet_id                   = aws_subnet.public["public-1"].id
  vpc_security_group_ids      = [aws_security_group.cluster.id, aws_security_group.control_plane_admin.id]
  iam_instance_profile        = aws_iam_instance_profile.node.name
  key_name                    = aws_key_pair.cluster_admin.key_name
  associate_public_ip_address = true
  user_data = templatefile("${path.module}/templates/control-plane-userdata.sh.tftpl", {
    kubernetes_minor_version = var.kubernetes_minor_version
  })

  root_block_device {
    volume_type           = "gp3"
    volume_size           = var.node_root_volume_size
    encrypted             = true
    delete_on_termination = true
  }

  metadata_options {
    http_endpoint = "enabled"
    http_tokens   = "required"
  }

  tags = merge(local.common_tags, {
    Name                                          = "${local.name_prefix}-control-plane-1"
    Role                                          = "control-plane"
    KubernetesCluster                             = local.cluster_name
    "kubernetes.io/cluster/${local.cluster_name}" = "owned"
  })
}

resource "aws_instance" "worker" {
  count = var.worker_count

  ami                    = data.aws_ami.ubuntu.id
  instance_type          = var.worker_instance_type
  subnet_id              = values(aws_subnet.private)[count.index % length(values(aws_subnet.private))].id
  vpc_security_group_ids = [aws_security_group.cluster.id]
  iam_instance_profile   = aws_iam_instance_profile.node.name
  key_name               = aws_key_pair.cluster_admin.key_name
  user_data = templatefile("${path.module}/templates/worker-userdata.sh.tftpl", {
    kubernetes_minor_version = var.kubernetes_minor_version
  })

  root_block_device {
    volume_type           = "gp3"
    volume_size           = var.node_root_volume_size
    encrypted             = true
    delete_on_termination = true
  }

  metadata_options {
    http_endpoint = "enabled"
    http_tokens   = "required"
  }

  tags = merge(local.common_tags, {
    Name                                          = "${local.name_prefix}-worker-${count.index + 1}"
    Role                                          = "worker"
    KubernetesCluster                             = local.cluster_name
    "kubernetes.io/cluster/${local.cluster_name}" = "owned"
  })
}
