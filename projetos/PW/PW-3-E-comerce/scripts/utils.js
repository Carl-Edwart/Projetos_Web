/*
  arquvio de utilidades
  fucao simples pra formatar preço em real
  nao usa nada alem de js basico
*/

function formatarPreco(valor) {
  return 'R$ ' + valor.toFixed(2).replace('.', ',');
}
