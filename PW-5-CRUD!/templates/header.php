<?php
/**
 * templates/header.php — topo comum de todas as páginas.
 * Variáveis esperadas: $titulo (string) e $ativo (chave do menu).
 */
$titulo = $titulo ?? 'CRUD Mundo';
$ativo  = $ativo  ?? '';
$somenteTrocaSenha = $somenteTrocaSenha ?? false;
$nomeSessao = $_SESSION['usuario_nome'] ?? $_SESSION['usuario_login'] ?? 'Usuário';
$logoHref = $somenteTrocaSenha ? 'backend/auth/senha.php?obrigatoria=1' : 'index.php';

$abas = [
    'inicio'      => ['Início',      'index.php',                        '🏠'],
    'continentes' => ['Continentes', 'backend/continentes/index.php',    '🗺️'],
    'paises'      => ['Países',      'backend/paises/index.php',         '🚩'],
    'governantes' => ['Governantes', 'backend/governantes/index.php',    '🧑‍💼'],
    'cidades'     => ['Cidades',     'backend/cidades/index.php',        '🏙️'],
    'mapa'        => ['Mapa',        'mapa.php',                         '📍'],
    'api'         => ['API Países',  'explorador.php',                   '🌐'],
];
?>
<!DOCTYPE html>
<html lang="pt-BR">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title><?= e($titulo) ?> · CRUD Mundo</title>
    <meta name="description" content="Sistema de gerenciamento de países, cidades, continentes e governantes.">
    <link rel="icon" href="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><text y='.9em' font-size='90'>🌍</text></svg>">
    <link rel="stylesheet" href="<?= e(url('frontend/css/style.css')) ?>">
    <link rel="stylesheet" href="<?= e(url('frontend/css/mapa.css')) ?>">
    <link rel="stylesheet" href="<?= e(url('frontend/css/ajustes.css')) ?>">
    <script>window.BASE_URL = <?= json_encode(BASE_URL) ?>;</script>
    <script defer src="<?= e(url('frontend/js/app.js')) ?>"></script>
    <script defer src="<?= e(url('frontend/js/efeitos.js')) ?>"></script>
</head>
<body>
<header class="topo">
    <div class="topo-interno">
        <a class="logo" href="<?= e(url($logoHref)) ?>">🌍&nbsp;<b>CRUD</b>&nbsp;Mundo</a>

        <?php if (!$somenteTrocaSenha): ?>
            <button type="button" class="nav-btn" aria-label="Abrir menu" aria-expanded="false">
                <span></span><span></span><span></span>
            </button>

            <nav>
                <?php foreach ($abas as $chave => [$rotulo, $href, $icone]): ?>
                    <a href="<?= e(url($href)) ?>" class="<?= $ativo === $chave ? 'ativo' : '' ?>">
                        <span class="nav-icone"><?= $icone ?></span><?= e($rotulo) ?>
                    </a>
                <?php endforeach; ?>
            </nav>

            <div class="busca-caixa">
                <input type="search" id="busca-global" placeholder="🔎 Buscar…" title="Buscar país ou cidade"
                       autocomplete="off" aria-label="Busca dinâmica por nome">
                <ul id="resultados-busca" hidden></ul>
            </div>
        <?php endif; ?>

        <div class="conta-usuario">
            <span class="conta-avatar" title="<?= e($nomeSessao) ?>" aria-hidden="true"><?= e(mb_strtoupper(mb_substr($nomeSessao, 0, 1))) ?></span>
            <span class="conta-nome" title="Usuário autenticado"><?= e($nomeSessao) ?></span>
            <?php if (!$somenteTrocaSenha): ?>
                <a class="conta-link" href="<?= e(url('backend/auth/senha.php')) ?>">Senha</a>
            <?php endif; ?>
            <form method="post" action="<?= e(url('logout.php')) ?>">
                <?= campoCsrf() ?>
                <button type="submit" class="btn btn-sair">Sair</button>
            </form>
        </div>
    </div>
</header>

<main class="container pagina">
<?php foreach (flashes() as $f): ?>
    <div class="alerta alerta-<?= e($f['tipo']) ?>" data-auto>
        <span><?= e($f['mensagem']) ?></span>
        <button type="button" class="alerta-fechar" aria-label="Fechar">×</button>
    </div>
<?php endforeach; ?>
