# Privacidade, segurança e LGPD

Este documento descreve a implementação técnica. A definição do controlador, base legal, direitos dos titulares, prazos de retenção e comunicações formais deve ser revisada pelo responsável pelo negócio e por assessoria jurídica apropriada; este documento não determina obrigações jurídicas.

## Dados coletados e finalidade

| Dado | Finalidade técnica |
|---|---|
| Nome completo | Identificar o comprador e montar os dados mínimos do pagador. |
| CPF | Validar estruturalmente o CPF e identificar o pagador no Mercado Pago. |
| RG | Identificação no fluxo do negócio; não é enviado ao Mercado Pago. |
| Data de nascimento | Dado solicitado no checkout; não é enviado ao Mercado Pago. |
| Telefone | Contato/identificação do comprador e dado de pagador quando necessário. |
| E-mail | Campo necessário ao fluxo de pagamento e contato do pedido. |
| Turma e modalidade | Identificar/organizar o pedido conforme o negócio. |
| Nome/número personalizados e opção de ônibus/camiseta | Produzir, separar e cumprir os itens comprados. |
| Token do cartão | Transmitido em memória do navegador ao backend e ao Mercado Pago para processar aquela tentativa. Não é persistido. |

## Armazenamento e proteção

- PostgreSQL não é acessível pela internet pública; conexão de produção deve usar TLS e acesso de rede restrito.
- CPF e RG são cifrados individualmente com AES-256-GCM antes de gravar no banco. A chave de 32 bytes é `PII_ENCRYPTION_KEY`, fora do banco e do repositório.
- Outros dados operacionais de pedido permanecem em colunas/tabelas privadas para permitir o cumprimento da compra. Devem contar com criptografia do volume/backups, grants mínimos e restrição de acesso a operadores autorizados.
- Configurações personalizadas, preços históricos e totais ficam associados ao pedido. O endpoint de pedido só responde à sessão anônima que o criou e não devolve CPF, RG, telefone ou e-mail.
- Os IDs públicos são aleatórios. CPF/RG e outros dados pessoais nunca são colocados em URL, identificador, resposta de erro ou log.
- Logs não incluem bodies, cookies, tokens, assinatura, CPF/RG, e-mail ou telefone. Eventos de webhook guardam somente referência, estado e resumo financeiro seguro.
- A Public Key é pública; Access Token, webhook secret e chave de criptografia são secrets de backend.

## Compartilhamento com Mercado Pago

Para criar uma Order, o backend envia ao Mercado Pago o e-mail, nome, CPF e telefone necessários ao pagador, além do token de cartão, método e parcelas. RG, data de nascimento, turma, modalidade e configurações pessoais do item não são enviados pelo adaptador. A plataforma processa os dados do cartão diretamente pelo Card Payment Brick; a loja não persiste PAN/CVV.

## Acesso operacional e retenção

Não há painel administrativo nem endpoint público de gestão. Acesso técnico ao banco e às chaves deve ser limitado às pessoas autorizadas pelo controlador, com MFA no provedor, auditoria e separação de ambientes. O fluxo de operação para consultar pedidos e cumprir vendas deve ser formalizado antes da abertura ao público.

Os períodos de retenção e a rotina de exclusão/anonimização ainda não foram configurados porque dependem da finalidade operacional e de requisitos aplicáveis ao negócio. Defina prazo para pedidos abandonados, cancelados e concluídos, além da retenção de backups, após revisão adequada.

## Pontos de revisão antes da produção

- Identificar controlador, contato de privacidade e canal para solicitações de titulares no aviso público.
- Definir quem precisa acessar pedidos para produção/entrega, com controles compatíveis.
- Definir retenção, descarte e restauração de backups.
- Avaliar vendas para menores, dado que nascimento/turma são coletados.
- Avaliar o texto final do aviso de privacidade e as bases aplicáveis com assessoria apropriada.
