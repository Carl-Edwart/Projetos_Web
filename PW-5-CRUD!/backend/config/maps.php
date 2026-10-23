<?php
/**
 * backend/config/maps.php — Configuração da integração com o Google Maps.
 *
 * COMO ATIVAR O MAPA (leva ~3 minutos):
 *   1. Acesse https://console.cloud.google.com/google/maps-apis e crie/selecione um projeto
 *      (é necessário ter o faturamento habilitado; o Google dá crédito mensal gratuito).
 *   2. Ative as APIs: "Maps JavaScript API" e "Geocoding API" (esta última só é usada
 *      quando um país cadastrado não está na tabela interna de coordenadas).
 *   3. Em "Credenciais" crie uma chave de API e, por segurança, restrinja-a por
 *      "Referenciadores HTTP" (ex.: http://localhost/*  e o domínio de produção).
 *   4. Cole a chave abaixo, no lugar das aspas vazias — OU defina a variável de
 *      ambiente GOOGLE_MAPS_API_KEY no servidor.
 *
 * Atenção: não publique a sua chave em repositórios públicos.
 */

// ↓↓↓ COLE SUA CHAVE AQUI ↓↓↓
const GOOGLE_MAPS_API_KEY_PADRAO = 'AIzaSyDfspPrhpdjbM-imQG3DNROvQoT1076rpI';

define('GOOGLE_MAPS_API_KEY', trim((string) (getenv('GOOGLE_MAPS_API_KEY') ?: GOOGLE_MAPS_API_KEY_PADRAO)));

/** Map ID do Google Maps (necessário para os marcadores avançados). "DEMO_MAP_ID" funciona para testes. */
define('GOOGLE_MAPS_MAP_ID', trim((string) (getenv('GOOGLE_MAPS_MAP_ID') ?: 'DEMO_MAP_ID')));

/* ----------------------------------------------------------------------
 * Escola destacada no mapa — ETEC do Parque Residencial Aquarius,
 * São José dos Campos (Etec Profª Ilza Nascimento Pintus).
 * Fonte do endereço: Centro Paula Souza.
 * ---------------------------------------------------------------------- */
const ETEC_NOME     = 'Etec Profª Ilza Nascimento Pintus';
const ETEC_APELIDO  = 'ETEC Aquarius · São José dos Campos';
const ETEC_ENDERECO = 'Av. Salmão, 570 – Parque Residencial Aquarius, São José dos Campos – SP, 12246-260';
const ETEC_TELEFONE = '(12) 3941-1571';
const ETEC_SITE     = 'https://www.etecsjcampos.com.br/';
const ETEC_LAT      = -23.22002185;
const ETEC_LNG      = -45.90696525;
