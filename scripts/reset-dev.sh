#!/usr/bin/env bash
set -euo pipefail

if [[ "${NODE_ENV:-development}" == "production" ]]; then
  echo 'Refusing to reset development data while NODE_ENV=production' >&2
  exit 1
fi

echo 'This removes local Delayance PostgreSQL, Redis, MinIO, and Keycloak volumes.'
read -r -p 'Type RESET to continue: ' confirmation
[[ "$confirmation" == RESET ]] || { echo 'Cancelled.'; exit 1; }
docker compose -f infra/docker-compose.yml down -v
docker compose -f infra/docker-compose.yml up -d
pnpm --filter @delayance/api db:migrate
echo 'Development services restarted and migrations applied.'
