<?php
/**
 * explorador.php — aba "API Países".
 * Consome as APIs REST (REST Countries v5 + CountriesNow) para:
 *   1) validar se os países/cidades cadastrados realmente existem (com bandeira e dados atualizados);
 *   2) validar manualmente país + estado + cidade;
 *   3) explorar todos os países, seus estados e cidades.
 */
require __DIR__ . '/backend/helpers.php';
require __DIR__ . '/backend/config/coordenadas.php';
require __DIR__ . '/backend/config/apis.php';

$usuario = exigirAutenticacao();
$pdo = db();

$titulo = 'API Países';
$ativo  = 'api';

$cadastrados = $pdo->query(
    'SELECT p.id_pais, p.nome, p.populacao, c.nome AS continente,
            (SELECT COUNT(*) FROM cidades ci WHERE ci.id_pais = p.id_pais) AS qtd_cidades
     FROM paises p LEFT JOIN continentes c ON c.id_continente = p.id_continente
     ORDER BY p.nome'
)->fetchAll();

$config = [
    'api'     => url('backend/api/geo.php'),
    'paises'  => array_map(static fn ($p) => [
        'id' => (int) $p['id_pais'], 'nome' => $p['nome'], 'cidades' => (int) $p['qtd_cidades'],
        'iso' => coordenadaPais($p['nome'])['iso'] ?? null,
    ], $cadastrados),
];
$jsonFlags = JSON_UNESCAPED_UNICODE | JSON_HEX_TAG | JSON_HEX_AMP | JSON_HEX_APOS | JSON_HEX_QUOT;

require __DIR__ . '/templates/header.php';
?>
<link rel="stylesheet" href="<?= e(url('frontend/css/explorador.css')) ?>">

<div class="pagina-topo">
    <div>
        <h1>🌐 API de Países</h1>
        <p class="subtitulo">Dados atualizados direto das APIs REST: valida países, estados e cidades e mostra as bandeiras.</p>
    </div>
    <div class="mapa-acoes">
        <button type="button" class="btn btn-neutro" id="btn-atualizar" title="Apaga o cache e consulta as APIs de novo">↻ Atualizar dados</button>
    </div>
</div>

<div class="api-status" id="api-status" aria-live="polite">
    <span class="api-chip" id="chip-rc"><i class="ponto ponto-espera"></i> REST Countries · <b>verificando…</b></span>
    <span class="api-chip" id="chip-cn"><i class="ponto ponto-espera"></i> CountriesNow · <b>verificando…</b></span>
    <span class="api-chip api-chip-neutro" id="chip-meta" hidden></span>
</div>
<div class="alerta alerta-info" id="api-aviso" hidden><span></span></div>

<div class="api-abas" role="tablist">
    <button type="button" class="api-aba ativo" role="tab" data-aba="validacao" aria-selected="true">✅ Validar cadastros</button>
    <button type="button" class="api-aba" role="tab" data-aba="manual" aria-selected="false">🔎 Validador manual</button>
    <button type="button" class="api-aba" role="tab" data-aba="explorar" aria-selected="false">🌍 Explorar países</button>
</div>

