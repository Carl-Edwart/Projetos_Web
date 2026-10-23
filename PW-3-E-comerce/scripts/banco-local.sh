#!/usr/bin/env bash
# Sobe o PostgreSQL local do projeto (porta 5433) e garante o banco pw3_ecommerce.
# Uso: ./scripts/banco-local.sh
set -euo pipefail
set +x

PGDATA="$HOME/.local/share/pw3-ecommerce/pgdata"
SOCKET_DIR="$HOME/.local/share/pw3-ecommerce"
LOG_FILE="$HOME/.local/share/pw3-ecommerce/postgres.log"
PG_CTL="/usr/lib/postgresql/16/bin/pg_ctl"

if [ ! -d "$PGDATA" ]; then
  echo "ERRO: cluster não encontrado em $PGDATA." >&2
  exit 1
fi

if pg_isready -h 127.0.0.1 -p 5433 >/dev/null 2>&1; then
  echo "PostgreSQL do projeto já está rodando na porta 5433."
else
  "$PG_CTL" -D "$PGDATA" -l "$LOG_FILE" -o "-h 127.0.0.1 -p 5433 -k $SOCKET_DIR" start
fi

if ! psql -h 127.0.0.1 -p 5433 -U sac -d postgres -Atqc "SELECT 1 FROM pg_database WHERE datname='pw3_ecommerce'" | grep -q 1; then
  createdb -h 127.0.0.1 -p 5433 -U sac pw3_ecommerce
  echo "Banco pw3_ecommerce criado."
fi

echo "Banco pronto: postgresql://sac@127.0.0.1:5433/pw3_ecommerce"
