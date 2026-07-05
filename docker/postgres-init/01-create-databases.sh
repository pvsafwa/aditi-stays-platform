#!/bin/sh
# Runs once, on first container start (docker-entrypoint-initdb.d convention),
# creating the per-service databases catalog-service/crm-service/chat-service
# each self-bootstrap their own schema into via @PostConstruct.
set -e

for db in catalog_db crm_db chat_db; do
  psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" <<-EOSQL
    SELECT 'CREATE DATABASE $db' WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = '$db')\gexec
EOSQL
done
