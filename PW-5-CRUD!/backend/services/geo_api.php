<?php
/**
 * backend/services/geo_api.php — integração com as APIs REST de países, estados e cidades.
 *
 *   · REST Countries v5 → dados atualizados dos países + bandeiras
 *   · CountriesNow      → estados e cidades (e fonte secundária de países/bandeiras)
 *
 * Tudo roda no servidor (cURL) e é guardado em cache em disco.
 */
require_once __DIR__ . '/../config/apis.php';
require_once __DIR__ . '/../config/coordenadas.php';

/* ===================================================================
 * HTTP
 * =================================================================== */

/** Procura um pacote de certificados (útil em XAMPP/Windows) */
function geoCaBundle(): ?string
{
    $candidatos = [
        ini_get('curl.cainfo'),
        ini_get('openssl.cafile'),
        'C:/xampp/apache/bin/curl-ca-bundle.crt',
        'C:/xampp/php/extras/ssl/cacert.pem',
        '/opt/lampp/share/curl/curl-ca-bundle.crt',
        '/etc/ssl/certs/ca-certificates.crt',
        '/etc/pki/tls/certs/ca-bundle.crt',
    ];
    foreach ($candidatos as $c) {
        if (is_string($c) && $c !== '' && @is_file($c) && @is_readable($c)) {
            return $c;
        }
    }
    return null;
}

/**
 * Requisição HTTP (GET ou POST com JSON).
 * @return array{ok:bool,status:int,json:mixed,erro:?string}
 */
function geoHttp(string $metodo, string $url, array $cabecalhos = [], ?array $json = null): array
{
    $res = ['ok' => false, 'status' => 0, 'json' => null, 'erro' => null];
    $corpo = $json !== null ? json_encode($json, JSON_UNESCAPED_UNICODE) : null;

    $cab = array_merge(['Accept: application/json', 'User-Agent: CRUD-Mundo/1.0 (projeto escolar)'], $cabecalhos);
    if ($corpo !== null) {
        $cab[] = 'Content-Type: application/json';
    }

    $texto = null;
    $status = 0;

    if (function_exists('curl_init')) {
        foreach ([true, false] as $verificar) {
            if (!$verificar && !APIS_PERMITIR_SSL_INSEGURO) {
                break;
            }
            $ch = curl_init($url);
            curl_setopt_array($ch, [
                CURLOPT_RETURNTRANSFER => true,
                CURLOPT_FOLLOWLOCATION => true,
                CURLOPT_MAXREDIRS      => 3,
                CURLOPT_CONNECTTIMEOUT => 8,
                CURLOPT_TIMEOUT        => APIS_TIMEOUT,
                CURLOPT_HTTPHEADER     => $cab,
                CURLOPT_ENCODING       => '',
                CURLOPT_CUSTOMREQUEST  => $metodo,
            ]);
            if ($corpo !== null) {
                curl_setopt($ch, CURLOPT_POSTFIELDS, $corpo);
            }
            if ($verificar) {
                $ca = geoCaBundle();
                if ($ca) {
                    curl_setopt($ch, CURLOPT_CAINFO, $ca);
                }
            } else {
                curl_setopt($ch, CURLOPT_SSL_VERIFYPEER, false);
                curl_setopt($ch, CURLOPT_SSL_VERIFYHOST, 0);
            }
            $texto  = curl_exec($ch);
            $errno  = curl_errno($ch);
            $status = (int) curl_getinfo($ch, CURLINFO_RESPONSE_CODE);
            $erro   = curl_error($ch);
            curl_close($ch);

            if ($errno === 0) {
                $res['erro'] = null;
                break;
            }
            $res['erro'] = $erro !== '' ? $erro : 'Falha de conexão';
            $texto = null;
            // só repete (sem verificação) se o problema foi de certificado SSL
            if (!in_array($errno, [35, 51, 58, 60, 77, 83], true)) {
                break;
            }
        }
    } else {
        $ctx = stream_context_create([
            'http' => [
                'method'        => $metodo,
                'header'        => implode("\r\n", $cab),
                'content'       => $corpo ?? '',
                'timeout'       => APIS_TIMEOUT,
                'ignore_errors' => true,
            ],
        ]);
        $texto = @file_get_contents($url, false, $ctx);
        if ($texto === false) {
            $texto = null;
            $res['erro'] = 'Sem conexão com a API (verifique a internet/firewall; no php.ini habilite curl ou allow_url_fopen)';
        } elseif (!empty($http_response_header[0]) && preg_match('~\s(\d{3})\s~', $http_response_header[0], $m)) {
            $status = (int) $m[1];
        }
    }

    $res['status'] = $status;
    if ($texto === null) {
        return $res;
    }

    $json = json_decode($texto, true);
    $res['json'] = $json;

    if ($status >= 200 && $status < 300 && $json !== null) {
        $res['ok'] = true;
        return $res;
    }

    if (is_array($json)) {
        $res['erro'] = $json['errors'][0]['message'] ?? $json['msg'] ?? $json['message'] ?? $json['error'] ?? null;
        if (!is_string($res['erro'])) {
            $res['erro'] = null;
        }
    }
    $res['erro'] = $res['erro'] ?? ($status >= 200 && $status < 300 ? 'Resposta inválida da API' : 'HTTP ' . $status);
    if ($status === 401 || $status === 403) {
        $res['erro'] .= ' — verifique a chave do REST Countries em backend/config/apis.php';
    }
    return $res;
}

/* ===================================================================
 * Cache em disco
 * =================================================================== */

function geoCacheDir(): string
{
    $dir = rtrim(sys_get_temp_dir(), '/\\') . DIRECTORY_SEPARATOR . 'crud_mundo_cache';
    if (!is_dir($dir)) {
        @mkdir($dir, 0775, true);
    }
    return $dir;
}

