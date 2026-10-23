# API REST

Base: mesma origem do frontend, prefixo `/api`. A sessão de checkout é anônima, não equivale a conta. Operações mutáveis exigem cookie de sessão, origem da aplicação e `X-CSRF-Token`. Criação de pedido e tentativa também exigem `Idempotency-Key`.

## Catálogo

### `GET /api/products`

Sem autenticação. Retorna produtos/variantes ativos e disponíveis, preços em centavos e opções configuradas de turma/modalidade. Não retorna regras internas de moderação nem números bloqueados.

### `GET /api/products/:code`

Sem autenticação. Retorna um produto ativo e suas variantes ativas. Código desconhecido ou produto inativo retorna `404`.

### `GET /api/config/payment`

Sem autenticação. Retorna somente a Public Key e um indicador de disponibilidade do checkout. Nunca retorna Access Token, segredo de webhook ou chave de criptografia.

## Sessão e cotação

### `POST /api/checkout/session`

Exige `Origin` permitido. Cria/renova sessão e define cookies de sessão `HttpOnly` e CSRF. Retorna o token CSRF necessário nos próximos `POST`.

### `POST /api/checkout/quote`

Exige sessão e CSRF. Request:

```json
{
  "items": [
    {
      "variantId": "<id retornado pelo catálogo>",
      "quantity": 1,
      "customization": {
        "shirtName": "<nome personalizado>",
        "jerseyNumber": "<número>"
      }
    }
  ]
}
```

O exemplo de `customization` aplica-se à camiseta. Ônibus é selecionado pela variante configurada no catálogo. A resposta traz snapshots e total recalculados. A cotação não reserva estoque e não substitui a nova validação durante a criação.

## Pedido e pagamento

### `POST /api/orders`

Exige sessão, CSRF, `Idempotency-Key`, dados do comprador, itens, total cotado e os campos de submissão do Card Payment Brick. Request não aceita preço como autoridade:

```json
{
  "items": [],
  "buyer": {
    "fullName": "<nome>",
    "cpf": "<cpf>",
    "rg": "<rg>",
    "birthDate": "<AAAA-MM-DD>",
    "phone": "<telefone>",
    "email": "<e-mail>",
    "className": "<turma>",
    "modality": "<modalidade>"
  },
  "quotedTotalCents": "<total retornado pela API de cotação>",
  "payment": {
    "token": "<token efêmero do Brick>",
    "paymentMethodId": "<método retornado pelo Brick>",
    "paymentTypeId": "credit_card",
    "installments": 1
  }
}
```

O número de parcelas é validado estruturalmente e enviado ao Mercado Pago com o total calculado pelo backend. A disponibilidade específica para cartão/emissor é confirmada pelo fluxo oficial do Brick e pelo processamento da Orders API.

### `GET /api/orders/:publicId`

Exige cookie da sessão que criou o pedido. Retorna produtos, quantidades, valores e estado; nunca retorna CPF/RG, e-mail ou telefone.

### `GET /api/checkout/current-order`

Exige a sessão. Recupera o último pedido associado, inclusive após refresh e em outra aba da mesma sessão.

### `POST /api/orders/:publicId/payment-attempts`

Exige sessão/CSRF e uma nova `Idempotency-Key`. Permite retentativa após recusa definitiva; não inicia outra cobrança enquanto existir tentativa pendente ou em reconciliação.

## Webhook e saúde

- `POST /api/webhooks/mercadopago`: valida assinatura oficial, consulta a order e registra evento idempotente.
- `GET /health/live`: processo disponível.
- `GET /health/ready`: verifica conexão com PostgreSQL.

## Erros

Formato seguro: `{ "error": { "code": "...", "message": "...", "fields": {} }, "requestId": "..." }`.

Usa `400` para request/validação, `401/403` para assinatura/sessão/CSRF, `404` para pedido não pertencente à sessão, `409` para estoque/cotação/tentativa concorrente, `422` para personalização bloqueada, `429` para limite e `503` para dependências indisponíveis. Não retorna stack trace, token, payload de provedor ou valores pessoais enviados.
