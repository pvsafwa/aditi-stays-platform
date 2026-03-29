resource "aws_ecr_repository" "frontend" {
  name                 = "tourism-platform/frontend"
  image_tag_mutability = "IMMUTABLE"

  image_scanning_configuration {
    scan_on_push = true
  }

  tags = {
    Name = "tourism-frontend-ecr"
  }
}

resource "aws_ecr_repository" "core_api" {
  name                 = "tourism-platform/core-api"
  image_tag_mutability = "IMMUTABLE"

  image_scanning_configuration {
    scan_on_push = true
  }

  tags = {
    Name = "tourism-core-api-ecr"
  }
}

resource "aws_ecr_repository" "chat_service" {
  name                 = "tourism-platform/chat-service"
  image_tag_mutability = "IMMUTABLE"

  image_scanning_configuration {
    scan_on_push = true
  }

  tags = {
    Name = "tourism-chat-service-ecr"
  }
}
