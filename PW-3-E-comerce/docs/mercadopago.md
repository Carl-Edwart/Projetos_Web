# Mercado Pago: configuração e testes

Documentação oficial consultada em 01/10/2026. A integração escolhida é Checkout Transparente com **Orders API** e Card Payment Brick/MercadoPago.js, usando o SDK Node oficial.

## Criar a aplicação e obter credenciais

1. No painel Mercado Pago Developers, crie ou selecione a aplicação vinculada à conta vendedora.
2. Em **Credenciais de teste**, obtenha a Public Key e o Access Token de teste.
3. Em **Webhooks**, configure o evento **Order** e obtenha a assinatura secreta da aplicação.
4. Nunca use credenciais previamente expostas. Gere/rotacione credenciais e segredo, se houver suspeita de exposição.

## Onde ficam as credenciais

- `MERCADOPAGO_PUBLIC_KEY`: é pública e entregue ao navegador por `GET /api/config/payment`.
- `MERCADOPAGO_ACCESS_TOKEN`: somente backend; usado pelo SDK oficial para criar/consultar `/v1/orders`.
- `MERCADOPAGO_WEBHOOK_SECRET`: somente backend; usado pelo validador oficial de assinatura.
- `MERCADOPAGO_ENVIRONMENT`: `test` ou `production`; não substitui a credencial correspondente.

Preencha somente um `.env` local ou o gerenciador de secrets da plataforma. Não cole valores no chat e não versiona `.env`. `.env.example` contém nomes sem valores.

## Cartão e parcelamento

1. O navegador inicializa MercadoPago.js/Card Payment Brick com Public Key, total cotado no backend e dados do pagador já informados.
2. O Brick tokeniza os dados do cartão e mostra as opções de parcelamento disponibilizadas para cartão, emissor e valor.
3. O backend ignora valores financeiros do cliente, valida o total e chama o SDK oficial `Order.create` com o token, método de crédito, quantidade escolhida e `X-Idempotency-Key`.
4. Não há lista fixa de parcelas, tabela local de juros ou alegação de “sem juros”. O retorno do Brick e da Order API é a fonte para os valores exibidos.
5. O backend nunca armazena número do cartão ou CVV.

## Webhook

Configure uma URL HTTPS pública apontando para `/api/webhooks/mercadopago` e habilite notificações de Order. A aplicação valida `x-signature`, `x-request-id` e `data.id` com `WebhookSignatureValidator` do SDK Node. Depois consulta `/v1/orders/{id}` usando Access Token, confere a referência, valor e moeda e aplica a transição idempotente.

Em desenvolvimento local, use um túnel HTTPS controlado para receber webhooks e configure a URL temporária no painel. Não coloque credenciais na URL.

## Ambiente de teste

- Use Public Key e Access Token de teste e `MERCADOPAGO_ENVIRONMENT=test`.
- Use usuários/cartões de teste descritos na documentação oficial. Eles simulam os resultados e não movimentam dinheiro real.
- Teste aprovação, pendência, recusa, tentativa inválida e status de parcelamento conforme o material vigente do Mercado Pago.
- Confirme o resultado no pedido retornado pela API e no webhook; não use somente a resposta visual do Brick.
- O status autoritativo é consultado pela Orders API (`GET /v1/orders/{id}`).

## Entrada em produção

1. Complete cadastro do negócio, domínio e HTTPS.
2. Teste criação, recusa, pendência, idempotência e webhook no ambiente de teste.
3. Configure o webhook HTTPS de produção e valide a assinatura.
4. Cadastre os segredos **de produção** no secret manager: Access Token, Public Key e webhook secret.
5. Configure `NODE_ENV=production` e `MERCADOPAGO_ENVIRONMENT=production`. O backend recusa iniciar em produção sem essa configuração e sem secrets obrigatórios.
6. Não reutilize o `.env` de teste em produção; não habilite cobranças reais durante desenvolvimento.

## Referências oficiais

- [Checkout Transparente — Orders API](https://www.mercadopago.com.br/developers/pt/docs/checkout-api-orders/overview)
- [Cartões para websites com Orders API](https://www.mercadopago.com.br/developers/pt/docs/checkout-api-orders/payment-integration/websites/cards)
- [Configurar parcelas no Card Payment Brick](https://www.mercadopago.com.br/developers/pt/docs/checkout-bricks/card-payment-brick/advanced-features/configure-installments)
- [Inicializar e-mail e identificação no Card Payment Brick](https://www.mercadopago.com.br/developers/pt/docs/checkout-bricks/card-payment-brick/advanced-features/initialize-data-on-the-bricks)
- [Notificações de Orders](https://www.mercadopago.com.br/developers/pt/docs/checkout-api-orders/notifications)
- [Status de Orders](https://www.mercadopago.com.br/developers/pt/docs/checkout-api-orders/payment-management/status/order-status)
- [SDK oficial Node.js](https://github.com/mercadopago/sdk-nodejs)
