# Checkout de Ônibus e Camisetas

Aplicação web de pedido sem conta de comprador, com frontend HTML/CSS/JavaScript e Bootstrap 5, API Node.js/TypeScript/Fastify, PostgreSQL e integração com Mercado Pago Orders API.

## Estado do catálogo

O seed cria `Ônibus`, `Camiseta Normal` e `Camiseta Líbero` desativados e registra as regras iniciais de números. **Nenhuma variante, preço, tamanho, turma ou modalidade foi inventada.** O catálogo permanecerá vazio até que opções comerciais sejam configuradas em `products`, `product_variants` e `checkout_options`.

## Requisitos

- Node.js 24 LTS ou superior compatível.
- PostgreSQL 15+.
- Docker Compose (opcional, para PostgreSQL local).
- Credenciais de teste do Mercado Pago para habilitar pagamentos de teste.

## Configuração local

1. Instale as dependências e copie o modelo local de ambiente:

   ```bash
   npm install
   cp .env.example .env
   ```

2. Preencha `.env` somente na sua máquina. Substitua `SUBSTITUA_A_SENHA` pela senha que você configurou no PostgreSQL. Use a Public Key e o Access Token de **teste** do Mercado Pago; gere a `PII_ENCRYPTION_KEY` localmente com `openssl rand -base64 32`. Não compartilhe nem versione esse arquivo. `dotenv` carrega `.env` quando ele existe; a ausência do arquivo não é observada pelo watcher.

3. Configure `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_DB` e `DATABASE_URL` no `.env`. Para iniciar apenas o banco local:

   ```bash
   docker compose up -d postgres
   ```

4. Configure `APP_ORIGIN` com a origem usada no navegador. O valor usual em desenvolvimento é a origem local que usa a porta informada em `PORT`.

5. Aplique o esquema e as regras iniciais:

   ```bash
   npm run db:migrate
   npm run db:seed
   ```

6. Inicie a aplicação:

   ```bash
   npm run dev
   ```

O checkout fica disponível na raiz do endereço local. Se as credenciais do Mercado Pago não estiverem configuradas, o catálogo pode ser consultado, mas o backend não inicia tentativas de pagamento.

## Configurar catálogo e regras comerciais

Os produtos são carregados do PostgreSQL. Antes de ativar a venda:

1. Cadastre variantes em `product_variants`, com preço em centavos, código, nome e disponibilidade.
2. Para ônibus, cada variante representa uma opção de ônibus configurável (código/número e nome).
3. Para camisetas, cadastre uma variante por tamanho/modelo disponível. `available_quantity = NULL` significa estoque não controlado; zero significa indisponível.
4. Configure `checkout_options` para listas de turmas e modalidades. Quando uma lista estiver vazia, o formulário aceita texto livre; quando houver opções ativas, o backend exige uma delas.
5. Ative as variantes e, por último, o produto correspondente.

As regras iniciais de números restritos são semeadas em `restricted_numbers`. Padrões de moderação são ajustáveis em `restricted_name_patterns`. Essas tabelas são a fonte de verdade do backend; não há painel administrativo nesta versão.

Consulte [docs/architecture.md](docs/architecture.md) para o modelo e [docs/api.md](docs/api.md) para as rotas.

## Testes e build

```bash
npm test
npm run typecheck
npm run build
```

Testes que precisam de um PostgreSQL dedicado podem usar `DATABASE_URL_TEST`. Nunca aponte essa variável para produção.

## Mercado Pago

Leia [docs/mercadopago.md](docs/mercadopago.md) para configurar credenciais de teste, cartões de teste, parcelas, webhook e passagem controlada para produção. O Access Token, o segredo de webhook e a chave de criptografia são somente de backend.

## Deploy

Consulte [docs/deploy.md](docs/deploy.md). Produção exige HTTPS, PostgreSQL privado, secrets separados, catálogo comercial configurado, webhook HTTPS e credenciais de produção ativadas explicitamente.

## Privacidade

Consulte [docs/privacy-security.md](docs/privacy-security.md) e o aviso em [`frontend/privacy.html`](frontend/privacy.html). Os detalhes do controlador, canal de contato e prazos de retenção ainda precisam ser preenchidos antes de disponibilizar o checkout ao público.
