FROM golang:1.23-alpine AS builder
WORKDIR /src
COPY go.mod ./
RUN go mod download
COPY . .
RUN CGO_ENABLED=0 GOOS=linux go build -o /out/core-api ./cmd/api

FROM alpine:3.20
WORKDIR /app
RUN adduser -D app
COPY --from=builder /out/core-api /app/core-api
USER app
EXPOSE 8080
CMD ["/app/core-api"]