function geoCacheArquivo(string $chave): string
{
    return geoCacheDir() . DIRECTORY_SEPARATOR . preg_replace('/[^a-z0-9_]/i', '_', $chave) . '_' . substr(md5($chave), 0, 8) . '.json';
}

/** @return array{t:int,d:mixed}|null */
function geoCacheLer(string $chave): ?array
{
    $arq = geoCacheArquivo($chave);
    if (!is_file($arq)) {
        return null;
    }
    $c = json_decode((string) @file_get_contents($arq), true);
    return is_array($c) && isset($c['t']) && array_key_exists('d', $c) ? $c : null;
}

function geoCacheGravar(string $chave, $dados): void
{
    @file_put_contents(geoCacheArquivo($chave), json_encode(['t' => time(), 'd' => $dados], JSON_UNESCAPED_UNICODE | JSON_INVALID_UTF8_SUBSTITUTE), LOCK_EX);
}

/** Apaga todo o cache das APIs */
function geoCacheLimpar(): int
{
    $n = 0;
    foreach (glob(geoCacheDir() . DIRECTORY_SEPARATOR . '*.json') ?: [] as $f) {
        if (@unlink($f)) {
            $n++;
        }
    }
    return $n;
}

/**
 * Busca com cache. `$busca` devolve ['ok'=>bool,'dados'=>mixed,'erro'=>?string].
 * Se a API falhar e houver cache vencido, usa-o ("obsoleto") em vez de quebrar.
 * @return array{ok:bool,dados:mixed,erro:?string,cache:bool,obsoleto:bool,quando:?int}
 */
function geoCached(string $chave, int $ttl, callable $busca, bool $forcar = false): array
{
    $c = geoCacheLer($chave);
    if ($c && !$forcar && (time() - (int) $c['t']) < $ttl) {
        return ['ok' => true, 'dados' => $c['d'], 'erro' => null, 'cache' => true, 'obsoleto' => false, 'quando' => (int) $c['t']];
    }

    $r = $busca();
    if (!empty($r['ok'])) {
        geoCacheGravar($chave, $r['dados']);
        return ['ok' => true, 'dados' => $r['dados'], 'erro' => null, 'cache' => false, 'obsoleto' => false, 'quando' => time()];
    }
    if ($c) {
        return ['ok' => true, 'dados' => $c['d'], 'erro' => $r['erro'] ?? null, 'cache' => true, 'obsoleto' => true, 'quando' => (int) $c['t']];
    }
    return ['ok' => false, 'dados' => null, 'erro' => $r['erro'] ?? 'Falha ao consultar a API', 'cache' => false, 'obsoleto' => false, 'quando' => null];
}

/* ===================================================================
 * Normalização de textos
 * =================================================================== */

/** minúsculas, sem acentos nem pontuação — para comparar nomes */
function geoNorm(string $s): string
{
    $s = mb_strtolower(trim($s), 'UTF-8');
    $s = strtr($s, [
        'á' => 'a', 'à' => 'a', 'â' => 'a', 'ã' => 'a', 'ä' => 'a', 'å' => 'a', 'ā' => 'a', 'ą' => 'a',
        'é' => 'e', 'è' => 'e', 'ê' => 'e', 'ë' => 'e', 'ē' => 'e', 'ę' => 'e', 'ě' => 'e',
        'í' => 'i', 'ì' => 'i', 'î' => 'i', 'ï' => 'i', 'ī' => 'i', 'ı' => 'i',
        'ó' => 'o', 'ò' => 'o', 'ô' => 'o', 'õ' => 'o', 'ö' => 'o', 'ø' => 'o', 'ō' => 'o',
        'ú' => 'u', 'ù' => 'u', 'û' => 'u', 'ü' => 'u', 'ū' => 'u', 'ů' => 'u',
        'ç' => 'c', 'č' => 'c', 'ć' => 'c', 'ñ' => 'n', 'ń' => 'n', 'ň' => 'n',
        'š' => 's', 'ś' => 's', 'ş' => 's', 'ž' => 'z', 'ź' => 'z', 'ż' => 'z',
        'ł' => 'l', 'ř' => 'r', 'ď' => 'd', 'ť' => 't', 'ğ' => 'g', 'ß' => 'ss', 'æ' => 'ae', 'œ' => 'oe',
    ]);
    $s = preg_replace('/[^a-z0-9]+/', ' ', $s) ?? $s;
    return trim($s);
}

/** Distância máxima de edição aceita como "provável" conforme o tamanho do nome */
function geoToleranciaTipo(string $n): int
{
    $len = strlen($n);
    if ($len <= 4) {
        return 0;
    }
    return $len <= 7 ? 1 : 2;
}