<!-- ============================ 1. VALIDAÇÃO ============================ -->
<section class="api-painel" id="painel-validacao" role="tabpanel">
    <div class="api-resumo" id="api-resumo">
        <div class="resumo-card"><span class="resumo-num" id="r-paises">–</span><span class="resumo-rot">Países confirmados</span></div>
        <div class="resumo-card"><span class="resumo-num" id="r-cidades">–</span><span class="resumo-rot">Cidades confirmadas</span></div>
        <div class="resumo-card"><span class="resumo-num" id="r-alertas">–</span><span class="resumo-rot">Pontos de atenção</span></div>
    </div>

    <div class="cartao tabela-caixa">
        <table class="tabela" id="tabela-validacao">
            <thead>
                <tr>
                    <th>Bandeira</th>
                    <th>País cadastrado</th>
                    <th>Situação na API</th>
                    <th>Dados atualizados</th>
                    <th>Cidades cadastradas</th>
                </tr>
            </thead>
            <tbody>
                <?php foreach ($cadastrados as $p): ?>
                    <tr data-id="<?= (int) $p['id_pais'] ?>">
                        <td class="col-bandeira"><span class="bandeira-vazia">🚩</span></td>
                        <td>
                            <strong><?= e($p['nome']) ?></strong>
                            <small class="detalhe"><?= e($p['continente'] ?? '—') ?> · <?= e(nfmt($p['populacao'])) ?> hab. cadastrados</small>
                        </td>
                        <td class="col-status"><span class="selo selo-espera"><i class="spinner-mini"></i> Consultando…</span></td>
                        <td class="col-dados"><small class="detalhe">—</small></td>
                        <td class="col-cidades"><small class="detalhe"><?= (int) $p['qtd_cidades'] ?> cadastrada(s)</small></td>
                    </tr>
                <?php endforeach; ?>
                <?php if (!$cadastrados): ?>
                    <tr><td colspan="5" class="vazio">Nenhum país cadastrado ainda.</td></tr>
                <?php endif; ?>
            </tbody>
        </table>
    </div>
    <p class="api-nota">
        ✔ <b>Confirmado</b>: existe nas APIs · ≈ <b>Provável</b>: grafia parecida · ✖ <b>Não encontrado</b>: não consta nas bases consultadas ·
        ⚠ <b>Indisponível</b>: não foi possível consultar (a API não diz que não existe).
    </p>
</section>

<!-- ============================ 2. MANUAL ============================ -->
<section class="api-painel" id="painel-manual" role="tabpanel" hidden>
    <div class="cartao api-manual">
        <h2>Validar país, estado e cidade</h2>
        <p class="subtitulo">Digite em português ou inglês. O estado e a cidade são opcionais.</p>
        <div class="api-manual-campos">
            <label>País
                <input type="text" id="m-pais" list="dl-paises" placeholder="Ex.: Brasil" autocomplete="off">
                <datalist id="dl-paises"></datalist>
            </label>
            <label>Estado / província
                <input type="text" id="m-estado" list="dl-estados" placeholder="Ex.: São Paulo ou SP" autocomplete="off">
                <datalist id="dl-estados"></datalist>
            </label>
            <label>Cidade
                <input type="text" id="m-cidade" list="dl-cidades" placeholder="Ex.: Campinas" autocomplete="off">
                <datalist id="dl-cidades"></datalist>
            </label>
            <button type="button" class="btn btn-primario" id="m-validar">Validar</button>
        </div>
        <div class="api-exemplos">
            Exemplos:
            <button type="button" class="chip-filtro" data-ex="Brasil|São Paulo|Campinas">Brasil · São Paulo · Campinas</button>
            <button type="button" class="chip-filtro" data-ex="Alemanha||Berlim">Alemanha · Berlim</button>
            <button type="button" class="chip-filtro" data-ex="Brasil|Atlantis|Gotham">Brasil · Atlantis · Gotham</button>
        </div>
        <div id="m-resultado" class="api-resultado" aria-live="polite"></div>
    </div>
</section>

<!-- ============================ 3. EXPLORAR ============================ -->
<section class="api-painel" id="painel-explorar" role="tabpanel" hidden>
    <div class="api-filtros">
        <input type="search" class="campo-busca" id="x-busca" placeholder="🔎 Buscar país (português ou inglês)…" autocomplete="off">
        <select id="x-regiao" aria-label="Filtrar por região"><option value="">Todas as regiões</option></select>
        <span class="api-contagem" id="x-contagem"></span>
    </div>
    <div class="api-grade" id="x-grade">
        <p class="lista-vazia"><span class="spinner"></span> Carregando países…</p>
    </div>
</section>

<!-- Detalhe do país -->
<dialog class="api-dialogo" id="x-dialogo" aria-labelledby="x-titulo">
    <button type="button" class="api-fechar" id="x-fechar" aria-label="Fechar">×</button>
    <div id="x-conteudo"></div>
</dialog>

<script>window.EXPLORADOR = <?= json_encode($config, $jsonFlags) ?>;</script>
<script defer src="<?= e(url('frontend/js/explorador.js')) ?>"></script>

<?php require __DIR__ . '/templates/footer.php'; ?>
