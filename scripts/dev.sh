#!/usr/bin/env bash
set -e

cd "$(dirname "$0")/.."

echo "==> Starting PostgreSQL..."
docker compose up -d --build postgres

echo "==> Waiting for PostgreSQL to be healthy..."
until docker compose exec -T postgres pg_isready -U postgres > /dev/null 2>&1; do
  sleep 1
done
echo "==> PostgreSQL is ready."

echo "==> Running migrations..."
npm run db:migrate

echo "==> Starting dev servers + Drizzle Studio..."
npx concurrently \
  --names "server,client,studio" \
  --prefix-colors "blue,green,magenta" \
  "npm run dev --workspace=server" \
  "npm run dev --workspace=client" \
  "npm run db:studio --workspace=server"