/** Nomes de cidades em português → como costumam aparecer nas bases internacionais */
function geoExonimos(): array
{
    static $m = null;
    if ($m !== null) {
        return $m;
    }
    $pares = [
        'lisboa' => 'lisbon', 'berlim' => 'berlin', 'londres' => 'london', 'toquio' => 'tokyo', 'pequim' => 'beijing',
        'xangai' => 'shanghai', 'nova delhi' => 'new delhi', 'nova deli' => 'new delhi', 'deli' => 'delhi', 'joanesburgo' => 'johannesburg',
        'nova york' => 'new york', 'nova iorque' => 'new york', 'bruxelas' => 'brussels', 'viena' => 'vienna', 'roma' => 'rome',
        'milao' => 'milan', 'veneza' => 'venice', 'florenca' => 'florence', 'napoles' => 'naples', 'turim' => 'turin',
        'genebra' => 'geneva', 'zurique' => 'zurich', 'basileia' => 'basel', 'copenhague' => 'copenhagen',
        'estocolmo' => 'stockholm', 'helsinque' => 'helsinki', 'moscou' => 'moscow', 'varsovia' => 'warsaw',
        'praga' => 'prague', 'budapeste' => 'budapest', 'atenas' => 'athens', 'istambul' => 'istanbul', 'ancara' => 'ankara',
        'cantao' => 'guangzhou', 'seul' => 'seoul', 'banguecoque' => 'bangkok', 'singapura' => 'singapore',
        'jacarta' => 'jakarta', 'bombaim' => 'mumbai', 'calcuta' => 'kolkata', 'catmandu' => 'kathmandu',
        'teera' => 'tehran', 'bagda' => 'baghdad', 'telavive' => 'tel aviv', 'tel aviv' => 'tel aviv', 'riade' => 'riyadh',
        'cidade do mexico' => 'mexico city', 'cidade do cabo' => 'cape town', 'adis abeba' => 'addis ababa',
        'argel' => 'algiers', 'tripoli' => 'tripoli', 'montevideu' => 'montevideo', 'assuncao' => 'asuncion',
        'amsterda' => 'amsterdam', 'edimburgo' => 'edinburgh', 'munique' => 'munich', 'colonia' => 'cologne',
        'hamburgo' => 'hamburg', 'sevilha' => 'seville', 'saragoca' => 'zaragoza', 'marselha' => 'marseille',
        'nova orleans' => 'new orleans', 'sao francisco' => 'san francisco', 'filadelfia' => 'philadelphia',
        'sidnei' => 'sydney', 'melburne' => 'melbourne', 'cracovia' => 'krakow', 'gotemburgo' => 'gothenburg',
        'bucareste' => 'bucharest', 'belgrado' => 'belgrade', 'sofia' => 'sofia', 'kiev' => 'kyiv', 'quieve' => 'kyiv',
        'minsk' => 'minsk', 'cairo' => 'cairo', 'alexandria' => 'alexandria', 'tunes' => 'tunis', 'rabate' => 'rabat',
        'casablanca' => 'casablanca', 'dacar' => 'dakar', 'lagos' => 'lagos', 'nairobi' => 'nairobi', 'luanda' => 'luanda',
        'maputo' => 'maputo', 'hanoi' => 'hanoi', 'kuala lumpur' => 'kuala lumpur', 'taipei' => 'taipei', 'osaca' => 'osaka',
        'quioto' => 'kyoto', 'bruges' => 'bruges', 'antuerpia' => 'antwerp', 'haia' => 'the hague', 'lion' => 'lyon',
        'nice' => 'nice', 'bordeus' => 'bordeaux', 'cidade do panama' => 'panama city', 'sao jose' => 'san jose',
        'sao paulo' => 'sao paulo', 'brasilia' => 'brasilia', 'belem' => 'belem', 'belo horizonte' => 'belo horizonte',
    ];
    $m = [];
    foreach ($pares as $pt => $en) {
        $m[$pt] = $en;
    }
    return $m;
}

/* ===================================================================
 * Países — REST Countries v5 (com CountriesNow como reserva)
 * =================================================================== */

function geoTexto($v): string
{
    return is_scalar($v) ? trim((string) $v) : '';
}

/** Converte um registro do REST Countries v5 para o formato interno compacto */
function geoNormalizarPais(array $o): array
{
    $nomes = $o['names'] ?? [];
    $codigos = $o['codes'] ?? [];
    $iso2 = strtoupper(geoTexto($codigos['alpha_2'] ?? ''));

    $capitais = [];
    foreach ((array) ($o['capitals'] ?? []) as $cap) {
        $n = is_array($cap) ? geoTexto($cap['name'] ?? '') : geoTexto($cap);
        if ($n !== '') {
            $capitais[] = $n;
        }
    }

    $moedas = [];
    foreach ((array) ($o['currencies'] ?? []) as $chave => $m) {
        if (is_array($m)) {
            $moedas[] = [
                'codigo'  => geoTexto($m['code'] ?? (is_string($chave) ? $chave : '')),
                'nome'    => geoTexto($m['name'] ?? ''),
                'simbolo' => geoTexto($m['symbol'] ?? ''),
            ];
        } elseif (is_string($m)) {
            $moedas[] = ['codigo' => is_string($chave) ? $chave : '', 'nome' => $m, 'simbolo' => ''];
        }
    }

    $idiomas = [];
    foreach ((array) ($o['languages'] ?? []) as $l) {
        $n = is_array($l) ? geoTexto($l['name'] ?? $l['english_name'] ?? $l['native_name'] ?? '') : geoTexto($l);
        if ($n !== '') {
            $idiomas[] = $n;
        }
    }

    $bandeira = $o['flag'] ?? [];
    $minusc = strtolower($iso2);
    $pop = $o['population'] ?? null;
    if (is_array($pop)) {
        $pop = $pop['value'] ?? null;
    }

    return [
        'iso2'         => $iso2,
        'iso3'         => strtoupper(geoTexto($codigos['alpha_3'] ?? '')),
        'nome'         => geoTexto($nomes['common'] ?? ''),
        'oficial'      => geoTexto($nomes['official'] ?? ''),
        'alternativos' => array_values(array_filter(array_map('geoTexto', (array) ($nomes['alternates'] ?? [])))),
        'nomePt'       => $iso2 !== '' ? nomePtPorIso($iso2) : null,
        'capitais'     => $capitais,
        'regiao'       => geoTexto($o['region'] ?? ''),
        'subregiao'    => geoTexto($o['subregion'] ?? ''),
        'continentes'  => array_values(array_filter(array_map('geoTexto', (array) ($o['continents'] ?? [])))),
        'populacao'    => is_numeric($pop) ? (int) $pop : null,
        'area'         => is_numeric($o['area']['kilometers'] ?? null) ? (float) $o['area']['kilometers'] : null,
        'moedas'       => $moedas,
        'idiomas'      => $idiomas,
        'fronteiras'   => array_values(array_filter(array_map('geoTexto', (array) ($o['borders'] ?? [])))),
        'fusos'        => array_values(array_filter(array_map('geoTexto', (array) ($o['timezones'] ?? [])))),
        'ddi'          => array_values(array_filter(array_map('geoTexto', (array) ($o['calling_codes'] ?? [])))),
        'tld'          => array_values(array_filter(array_map('geoTexto', (array) ($o['tlds'] ?? [])))),
        'lado'         => geoTexto($o['cars']['driving_side'] ?? ''),
        'semLitoral'   => isset($o['landlocked']) ? (bool) $o['landlocked'] : null,
        'onu'          => isset($o['memberships']['un']) ? (bool) $o['memberships']['un'] : (isset($o['classification']['un_member']) ? (bool) $o['classification']['un_member'] : null),
        'soberano'     => isset($o['classification']['sovereign']) ? (bool) $o['classification']['sovereign'] : null,
        'lat'          => is_numeric($o['coordinates']['lat'] ?? null) ? (float) $o['coordinates']['lat'] : null,
        'lng'          => is_numeric($o['coordinates']['lng'] ?? null) ? (float) $o['coordinates']['lng'] : null,
        'emoji'        => geoTexto($bandeira['emoji'] ?? ''),
        'bandeiraPng'  => geoTexto($bandeira['url_png'] ?? '') ?: ($minusc !== '' ? BANDEIRA_CDN . '/w320/' . $minusc . '.png' : ''),
        'bandeiraSvg'  => geoTexto($bandeira['url_svg'] ?? '') ?: ($minusc !== '' ? BANDEIRA_CDN . '/svg/' . $minusc . '.svg' : ''),
        'mapa'         => geoTexto($o['links']['google_maps'] ?? ''),
        'wikipedia'    => geoTexto($o['links']['wikipedia'] ?? ''),
        'fonte'        => 'restcountries',
    ];
}

