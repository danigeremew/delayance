#!/usr/bin/env bash
set -euo pipefail

if [[ "${NODE_ENV:-development}" == "production" ]]; then
  echo 'Refusing to reset development data while NODE_ENV=production' >&2
  exit 1
fi

echo 'This removes the Delayance Redis volume, including queued jobs and password reset tokens. Local PostgreSQL and files are preserved.'
read -r -p 'Type RESET to continue: ' confirmation
[[ "$confirmation" == RESET ]] || { echo 'Cancelled.'; exit 1; }
docker compose -f infra/docker-compose.yml down -v
docker compose -f infra/docker-compose.yml up -d
pnpm --filter @delayance/api db:migrate
echo 'Redis restarted and local PostgreSQL migrations applied.'
