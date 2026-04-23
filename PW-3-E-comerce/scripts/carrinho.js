/*
  operaçoes do carrinho: add, remover, mudar qtd, total
  tudo salvo no localStorage chamando salvarCarrinho
*/

function adicionarAoCarrinho(produto) {
  const carrinho = carregarCarrinho();
  let achou = false;
  for (let i = 0; i < carrinho.length; i++) {
    if (carrinho[i].id === produto.id) {
      carrinho[i].qtd++;
      achou = true;
      break;
    }
  }
  if (!achou) {
    carrinho.push({
      id: produto.id,
      nome: produto.nome,
      preco: produto.preco,
      qtd: 1
    });
  }
  salvarCarrinho(carrinho);
  atualizarLinkCarrinho();
}

function totalCarrinho() {
  const carrinho = carregarCarrinho();
  let total = 0;
  carrinho.forEach(function (item) {
    total += item.preco * item.qtd;
  });
  return total;
}

function removerItem(id) {
  const novo = carregarCarrinho().filter(function (i) {
    return i.id !== id;
  });
  salvarCarrinho(novo);
  renderizarPaginaCarrinho();
}

function mudarQtd(id, qtd) {
  const n = parseInt(qtd, 10);
  const carrinho = carregarCarrinho();
  for (let i = 0; i < carrinho.length; i++) {
    if (carrinho[i].id === id) {
      if (n < 1) {
        carrinho.splice(i, 1);
      } else {
        carrinho[i].qtd = n;
      }
      break;
    }
  }
  salvarCarrinho(carrinho);
  renderizarPaginaCarrinho();
}

function limparCarrinho() {
  salvarCarrinho([]);
  renderizarPaginaCarrinho();
}

function atualizarLinkCarrinho() {
  const el = document.querySelector('#qtd-carrinho');
  if (el) {
    const n = carregarCarrinho().reduce(function (s, i) {
      return s + i.qtd;
    }, 0);
    el.textContent = n;
  }
}

function renderizarPaginaCarrinho() {
  const tbody = document.querySelector('#corpo-tabela');
  if (!tbody) {
    return;
  }
  tbody.innerHTML = '';
  const carrinho = carregarCarrinho();
  carrinho.forEach(function (item) {
    const tr = document.createElement('tr');
    tr.innerHTML =
      '<td>' + item.nome + '</td>' +
      '<td>' + formatarPreco(item.preco) + '</td>' +
      '<td><input type="number" min="1" value="' + item.qtd + '" data-id="' + item.id + '"></td>' +
      '<td>' + formatarPreco(item.preco * item.qtd) + '</td>' +
      '<td><button type="button" data-remover="' + item.id + '">Remover</button></td>';
    tr.querySelector('input').addEventListener('change', function (e) {
      mudarQtd(item.id, e.target.value);
    });
    tr.querySelector('[data-remover]').addEventListener('click', function () {
      removerItem(item.id);
    });
    tbody.appendChild(tr);
  });
  const totalEl = document.querySelector('#total');
  if (totalEl) {
    totalEl.textContent = 'Total: ' + formatarPreco(totalCarrinho());
  }
  atualizarLinkCarrinho();
}