/** Fonte secundária (CountriesNow): nome, ISO, bandeira, capital e moeda */
function geoPaisesCountriesNow(): array
{
    $r = geoHttp('GET', COUNTRIESNOW_BASE . '/countries/flag/images');
    $lista = $r['json']['data'] ?? null;
    if (!$r['ok'] || !is_array($lista) || !$lista) {
        return ['ok' => false, 'erro' => $r['erro'] ?? 'CountriesNow indisponível', 'dados' => []];
    }

    $capitais = [];
    $rc = geoHttp('GET', COUNTRIESNOW_BASE . '/countries/capital');
    foreach ((array) ($rc['json']['data'] ?? []) as $l) {
        if (is_array($l) && !empty($l['iso2']) && !empty($l['capital'])) {
            $capitais[strtoupper($l['iso2'])] = geoTexto($l['capital']);
        }
    }
    $moedas = [];
    $rm = geoHttp('GET', COUNTRIESNOW_BASE . '/countries/currency');
    foreach ((array) ($rm['json']['data'] ?? []) as $l) {
        if (is_array($l) && !empty($l['iso2']) && !empty($l['currency'])) {
            $moedas[strtoupper($l['iso2'])] = geoTexto($l['currency']);
        }
    }

    $out = [];
    foreach ($lista as $l) {
        if (!is_array($l) || empty($l['iso2'])) {
            continue;
        }
        $iso2 = strtoupper(geoTexto($l['iso2']));
        $min = strtolower($iso2);
        $out[] = [
            'iso2' => $iso2, 'iso3' => strtoupper(geoTexto($l['iso3'] ?? '')),
            'nome' => geoTexto($l['name'] ?? ''), 'oficial' => '', 'alternativos' => [],
            'nomePt' => nomePtPorIso($iso2),
            'capitais' => isset($capitais[$iso2]) ? [$capitais[$iso2]] : [],
            'regiao' => '', 'subregiao' => '', 'continentes' => [],
            'populacao' => null, 'area' => null,
            'moedas' => isset($moedas[$iso2]) ? [['codigo' => '', 'nome' => $moedas[$iso2], 'simbolo' => '']] : [],
            'idiomas' => [], 'fronteiras' => [], 'fusos' => [], 'ddi' => [], 'tld' => [], 'lado' => '',
            'semLitoral' => null, 'onu' => null, 'soberano' => null, 'lat' => null, 'lng' => null, 'emoji' => '',
            'bandeiraPng' => BANDEIRA_CDN . '/w320/' . $min . '.png',
            'bandeiraSvg' => geoTexto($l['flag'] ?? '') ?: BANDEIRA_CDN . '/svg/' . $min . '.svg',
            'mapa' => '', 'wikipedia' => '', 'fonte' => 'countriesnow',
        ];
    }
    return ['ok' => true, 'dados' => $out, 'erro' => null];
}

/**
 * Todos os países (cache de 1h).
 * @return array{ok:bool,dados:mixed,erro:?string,cache:bool,obsoleto:bool,quando:?int}
 *   dados = ['lista'=>[...], 'demo'=>bool, 'fonte'=>string, 'avisoRc'=>?string]
 */
