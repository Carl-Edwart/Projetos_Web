/*
  filtro por faixa de preço usando switch (é o que o prof pediu)
  retorna uma lista nova sem mudar o array orginal
*/

function produtosPorFaixa(lista, faixa) {
  switch (faixa) {
    case 'barato':
      return lista.filter(function (p) {
        return p.preco <= 10;
      });
    case 'medio':
      return lista.filter(function (p) {
        return p.preco > 10 && p.preco <= 50;
      });
    case 'caro':
      return lista.filter(function (p) {
        return p.preco > 50;
      });
    default:
      return lista;
  }
}
