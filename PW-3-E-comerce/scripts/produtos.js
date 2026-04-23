/*
  lista de pordutos em array de objetos
  renderiza os cards na div #lista-produtos
*/

const produtos = [
  { id: 1, nome: 'Caneta', preco: 3.5 },
  { id: 2, nome: 'Caderno', preco: 12.9 },
  { id: 3, nome: 'Mochila', preco: 89.9 },
  { id: 4, nome: 'Estojo', preco: 8.0 }
];

function renderizarProdutos(lista) {
  const div = document.querySelector('#lista-produtos');
  if (!div) {
    return;
  }
  div.innerHTML = '';
  lista.forEach(function (p) {
    const card = document.createElement('div');
    card.className = 'card';
    card.innerHTML =
      '<h3>' + p.nome + '</h3>' +
      '<p class="preco">' + formatarPreco(p.preco) + '</p>' +
      '<button type="button" data-id="' + p.id + '">Adicionar</button>';
    card.querySelector('button').addEventListener('click', function () {
      adicionarAoCarrinho(p);
    });
    div.appendChild(card);
  });
}