function geoPaises(bool $forcar = false): array
{
    // a chave do cache inclui a chave/URL da API: trocar a chave no config invalida o cache antigo
    $chaveCache = 'paises_v5_' . substr(md5(RESTCOUNTRIES_BASE . '|' . RESTCOUNTRIES_CHAVE . '|' . COUNTRIESNOW_BASE), 0, 8);
    return geoCached($chaveCache, APIS_CACHE_PAISES, function () {
        $omitir = 'names.translations,leaders,flag.colors,date,number_format,units,postal_code,economy';
        $rc = [];
        $demo = false;
        $avisoRc = null;
        $offset = 0;

        for ($pagina = 0; $pagina < 6; $pagina++) {
            $r = geoHttp(
                'GET',
                RESTCOUNTRIES_BASE . '?limit=100&offset=' . $offset . '&response_fields_omit=' . rawurlencode($omitir),
                ['Authorization: Bearer ' . RESTCOUNTRIES_CHAVE]
            );
            if (!$r['ok']) {
                $avisoRc = $r['erro'];
                break;
            }
            $dados = $r['json']['data'] ?? [];
            if (isset($dados['_demo'])) {
                $demo = true;
            }
            foreach ((array) ($dados['objects'] ?? []) as $obj) {
                if (is_array($obj)) {
                    $p = geoNormalizarPais($obj);
                    if ($p['iso2'] !== '') {
                        $rc[$p['iso2']] = $p;
                    }
                }
            }
            if (empty($dados['meta']['more'])) {
                break;
            }
            $offset += 100;
        }

        if ($demo && $avisoRc === null) {
            $avisoRc = 'chave de demonstração (rc_live_demo): a API devolve apenas dados de exemplo';
        }

        // Dados completos? (a API tem ~250 registros)
        if (count($rc) >= 200 && !$demo) {
            return ['ok' => true, 'erro' => null, 'dados' => ['lista' => array_values($rc), 'demo' => false, 'fonte' => 'restcountries', 'avisoRc' => null]];
        }

        // Caso contrário completa com a fonte secundária
        $cn = geoPaisesCountriesNow();
        if (!$cn['ok'] && !$rc) {
            return ['ok' => false, 'erro' => ($avisoRc ? $avisoRc . ' · ' : '') . $cn['erro'], 'dados' => null];
        }
        $mistura = $rc;
        foreach ($cn['dados'] as $p) {
            if (!isset($mistura[$p['iso2']])) {
                $mistura[$p['iso2']] = $p;
            }
        }
        return ['ok' => true, 'erro' => null, 'dados' => [
            'lista'   => array_values($mistura),
            'demo'    => $demo,
            'fonte'   => $rc ? 'misto' : 'countriesnow',
            'avisoRc' => $avisoRc,
        ]];
    }, $forcar);
}

/** Índice ISO2 → país para a requisição atual */
function geoIndicePaises(array $lista): array
{
    $idx = [];
    foreach ($lista as $p) {
        $idx[$p['iso2']] = $p;
    }
    return $idx;
}

/**
 * Localiza, na lista da API, o país cadastrado no banco (nome em português).
 * @return array{pais:?array,como:?string}
 */
function geoAcharPais(array $lista, string $nomeCadastro): array
{
    $idx = geoIndicePaises($lista);

    $coord = coordenadaPais($nomeCadastro);
    if ($coord) {
        $iso = strtoupper($coord['iso']);
        if (isset($idx[$iso])) {
            return ['pais' => $idx[$iso], 'como' => 'iso'];
        }
    }

    $alvo = geoNorm($nomeCadastro);
    if ($alvo === '') {
        return ['pais' => null, 'como' => null];
    }
    foreach ($lista as $p) {
        $nomes = array_merge([$p['nome'], $p['oficial'], (string) $p['nomePt']], $p['alternativos']);
        foreach ($nomes as $n) {
            if ($n !== '' && geoNorm($n) === $alvo) {
                return ['pais' => $p, 'como' => 'nome'];
            }
        }
    }

    // aproximado (erro de digitação): só aceita se houver exatamente um candidato
    $tol = geoToleranciaTipo($alvo);
    if ($tol > 0) {
        $achados = [];
        foreach ($lista as $p) {
            foreach ([$p['nome'], (string) $p['nomePt']] as $n) {
                $nn = geoNorm($n);
                if ($nn !== '' && abs(strlen($nn) - strlen($alvo)) <= $tol && levenshtein($nn, $alvo) <= $tol) {
                    $achados[$p['iso2']] = $p;
                }
            }
        }
        if (count($achados) === 1) {
            return ['pais' => array_values($achados)[0], 'como' => 'aproximado'];
        }
    }
    return ['pais' => null, 'como' => null];
}

/** Resumo para a grade do explorador */
function geoListaCompacta(array $lista): array
{
    $out = [];
    foreach ($lista as $p) {
        $out[] = [
            'iso2' => $p['iso2'], 'nome' => $p['nome'], 'nomePt' => $p['nomePt'],
            'regiao' => $p['regiao'], 'populacao' => $p['populacao'], 'bandeira' => $p['bandeiraPng'],
        ];
    }
    usort($out, static fn ($a, $b) => strcmp(geoNorm($a['nomePt'] ?: $a['nome']), geoNorm($b['nomePt'] ?: $b['nome'])));
    return $out;
}

/* ===================================================================
 * Estados e cidades — CountriesNow
 * =================================================================== */

/** Nomes que o CountriesNow pode usar para o país (o primeiro que funcionar é guardado) */
function geoNomesCountriesNow(array $pais): array
{
    $alias = [
        'CZ' => ['Czech Republic'], 'CI' => ['Ivory Coast', "Cote d'Ivoire"], 'MM' => ['Myanmar', 'Burma'],
        'TR' => ['Turkey', 'Turkiye'], 'KR' => ['South Korea', 'Korea, South'], 'KP' => ['North Korea', 'Korea, North'],
        'RU' => ['Russia', 'Russian Federation'], 'US' => ['United States', 'United States of America'],
        'GB' => ['United Kingdom'], 'CD' => ['Democratic Republic of the Congo', 'Congo, The Democratic Republic of the'],
        'CG' => ['Republic of the Congo', 'Congo'], 'VN' => ['Vietnam', 'Viet Nam'], 'CV' => ['Cape Verde', 'Cabo Verde'],
        'SZ' => ['Eswatini', 'Swaziland'], 'MK' => ['North Macedonia', 'Macedonia'], 'NL' => ['Netherlands', 'The Netherlands'],
        'IR' => ['Iran'], 'SY' => ['Syria'], 'LA' => ['Laos'], 'TZ' => ['Tanzania'], 'BO' => ['Bolivia'], 'VE' => ['Venezuela'],
        'MD' => ['Moldova'], 'PS' => ['Palestine'], 'TW' => ['Taiwan'], 'BA' => ['Bosnia and Herzegovina'],
        'TL' => ['Timor-Leste', 'East Timor'], 'BS' => ['The Bahamas', 'Bahamas'], 'GM' => ['The Gambia', 'Gambia'],
    ];
    $c = [$pais['nome'], $pais['oficial']];
    foreach ($alias[$pais['iso2']] ?? [] as $a) {
        array_unshift($c, $a);
    }
    foreach ($pais['alternativos'] as $a) {
        $c[] = $a;
    }
    $c = array_values(array_unique(array_filter($c, static fn ($x) => $x !== '')));
    return array_slice($c, 0, 6);
}

