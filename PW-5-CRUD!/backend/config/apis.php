<?php
/**
 * backend/config/apis.php — Configuração das APIs REST externas usadas pela aba "API Países".
 *
 *  1) REST Countries v5  (https://restcountries.com)
 *     Dados atualizados dos países: nomes, capital, população, área, moedas, idiomas, bandeiras...
 *     A v3.1 antiga foi descontinuada: a v5 exige uma chave de API (gratuita).
 *     → Cadastre-se em https://restcountries.com/sign-up e cole a chave abaixo.
 *     → Sem chave, o sistema usa a chave pública "rc_live_demo" (só para demonstração) e,
 *       se ela não bastar, cai automaticamente para a fonte secundária (CountriesNow).
 *
 *  2) CountriesNow  (https://countriesnow.space)
 *     Estados/províncias e cidades de cada país. Não precisa de chave.
 *
 * As chamadas são feitas pelo SERVIDOR (PHP/cURL): a chave nunca vai para o navegador e
 * não há problema de CORS. As respostas ficam em cache em disco para poupar a cota das APIs.
 */

// ↓↓↓ COLE SUA CHAVE DO REST COUNTRIES AQUI (opcional) ↓↓↓
const RESTCOUNTRIES_CHAVE_PADRAO = 'rc_live_e33fdada5fa2462280bf2d3b9e9e8c82';

define('RESTCOUNTRIES_CHAVE', trim((string) (getenv('RESTCOUNTRIES_API_KEY') ?: RESTCOUNTRIES_CHAVE_PADRAO)));
define('RESTCOUNTRIES_BASE', rtrim((string) (getenv('RESTCOUNTRIES_BASE') ?: 'https://api.restcountries.com/countries/v5'), '/'));
define('COUNTRIESNOW_BASE', rtrim((string) (getenv('COUNTRIESNOW_BASE') ?: 'https://countriesnow.space/api/v0.1'), '/'));

/** CDN gratuito de bandeiras do REST Countries (usado quando a API não devolve a URL da bandeira) */
const BANDEIRA_CDN = 'https://flags.restcountries.com/v5';

/** Tempo máximo (segundos) de cada requisição às APIs */
const APIS_TIMEOUT = 15;

/** Validade do cache, em segundos */
const APIS_CACHE_PAISES = 3600;    // dados dos países mudam pouco (a API sincroniza a cada 4h)
const APIS_CACHE_GEO    = 604800;  // estados e cidades: 7 dias

/**
 * Em alguns Windows/XAMPP o PHP não encontra os certificados raiz e o cURL falha com
 * "SSL certificate problem". Com `true`, o sistema tenta primeiro verificar o certificado
 * (usando os pacotes de certificados do XAMPP, se existirem) e, só se isso falhar,
 * repete a chamada sem verificação. Os dados consultados são públicos.
 * Em produção, deixe `false` e configure o curl.cainfo no php.ini.
 */
const APIS_PERMITIR_SSL_INSEGURO = true;
