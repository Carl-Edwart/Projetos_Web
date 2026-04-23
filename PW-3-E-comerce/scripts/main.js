/*
  arquivo pricipal: decide se ta na loja ou no carrinho
  so inicia o que precisa pra cada pagina
*/

function iniciarLoja() {
  const select = document.querySelector('#filtro');
  if (!select) {
    return;
  }
  function aplicarFiltro() {
    const lista = produtosPorFaixa(produtos, select.value);
    renderizarProdutos(lista);
  }
  select.addEventListener('change', aplicarFiltro);
  aplicarFiltro();
  atualizarLinkCarrinho();
}

function iniciarCarrinho() {
  const btn = document.querySelector('#btn-limpar');
  if (btn) {
    btn.addEventListener('click', limparCarrinho);
  }
  renderizarPaginaCarrinho();
}

if (document.querySelector('#lista-produtos')) {
  iniciarLoja();
} else if (document.querySelector('#corpo-tabela')) {
  iniciarCarrinho();
}