/** POST no CountriesNow. @return array{ok:bool,rede:bool,data:mixed,erro:?string} */
function geoCN(string $caminho, array $corpo): array
{
    $r = geoHttp('POST', COUNTRIESNOW_BASE . $caminho, [], $corpo);
    $j = $r['json'];
    if (is_array($j) && array_key_exists('error', $j)) {
        if ($j['error'] === false) {
            return ['ok' => true, 'rede' => false, 'data' => $j['data'] ?? null, 'erro' => null];
        }
        return ['ok' => false, 'rede' => false, 'data' => null, 'erro' => geoTexto($j['msg'] ?? 'não encontrado')];
    }
    // sem JSON válido: problema de rede/servidor
    return ['ok' => false, 'rede' => true, 'data' => null, 'erro' => $r['erro'] ?? 'CountriesNow indisponível'];
}

/**
 * Estados/províncias de um país.
 * dados = ['nomeApi'=>string|null, 'estados'=>[['nome','codigo']...]]
 */
function geoEstados(array $pais, bool $forcar = false): array
{
    return geoCached('estados_' . $pais['iso2'], APIS_CACHE_GEO, function () use ($pais) {
        $falhaRede = null;
        foreach (geoNomesCountriesNow($pais) as $nome) {
            $r = geoCN('/countries/states', ['country' => $nome]);
            if ($r['ok'] && is_array($r['data'])) {
                $estados = [];
                foreach ((array) ($r['data']['states'] ?? []) as $e) {
                    if (is_array($e) && !empty($e['name'])) {
                        $estados[] = ['nome' => geoTexto($e['name']), 'codigo' => geoTexto($e['state_code'] ?? '')];
                    }
                }
                return ['ok' => true, 'erro' => null, 'dados' => ['nomeApi' => geoTexto($r['data']['name'] ?? $nome) ?: $nome, 'estados' => $estados]];
            }
            if ($r['rede']) {
                $falhaRede = $r['erro'];
                break;
            }
        }
        if ($falhaRede !== null) {
            return ['ok' => false, 'erro' => $falhaRede, 'dados' => null];
        }
        // o país não consta na base de estados (comum em territórios pequenos)
        return ['ok' => true, 'erro' => null, 'dados' => ['nomeApi' => null, 'estados' => []]];
    }, $forcar);
}

/** Lista de cidades do país. dados = ['nomeApi'=>string, 'cidades'=>string[]] */
function geoCidadesPais(array $pais, bool $forcar = false): array
{
    return geoCached('cidades_' . $pais['iso2'], APIS_CACHE_GEO, function () use ($pais) {
        $falhaRede = null;
        foreach (geoNomesCountriesNow($pais) as $nome) {
            $r = geoCN('/countries/cities', ['country' => $nome]);
            if ($r['ok'] && is_array($r['data'])) {
                $cidades = array_values(array_filter(array_map('geoTexto', $r['data']), static fn ($x) => $x !== ''));
                return ['ok' => true, 'erro' => null, 'dados' => ['nomeApi' => $nome, 'cidades' => $cidades]];
            }
            if ($r['rede']) {
                $falhaRede = $r['erro'];
                break;
            }
        }
        if ($falhaRede !== null) {
            return ['ok' => false, 'erro' => $falhaRede, 'dados' => null];
        }
        return ['ok' => true, 'erro' => null, 'dados' => ['nomeApi' => null, 'cidades' => []]];
    }, $forcar);
}

/** Cidades de um estado (nome do estado exatamente como a API o chama) */
function geoCidadesEstado(array $pais, string $nomePaisApi, string $estadoApi, bool $forcar = false): array
{
    return geoCached('cidades_' . $pais['iso2'] . '_' . geoNorm($estadoApi), APIS_CACHE_GEO, function () use ($nomePaisApi, $estadoApi) {
        $r = geoCN('/countries/state/cities', ['country' => $nomePaisApi, 'state' => $estadoApi]);
        if ($r['ok'] && is_array($r['data'])) {
            return ['ok' => true, 'erro' => null, 'dados' => array_values(array_filter(array_map('geoTexto', $r['data'])))];
        }
        if ($r['rede']) {
            return ['ok' => false, 'erro' => $r['erro'], 'dados' => null];
        }
        return ['ok' => true, 'erro' => null, 'dados' => []];
    }, $forcar);
}

/* ===================================================================
 * Validações
 * =================================================================== */

