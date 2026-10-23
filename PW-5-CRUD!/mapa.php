<?php
/**
 * mapa.php — Mapa-múndi (Google Maps) com os países cadastrados + marcador da ETEC Aquarius.
 */
require __DIR__ . '/backend/helpers.php';
require __DIR__ . '/backend/config/maps.php';
require __DIR__ . '/backend/config/coordenadas.php';

$usuario = exigirAutenticacao();
$pdo = db();

$titulo = 'Mapa';
$ativo  = 'mapa';

/* ------------------------- países cadastrados ------------------------- */
$linhas = $pdo->query(
    'SELECT p.id_pais, p.nome, p.populacao, p.area_km2, p.idioma, p.clima, p.regime_politico, p.moeda,
            c.nome AS continente, g.nome AS governante,
            (SELECT COUNT(*) FROM cidades ci WHERE ci.id_pais = p.id_pais) AS qtd_cidades
     FROM paises p
     LEFT JOIN continentes c ON c.id_continente = p.id_continente
     LEFT JOIN governantes g ON g.id_governante = p.id_governante
     ORDER BY p.nome'
)->fetchAll();

/* até 3 maiores cidades de cada país (para o balão de informações) */
$cidadesPorPais = [];
foreach ($pdo->query('SELECT id_pais, nome FROM cidades ORDER BY populacao DESC')->fetchAll() as $c) {
    $cidadesPorPais[(int) $c['id_pais']][] = $c['nome'];
}

$paises = [];
$continentes = [];
foreach ($linhas as $l) {
    $coord = coordenadaPais($l['nome']);
    $id = (int) $l['id_pais'];
    $paises[] = [
        'id'         => $id,
        'nome'       => $l['nome'],
        'continente' => $l['continente'] ?? '—',
        'populacao'  => nfmt($l['populacao']),
        'area'       => nfmt($l['area_km2']),
        'idioma'     => $l['idioma'],
        'clima'      => $l['clima'],
        'regime'     => $l['regime_politico'],
        'moeda'      => $l['moeda'],
        'governante' => $l['governante'],
        'cidades'    => (int) $l['qtd_cidades'],
        'topCidades' => array_slice($cidadesPorPais[$id] ?? [], 0, 3),
        'lat'        => $coord['lat'] ?? null,
        'lng'        => $coord['lng'] ?? null,
        'iso'        => $coord['iso'] ?? null,
    ];
    if (!empty($l['continente'])) {
        $continentes[$l['continente']] = true;
    }
}
$continentes = array_keys($continentes);
sort($continentes, SORT_LOCALE_STRING);

$temChave = GOOGLE_MAPS_API_KEY !== '';

$config = [
    'chave'  => GOOGLE_MAPS_API_KEY,
    'mapId'  => GOOGLE_MAPS_MAP_ID,
    'paises' => $paises,
    'etec'   => [
        'nome'     => ETEC_NOME,
        'apelido'  => ETEC_APELIDO,
        'endereco' => ETEC_ENDERECO,
        'telefone' => ETEC_TELEFONE,
        'site'     => ETEC_SITE,
        'lat'      => ETEC_LAT,
        'lng'      => ETEC_LNG,
    ],
];
$jsonFlags = JSON_UNESCAPED_UNICODE | JSON_HEX_TAG | JSON_HEX_AMP | JSON_HEX_APOS | JSON_HEX_QUOT;

require __DIR__ . '/templates/header.php';
?>

<div class="pagina-topo">
    <div>
        <h1>📍 Mapa-múndi</h1>
        <p class="subtitulo"><?= count($paises) ?> país(es) cadastrado(s) no sistema · e a nossa ETEC em São José dos Campos</p>
    </div>
    <div class="mapa-acoes">
        <button type="button" class="btn btn-neutro" id="btn-todos">🌍 Ver todos os países</button>
        <button type="button" class="btn btn-primario" id="btn-etec">🎓 Ir para a ETEC</button>
    </div>
</div>

