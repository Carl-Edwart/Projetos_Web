#!/usr/bin/env bash
# Configura o .env local sem exibir segredos e sobe o projeto.
# Uso: ./scripts/rodar.sh [--somente-setup]
# Senha do Postgres via variável de ambiente (não coloque senha no código):
#   read -s -p "Senha do Postgres: " PG_SENHA; export PG_SENHA; ./scripts/rodar.sh; unset PG_SENHA
set -euo pipefail
set +x

cd "$(dirname "$0")/.."

if [ ! -f .env.example ]; then
  echo "ERRO: .env.example não encontrado na raiz do projeto." >&2
  exit 1
fi

if [ ! -f .env ]; then
  cp .env.example .env
  echo ".env criado a partir do .env.example."
fi

cp .env ".env.bak.$(date +%s)" 2>/dev/null || true

python3 - <<'PY'
import os
from pathlib import Path

env_path = Path(".env")
lines = env_path.read_text().splitlines()
pg_senha = os.environ.get("PG_SENHA", "")
out = [line.replace("SUBSTITUA_A_SENHA", pg_senha) if (pg_senha and "SUBSTITUA_A_SENHA" in line) else line for line in lines]
env_path.write_text("\n".join(out) + "\n")
PY

# Gera a chave PII fora do Python para não misturar segredos no log.
if grep -Eq '^PII_ENCRYPTION_KEY=$' .env; then
  PII_KEY_TMP="$(openssl rand -base64 32)"
  export PII_KEY_TMP
  python3 - <<'PY'
import os
from pathlib import Path
p = Path(".env")
lines = p.read_text().splitlines()
key = os.environ.get("PII_KEY_TMP", "")
out = [(f"PII_ENCRYPTION_KEY={key}" if l.strip() == "PII_ENCRYPTION_KEY=" and key else l) for l in lines]
p.write_text("\n".join(out) + "\n")
PY
  unset PII_KEY_TMP
  echo "PII_ENCRYPTION_KEY gerada localmente."
fi

if grep -q "SUBSTITUA_A_SENHA" .env; then
  echo "PENDÊNCIA: defina a senha real do PostgreSQL." >&2
  echo "Edite no .env a linha DATABASE_URL (e POSTGRES_PASSWORD) ou rode com:" >&2
  echo "  read -s -p \"Senha do Postgres: \" PG_SENHA; export PG_SENHA; ./scripts/rodar.sh; unset PG_SENHA" >&2
  exit 1
fi

if ! grep -Eq '^DATABASE_URL=.+' .env; then
  echo "PENDÊNCIA: DATABASE_URL vazia no .env." >&2
  exit 1
fi

if [ ! -d node_modules ]; then
  npm install
fi

npm run db:migrate
npm run db:seed

if [ "${1:-}" = "--somente-setup" ]; then
  echo "Setup concluído. Rode 'npm run dev' e abra http://localhost:3000"
  exit 0
fi

npm run dev