/** Procura o estado (por nome ou sigla) dentro da lista da API */
function geoAcharEstado(array $estados, string $texto): array
{
    $alvo = geoNorm($texto);
    $alvo = preg_replace('/^(estado|provincia|state|province|regiao|region)( de| do| da| of)? /', '', $alvo) ?? $alvo;
    if ($alvo === '') {
        return ['estado' => null, 'como' => null];
    }
    foreach ($estados as $e) {
        if (geoNorm($e['nome']) === $alvo || ($e['codigo'] !== '' && geoNorm($e['codigo']) === $alvo)) {
            return ['estado' => $e, 'como' => 'exato'];
        }
    }
    $tol = geoToleranciaTipo($alvo);
    if ($tol > 0) {
        $melhor = null;
        $dist = 99;
        foreach ($estados as $e) {
            $n = geoNorm($e['nome']);
            $d = levenshtein($n, $alvo);
            if ($d <= $tol && $d < $dist) {
                $melhor = $e;
                $dist = $d;
            }
        }
        if ($melhor) {
            return ['estado' => $melhor, 'como' => 'aproximado'];
        }
    }
    return ['estado' => null, 'como' => null];
}

/** Índice normalizado (nome sem acento → nome original) das cidades de um país, por requisição */
function geoIndiceCidades(string $iso2, array $cidades): array
{
    static $memo = [];
    if (!isset($memo[$iso2])) {
        $idx = [];
        foreach ($cidades as $c) {
            $n = geoNorm($c);
            if ($n !== '' && !isset($idx[$n])) {
                $idx[$n] = $c;
            }
        }
        $memo[$iso2] = $idx;
    }
    return $memo[$iso2];
}

/**
 * Valida uma cidade dentro de um país.
 * status: confirmada | provavel | nao_encontrada | indisponivel
 * @return array{status:string,correspondencia:?string,detalhe:string,fonte:?string}
 */
function geoValidarCidade(array $pais, string $cidade, bool $forcar = false): array
{
    $alvo = geoNorm($cidade);
    if ($alvo === '') {
        return ['status' => 'nao_encontrada', 'correspondencia' => null, 'detalhe' => 'Nome vazio', 'fonte' => null];
    }
    $alvo = preg_replace('/^(cidade de|city of|municipio de) /', '', $alvo) ?? $alvo;
    $exo = geoExonimos();
    $candidatos = [$alvo];
    if (isset($exo[$alvo])) {
        $candidatos[] = $exo[$alvo];
    }

    // 1) capital do país (dados do REST Countries)
    foreach ($pais['capitais'] as $cap) {
        if (in_array(geoNorm($cap), $candidatos, true)) {
            return ['status' => 'confirmada', 'correspondencia' => $cap, 'detalhe' => 'Capital de ' . ($pais['nomePt'] ?: $pais['nome']), 'fonte' => 'REST Countries'];
        }
    }

    // 2) lista de cidades do país (CountriesNow)
    $r = geoCidadesPais($pais, $forcar);
    if (!$r['ok']) {
        return ['status' => 'indisponivel', 'correspondencia' => null, 'detalhe' => 'Não foi possível consultar a API de cidades: ' . $r['erro'], 'fonte' => null];
    }
    $lista = $r['dados']['cidades'] ?? [];
    if (!$lista) {
        return ['status' => 'indisponivel', 'correspondencia' => null, 'detalhe' => 'A base de cidades não tem dados para este país', 'fonte' => null];
    }
    $idx = geoIndiceCidades($pais['iso2'], $lista);

    foreach ($candidatos as $i => $c) {
        if (isset($idx[$c])) {
            $orig = $idx[$c];
            $nota = $i > 0 ? 'Nome internacional: ' . $orig : ($orig !== $cidade ? 'Grafia na API: ' . $orig : 'Encontrada na base de cidades');
            return ['status' => 'confirmada', 'correspondencia' => $orig, 'detalhe' => $nota, 'fonte' => 'CountriesNow'];
        }
    }

    // 3) aproximação por erro de digitação
    $melhor = null;
    $dist = 99;
    foreach ($candidatos as $c) {
        $tol = geoToleranciaTipo($c);
        if ($tol === 0) {
            continue;
        }
        foreach ($idx as $n => $orig) {
            if (abs(strlen($n) - strlen($c)) > $tol || $n[0] !== $c[0]) {
                continue;
            }
            $d = levenshtein($n, $c);
            if ($d <= $tol && $d < $dist) {
                $melhor = $orig;
                $dist = $d;
            }
        }
    }
    if ($melhor !== null) {
        return ['status' => 'provavel', 'correspondencia' => $melhor, 'detalhe' => 'Grafia parecida na API: ' . $melhor, 'fonte' => 'CountriesNow'];
    }

    return ['status' => 'nao_encontrada', 'correspondencia' => null, 'detalhe' => 'Não consta nas bases consultadas para ' . ($pais['nomePt'] ?: $pais['nome']), 'fonte' => null];
}

/** Compara população/área cadastradas com os dados atualizados da API */
function geoComparar(array $linha, array $api): array
{
    $cmp = [];

    $pop = (int) ($linha['populacao'] ?? 0);
    if ($api['populacao']) {
        $dif = $pop > 0 ? (($api['populacao'] - $pop) / $pop) * 100 : null;
        $cmp['populacao'] = ['cadastrado' => $pop, 'api' => $api['populacao'], 'difPct' => $dif !== null ? round($dif, 1) : null, 'divergente' => $dif !== null && abs($dif) > 20];
    }
    $area = (float) ($linha['area_km2'] ?? 0);
    if ($api['area']) {
        $dif = $area > 0 ? (($api['area'] - $area) / $area) * 100 : null;
        $cmp['area'] = ['cadastrado' => $area, 'api' => $api['area'], 'difPct' => $dif !== null ? round($dif, 1) : null, 'divergente' => $dif !== null && abs($dif) > 15];
    }

    // continente
    if (!empty($linha['continente']) && ($api['regiao'] || $api['continentes'])) {
        $palha = geoNorm($api['regiao'] . ' ' . $api['subregiao'] . ' ' . implode(' ', $api['continentes']));
        $chaves = [
            'europa' => ['europe'], 'asia' => ['asia'], 'africa' => ['africa'],
            'oceania' => ['oceania', 'australia'], 'america do sul' => ['south america'],
            'america do norte' => ['north america', 'northern america', 'central america', 'caribbean'],
            'america central' => ['central america', 'caribbean', 'north america'], 'america' => ['americas', 'america'],
            'antartida' => ['antarctic'],
        ];
        $ks = $chaves[geoNorm($linha['continente'])] ?? null;
        $confere = null;
        if ($ks) {
            $confere = false;
            foreach ($ks as $k) {
                if (str_contains($palha, $k)) {
                    $confere = true;
                    break;
                }
            }
        }
        $cmp['continente'] = ['cadastrado' => $linha['continente'], 'api' => trim($api['regiao'] . ($api['subregiao'] ? ' · ' . $api['subregiao'] : '')), 'confere' => $confere];
    }
    return $cmp;
}

