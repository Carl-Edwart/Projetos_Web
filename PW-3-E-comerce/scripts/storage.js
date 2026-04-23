/*
  persistencia só com localStorage (nao usei sessionStorage nem cookie)
  guarada o carrinho como texto json
*/

const CHAVE_CARRINHO = 'pw3_carrinho';

function salvarCarrinho(itens) {
  localStorage.setItem(CHAVE_CARRINHO, JSON.stringify(itens));
}

function carregarCarrinho() {
  const texto = localStorage.getItem(CHAVE_CARRINHO);
  if (!texto) {
    return [];
  }
  return JSON.parse(texto);
}
