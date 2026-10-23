# Deploy e operação

## Topologia

- Um serviço Node/Fastify serve frontend estático e API pela mesma origem HTTPS.
- PostgreSQL gerenciado, sem porta pública; conexões somente do serviço da aplicação e da rede administrativa autorizada.
- O runtime executa com usuário não privilegiado. `Dockerfile` produz imagem sem ferramentas de desenvolvimento.
- A imagem usa `npm ci`/lockfile e não contém `.env` ou credenciais.

## Deploy com Docker

1. Configure em secrets do ambiente de deploy `DATABASE_URL`, `APP_ORIGIN`, `PII_ENCRYPTION_KEY`, `MERCADOPAGO_ENVIRONMENT`, `MERCADOPAGO_ACCESS_TOKEN`, `MERCADOPAGO_PUBLIC_KEY` e `MERCADOPAGO_WEBHOOK_SECRET`.
2. Configure banco privado, usuário de aplicação com privilégios mínimos e certificado TLS.
3. Execute `npm run db:migrate` como etapa controlada antes de trocar o tráfego para a nova versão.
4. Configure catálogo, preços e disponibilidade no banco conforme os dados comerciais aprovados; revise o status ativo dos produtos.
5. Publique a aplicação atrás de HTTPS e configure `APP_ORIGIN` com a origem pública exata.
6. Configure o webhook de produção no painel do Mercado Pago e valide entrega/assinatura.
7. Execute smoke tests e acompanhe `GET /health/live` e `/health/ready`.

## Secrets e ambientes

Desenvolvimento, teste e produção usam bancos, Public Keys, Access Tokens e webhook secrets separados. Em `NODE_ENV=production`, o servidor exige origem HTTPS, chave de criptografia e credenciais completas de produção. Não existe fallback silencioso para credenciais de teste ou produção.

`TRUST_PROXY=true` só deve ser usado quando o tráfego chega por proxy reverso conhecido e configurado para substituir, não preservar cegamente, os cabeçalhos de IP encaminhado.

## Banco, backups e observabilidade

- Restrinja conexões PostgreSQL por rede/roles e mantenha TLS.
- Criptografe backups e teste restauração periodicamente.
- Guarde secrets e chave PII fora dos backups do banco; mantenha procedimento de recuperação/versionamento da chave. Perder a chave torna CPF/RG cifrados irrecuperáveis.
- Monitore erros 5xx, latência, disponibilidade, falhas de webhook, tentativas em `RECONCILING` e saúde do PostgreSQL.
- Não envie payloads de pedido, webhook ou dados de comprador a ferramentas de log/analytics.
- Defina retenção de logs e backups e objetivos de recuperação conforme o negócio.

## Entrada de produção

Use primeiro o ambiente de teste. Ative cobranças reais somente mediante configuração explícita de credenciais de produção, webhook HTTPS de produção e catálogo aprovado. Nunca faça transação real durante desenvolvimento/testes.