/**
 * Auditoria de um país cadastrado (e das suas cidades) contra as APIs.
 */
function geoAuditarPais(PDO $pdo, int $idPais, bool $forcar = false): array
{
    $st = $pdo->prepare(
        'SELECT p.id_pais, p.nome, p.populacao, p.area_km2, c.nome AS continente
         FROM paises p LEFT JOIN continentes c ON c.id_continente = p.id_continente
         WHERE p.id_pais = ?'
    );
    $st->execute([$idPais]);
    $linha = $st->fetch();
    if (!$linha) {
        return ['ok' => false, 'erro' => 'País não encontrado no cadastro'];
    }

    $todos = geoPaises($forcar);
    if (!$todos['ok']) {
        return ['ok' => true, 'id' => $idPais, 'nome' => $linha['nome'], 'status' => 'indisponivel', 'erro' => $todos['erro'], 'cidades' => []];
    }

    $achado = geoAcharPais($todos['dados']['lista'], $linha['nome']);
    $out = ['ok' => true, 'id' => $idPais, 'nome' => $linha['nome'], 'como' => $achado['como'], 'api' => null, 'comparacao' => [], 'cidades' => []];

    if (!$achado['pais']) {
        $out['status'] = 'nao_encontrado';
    } else {
        $out['status'] = $achado['como'] === 'aproximado' ? 'provavel' : 'confirmado';
        $out['api'] = $achado['pais'];
        $out['comparacao'] = geoComparar($linha, $achado['pais']);
    }

    $cs = $pdo->prepare('SELECT id_cidade, nome FROM cidades WHERE id_pais = ? ORDER BY nome');
    $cs->execute([$idPais]);
    foreach ($cs->fetchAll() as $c) {
        if ($achado['pais']) {
            $v = geoValidarCidade($achado['pais'], $c['nome'], $forcar);
        } else {
            $v = ['status' => 'indisponivel', 'correspondencia' => null, 'detalhe' => 'O país não foi encontrado na API', 'fonte' => null];
        }
        $out['cidades'][] = ['id' => (int) $c['id_cidade'], 'nome' => $c['nome']] + $v;
    }
    return $out;
}

/** Validação manual país + estado + cidade (formulário da aba) */
function geoValidarManual(string $paisTxt, string $estadoTxt, string $cidadeTxt): array
{
    $todos = geoPaises();
    if (!$todos['ok']) {
        return ['ok' => false, 'erro' => $todos['erro']];
    }
    $out = ['ok' => true, 'pais' => ['status' => 'nao_encontrado'], 'estado' => null, 'cidade' => null];

    $a = geoAcharPais($todos['dados']['lista'], $paisTxt);
    $pais = $a['pais'];
    if (!$pais) {
        return $out;
    }
    $out['pais'] = ['status' => $a['como'] === 'aproximado' ? 'provavel' : 'confirmado', 'api' => $pais];

    $estadoApi = null;
    $nomePaisApi = null;
    if ($estadoTxt !== '') {
        $es = geoEstados($pais);
        if (!$es['ok']) {
            $out['estado'] = ['status' => 'indisponivel', 'detalhe' => $es['erro']];
        } elseif (!$es['dados']['estados']) {
            $out['estado'] = ['status' => 'sem_base', 'detalhe' => 'A base de estados não tem dados para este país'];
        } else {
            $nomePaisApi = $es['dados']['nomeApi'];
            $ach = geoAcharEstado($es['dados']['estados'], $estadoTxt);
            if ($ach['estado']) {
                $estadoApi = $ach['estado'];
                $out['estado'] = ['status' => $ach['como'] === 'aproximado' ? 'provavel' : 'confirmado', 'api' => $estadoApi];
            } else {
                $out['estado'] = ['status' => 'nao_encontrado', 'detalhe' => 'Estado/província não consta na base para ' . ($pais['nomePt'] ?: $pais['nome'])];
            }
        }
    }

    if ($cidadeTxt !== '') {
        $v = geoValidarCidade($pais, $cidadeTxt);

        // se o estado foi confirmado, confere se a cidade pertence a ele
        if ($estadoApi && $nomePaisApi && in_array($v['status'], ['confirmada', 'provavel'], true)) {
            $ce = geoCidadesEstado($pais, $nomePaisApi, $estadoApi['nome']);
            if ($ce['ok'] && $ce['dados']) {
                $alvo = geoNorm((string) $v['correspondencia']);
                $idx = [];
                foreach ($ce['dados'] as $n) {
                    $idx[geoNorm($n)] = true;
                }
                $v['noEstado'] = isset($idx[$alvo]);
                $v['detalhe'] .= $v['noEstado']
                    ? ' · pertence a ' . $estadoApi['nome']
                    : ' · mas não consta na lista de ' . $estadoApi['nome'] . ' (pode estar em outro estado)';
            }
        }
        $out['cidade'] = $v;
    }
    return $out;
}