<div class="mapa-layout">

    <aside class="cartao mapa-lateral" aria-label="Lista de países">
        <button type="button" class="etec-card" id="etec-card">
            <span class="etec-card-icone" aria-hidden="true">🎓</span>
            <span class="etec-card-txt">
                <strong><?= e(ETEC_APELIDO) ?></strong>
                <small><?= e(ETEC_NOME) ?></small>
                <small>Av. Salmão, 570 · Pq. Res. Aquarius</small>
            </span>
            <span class="etec-card-seta" aria-hidden="true">›</span>
        </button>

        <div class="mapa-filtros">
            <input type="search" id="mapa-busca" class="campo-busca" placeholder="🔎 Buscar país…"
                   autocomplete="off" aria-label="Buscar país na lista">
            <div class="chips-filtro" id="mapa-continentes" role="group" aria-label="Filtrar por continente">
                <button type="button" class="chip-filtro ativo" data-continente="">Todos</button>
                <?php foreach ($continentes as $nomeContinente): ?>
                    <button type="button" class="chip-filtro" data-continente="<?= e($nomeContinente) ?>"><?= e($nomeContinente) ?></button>
                <?php endforeach; ?>
            </div>
        </div>

        <ul class="lista-paises" id="lista-paises">
            <?php foreach ($paises as $p): ?>
                <li data-id="<?= (int) $p['id'] ?>"
                    data-continente="<?= e($p['continente']) ?>"
                    data-busca="<?= e(mb_strtolower($p['nome'] . ' ' . $p['continente'] . ' ' . $p['idioma'], 'UTF-8')) ?>">
                    <button type="button" class="pais-item" data-id="<?= (int) $p['id'] ?>">
                        <?php if ($p['iso']): ?>
                            <img class="bandeira" src="https://flagcdn.com/w80/<?= e($p['iso']) ?>.png" alt="" loading="lazy" width="36" height="27">
                        <?php else: ?>
                            <span class="bandeira bandeira-emoji" aria-hidden="true">🚩</span>
                        <?php endif; ?>
                        <span class="pais-txt">
                            <strong><?= e($p['nome']) ?></strong>
                            <small><?= e($p['continente']) ?> · <?= e($p['populacao']) ?> hab.</small>
                        </span>
                        <span class="pais-seta" aria-hidden="true">›</span>
                    </button>
                </li>
            <?php endforeach; ?>
        </ul>
        <p class="lista-vazia" id="lista-vazia" hidden>Nenhum país encontrado.</p>
        <?php if (!$paises): ?>
            <p class="lista-vazia">Nenhum país cadastrado ainda. <a href="<?= e(url('backend/paises/form.php')) ?>">Cadastrar o primeiro →</a></p>
        <?php endif; ?>
    </aside>

    <section class="cartao mapa-caixa" id="mapa-caixa" aria-label="Mapa">
        <?php if ($temChave): ?>
            <div id="mapa" class="mapa-canvas">
                <div class="mapa-carregando"><span class="spinner"></span> Carregando o Google Maps…</div>
            </div>
            <div class="mapa-legenda" aria-hidden="true">
                <span><i class="leg-pais"></i> País cadastrado</span>
                <span><i class="leg-etec"></i> ETEC Aquarius</span>
            </div>
        <?php else: ?>
            <div class="mapa-aviso">
                <div class="mapa-aviso-icone">🗝️</div>
                <h2>Falta só a chave do Google Maps</h2>
                <p>A integração está pronta. Para o mapa aparecer, informe uma chave de API do Google Maps:</p>
                <ol>
                    <li>No <a href="https://console.cloud.google.com/google/maps-apis" target="_blank" rel="noopener">Google Cloud Console</a>, ative a <strong>Maps JavaScript API</strong> e a <strong>Geocoding API</strong>.</li>
                    <li>Crie uma chave em <em>Credenciais</em> (restrinja por referenciador HTTP).</li>
                    <li>Cole-a em <code>backend/config/maps.php</code>, na constante <code>GOOGLE_MAPS_API_KEY_PADRAO</code>.</li>
                    <li>Recarregue esta página.</li>
                </ol>
                <a class="btn btn-neutro" target="_blank" rel="noopener"
                   href="https://www.google.com/maps/search/?api=1&amp;query=<?= e(rawurlencode(ETEC_NOME . ', ' . ETEC_ENDERECO)) ?>">📍 Ver a ETEC no Google Maps</a>
            </div>
        <?php endif; ?>
    </section>
</div>

<script>window.MAPA_DADOS = <?= json_encode($config, $jsonFlags) ?>;</script>
<script defer src="<?= e(url('frontend/js/mapa.js')) ?>"></script>

<?php require __DIR__ . '/templates/footer.php'; ?>
