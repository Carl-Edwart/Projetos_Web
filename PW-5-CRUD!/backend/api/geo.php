<?php
/**
 * backend/api/geo.php — endpoint JSON da aba "API Países".
 * Faz a ponte entre o navegador e as APIs REST externas (REST Countries + CountriesNow).
 *
 * Uso (GET, usuário autenticado):
 *   ?acao=status                          → situação das duas APIs
 *   ?acao=paises                          → lista compacta de países (bandeira, região, população)
 *   ?acao=pais&iso=BR                     → todos os dados atualizados de um país
 *   ?acao=estados&iso=BR                  → estados/províncias do país
 *   ?acao=cidades&iso=BR[&estado=SP]      → cidades do país (ou do estado)
 *   ?acao=auditar&id=5                    → valida o país cadastrado (id) e suas cidades
 *   ?acao=validar&pais=..&estado=..&cidade=..   → validação manual
 *   ?acao=limpar_cache                    → apaga o cache e força nova consulta às APIs
 */
require dirname(__DIR__, 2) . '/backend/helpers.php';
require dirname(__DIR__) . '/services/geo_api.php';

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');

$usuario = usuarioAtual();
if (!$usuario || (int) $usuario['primeiro_acesso'] === 1) {
    http_response_code($usuario ? 403 : 401);
    echo json_encode(['erro' => $usuario ? 'Troca de senha obrigatória.' : 'Autenticação necessária.'], JSON_UNESCAPED_UNICODE);
    exit;
}
session_write_close();   // não trava outras requisições enquanto espera as APIs externas
@set_time_limit(90);

const GEO_FLAGS = JSON_UNESCAPED_UNICODE | JSON_INVALID_UTF8_SUBSTITUTE;

function geoResponder($dados, int $status = 200): void
{
    http_response_code($status);
    echo json_encode($dados, GEO_FLAGS);
    exit;
}

function geoParam(string $nome): string
{
    return isset($_GET[$nome]) && is_scalar($_GET[$nome]) ? trim((string) $_GET[$nome]) : '';
}

/** Metadados de origem dos dados, para a interface */
function geoMeta(array $r): array
{
    return [
        'fonte'    => $r['dados']['fonte'] ?? null,
        'demo'     => (bool) ($r['dados']['demo'] ?? false),
        'avisoRc'  => $r['dados']['avisoRc'] ?? null,
        'cache'    => $r['cache'] ?? false,
        'obsoleto' => $r['obsoleto'] ?? false,
        'quando'   => $r['quando'] ?? null,
        'erro'     => $r['erro'] ?? null,
        'total'    => count($r['dados']['lista'] ?? []),
    ];
}

/** Carrega a lista e devolve o país pelo ISO-2 (ou responde erro) */
function geoPaisPorIsoOuErro(): array
{
    $iso = strtoupper(geoParam('iso'));
    if (!preg_match('/^[A-Z]{2}$/', $iso)) {
        geoResponder(['erro' => 'Informe o código ISO-2 do país (ex.: BR).'], 400);
    }
    $todos = geoPaises();
    if (!$todos['ok']) {
        geoResponder(['erro' => $todos['erro']], 502);
    }
    $idx = geoIndicePaises($todos['dados']['lista']);
    if (!isset($idx[$iso])) {
        geoResponder(['erro' => 'País não encontrado na API.'], 404);
    }
    return $idx[$iso];
}

$acao = geoParam('acao');

switch ($acao) {
    case 'status':
        $todos = geoPaises();
        $rc = ['ok' => false, 'modo' => 'erro', 'detalhe' => $todos['erro'] ?? 'indisponível'];
        if ($todos['ok']) {
            $fonte = $todos['dados']['fonte'];
            $rc = [
                'ok'      => $fonte !== 'countriesnow' && !$todos['dados']['demo'],
                'modo'    => $todos['dados']['demo'] ? 'demo' : ($fonte === 'countriesnow' ? 'erro' : 'completo'),
                'detalhe' => $todos['dados']['avisoRc'],
            ];
        }
        $cn = geoEstados(['iso2' => 'BR', 'nome' => 'Brazil', 'oficial' => 'Federative Republic of Brazil', 'alternativos' => []]);
        geoResponder([
            'restcountries' => $rc + ['chavePropria' => RESTCOUNTRIES_CHAVE !== 'rc_live_demo'],
            'countriesnow'  => ['ok' => $cn['ok'], 'detalhe' => $cn['ok'] ? null : $cn['erro']],
            'paises'        => geoMeta($todos),
        ]);

    case 'paises':
        $todos = geoPaises();
        if (!$todos['ok']) {
            geoResponder(['erro' => $todos['erro']], 502);
        }
        geoResponder(['meta' => geoMeta($todos), 'paises' => geoListaCompacta($todos['dados']['lista'])]);

    case 'pais':
        $p = geoPaisPorIsoOuErro();
        // vínculo com o cadastro
        $vinculo = null;
        $pdo = db();
        foreach ($pdo->query('SELECT id_pais, nome FROM paises')->fetchAll() as $l) {
            $a = geoAcharPais([$p], $l['nome']);
            if ($a['pais']) {
                $vinculo = ['id' => (int) $l['id_pais'], 'nome' => $l['nome']];
                break;
            }
        }
        geoResponder(['pais' => $p, 'cadastro' => $vinculo]);

    case 'estados':
        $p = geoPaisPorIsoOuErro();
        $r = geoEstados($p);
        if (!$r['ok']) {
            geoResponder(['erro' => $r['erro']], 502);
        }
        geoResponder(['estados' => $r['dados']['estados'], 'nomeApi' => $r['dados']['nomeApi'], 'cache' => $r['cache']]);

    case 'cidades':
        $p = geoPaisPorIsoOuErro();
        $estado = geoParam('estado');
        if ($estado !== '') {
            $es = geoEstados($p);
            if (!$es['ok']) {
                geoResponder(['erro' => $es['erro']], 502);
            }
            $ach = geoAcharEstado($es['dados']['estados'], $estado);
            if (!$ach['estado']) {
                geoResponder(['erro' => 'Estado não encontrado na base.'], 404);
            }
            $r = geoCidadesEstado($p, (string) $es['dados']['nomeApi'], $ach['estado']['nome']);
            if (!$r['ok']) {
                geoResponder(['erro' => $r['erro']], 502);
            }
            geoResponder(['estado' => $ach['estado'], 'cidades' => $r['dados']]);
        }
        $r = geoCidadesPais($p);
        if (!$r['ok']) {
            geoResponder(['erro' => $r['erro']], 502);
        }
        geoResponder(['cidades' => $r['dados']['cidades'] ?? []]);

    case 'auditar':
        $id = filter_var(geoParam('id'), FILTER_VALIDATE_INT);
        if (!$id) {
            geoResponder(['erro' => 'Informe o id do país.'], 400);
        }
        $r = geoAuditarPais(db(), $id, geoParam('forcar') === '1');
        geoResponder($r, $r['ok'] ? 200 : 404);

    case 'validar':
        $pais = geoParam('pais');
        if (mb_strlen($pais) < 2) {
            geoResponder(['erro' => 'Informe o país.'], 400);
        }
        $r = geoValidarManual($pais, geoParam('estado'), geoParam('cidade'));
        geoResponder($r, $r['ok'] ? 200 : 502);

    case 'limpar_cache':
        geoResponder(['removidos' => geoCacheLimpar()]);

    default:
        geoResponder(['erro' => 'Ação inválida.'], 400);
}
