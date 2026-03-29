resource "aws_vpc" "main_vpc" {
  cidr_block           = "10.0.0.0/16"
  enable_dns_support   = true
  enable_dns_hostnames = true
  tags                 = { Name = "tourism-vpc" }
}

resource "aws_internet_gateway" "igw" {
  vpc_id = aws_vpc.main_vpc.id
  tags   = { Name = "tourism-igw" }
}

# Public Subnet for K3s Cluster
resource "aws_subnet" "public_k3s" {
  vpc_id                  = aws_vpc.main_vpc.id
  cidr_block              = "10.0.1.0/24"
  map_public_ip_on_launch = true
  availability_zone       = "us-east-1a"
  tags                    = { Name = "k3s-public-subnet" }
}

resource "aws_route_table" "public_rt" {
  vpc_id = aws_vpc.main_vpc.id
  route {
    cidr_block = "0.0.0.0/0"
    gateway_id = aws_internet_gateway.igw.id
  }
}

resource "aws_route_table_association" "public_rta" {
  subnet_id      = aws_subnet.public_k3s.id
  route_table_id = aws_route_table.public_rt.id
}

# Private Subnets for Data Layer
resource "aws_subnet" "private_rds_a" {
  vpc_id            = aws_vpc.main_vpc.id
  cidr_block        = "10.0.2.0/24"
  availability_zone = "us-east-1a"
  tags              = { Name = "rds-private-subnet-a" }
}

resource "aws_subnet" "private_rds_b" {
  vpc_id            = aws_vpc.main_vpc.id
  cidr_block        = "10.0.3.0/24"
  availability_zone = "us-east-1b"
  tags              = { Name = "rds-private-subnet-b" }
}

resource "aws_db_subnet_group" "rds_subnet_group" {
  name       = "tourism-rds-subnet-group"
  subnet_ids = [aws_subnet.private_rds_a.id, aws_subnet.private_rds_b.id]
}
