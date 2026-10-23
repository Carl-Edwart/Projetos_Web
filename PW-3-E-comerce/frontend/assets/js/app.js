import { apiGet, apiPost, ApiError, initializeSession } from "./api.js";

const $ = (id) => document.getElementById(id);
const state = {
  products: [],
  checkoutOptions: { classes: [], modalities: [] },
  cart: [],
  selectedProduct: null,
  editingIndex: null,
  quote: null,
  buyer: null,
  paymentConfig: null,
  order: null,
  brickController: null,
  pollingTimer: null,
  submitting: false,
};

const quantityLimit = 100;

document.addEventListener("DOMContentLoaded", () => {
  initialize().catch((error) => showGlobalError(error.message || "A loja não está disponível neste momento."));
  bindEvents();
  bindMasks();
});

async function initialize() {
  await initializeSession();
  const current = await apiGet("/api/checkout/current-order");
  if (current.order) {
    state.order = current.order;
    renderConfirmation(current.order);
    startPolling();
    return;
  }

  const [catalog, paymentConfig] = await Promise.all([
    apiGet("/api/products"),
    apiGet("/api/config/payment"),
  ]);
  state.products = catalog.products ?? [];
  state.checkoutOptions = catalog.checkoutOptions ?? { classes: [], modalities: [] };
  state.paymentConfig = paymentConfig;
  renderCatalog();
  renderBuyerOptions();
  $("catalog-loading").classList.add("d-none");
  if (state.products.length === 0) $("catalog-empty").classList.remove("d-none");
}

function bindEvents() {
  $("products-continue").addEventListener("click", () => showStep(2));
  $("change-product").addEventListener("click", () => showStep(1));
  $("configuration-back").addEventListener("click", () => showStep(1));
  $("add-another-product").addEventListener("click", () => showStep(1));
  $("configuration-continue").addEventListener("click", () => showStep(3));
  $("buyer-form").addEventListener("submit", onBuyerSubmit);
  $("buyer-back").addEventListener("click", () => showStep(2));
  $("edit-order").addEventListener("click", () => showStep(3));
  $("review-back").addEventListener("click", () => showStep(3));
  $("item-form").addEventListener("submit", onItemSubmit);
  $("variant-select").addEventListener("change", renderVariantHelp);
  $("buyer-email").addEventListener("blur", (event) => {
    event.currentTarget.value = event.currentTarget.value.trim().toLowerCase();
  });
}

function bindMasks() {
  $("buyer-cpf").addEventListener("input", (event) => {
    const input = event.currentTarget;
    const digits = input.value.replace(/\D/gu, "").slice(0, 11);
    input.value = digits
      .replace(/^(\d{3})(\d)/u, "$1.$2")
      .replace(/^(\d{3})\.(\d{3})(\d)/u, "$1.$2.$3")
      .replace(/\.(\d{3})(\d)/u, ".$1-$2");
  });
  $("buyer-phone").addEventListener("input", (event) => {
    const input = event.currentTarget;
    const digits = input.value.replace(/\D/gu, "").slice(0, 11);
    if (digits.length <= 2) input.value = digits.length ? `(${digits}` : "";
    else if (digits.length <= 6) input.value = `(${digits.slice(0, 2)}) ${digits.slice(2)}`;
    else if (digits.length <= 10) input.value = `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6)}`;
    else input.value = `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
  });
}

function renderCatalog() {
  const list = $("product-list");
  list.replaceChildren();
  state.products.forEach((product) => {
    const column = document.createElement("div");
    column.className = "col-12 col-md-6";
    const card = document.createElement("article");
    card.className = "card product-card";
    const body = document.createElement("div");
    body.className = "card-body";
    const icon = document.createElement("div");
    icon.className = "product-card__icon";
    icon.setAttribute("aria-hidden", "true");
    icon.textContent = product.kind === "CAMISETA" ? "C" : "Ô";
    const title = document.createElement("h3");
    title.textContent = product.name;
    const description = document.createElement("p");
    description.textContent = product.description || "Escolha uma opção disponível e personalize seu pedido.";
    const prices = product.variants.map((variant) => BigInt(variant.priceCents));
    const price = document.createElement("p");
    price.className = "product-card__price";
    price.textContent = prices.length === 1
      ? formatCents(prices[0].toString())
      : `A partir de ${formatCents(prices.reduce((minimum, current) => current < minimum ? current : minimum).toString())}`;
    const button = document.createElement("button");
    button.type = "button";
    button.className = "btn btn-primary mt-auto";
    button.textContent = "Configurar";
    button.addEventListener("click", () => selectProduct(product));
    body.append(icon, title, description, price, button);
    card.append(body);
    column.append(card);
    list.append(column);
  });
}

function selectProduct(product) {
  state.selectedProduct = product;
  state.editingIndex = null;
  $("selected-product-title").textContent = product.name;
  $("selected-product-description").textContent = product.description || "Configure a opção e a quantidade deste item.";
  fillVariants(product);
  applyProductMode(product);
  $("shirt-name").value = "";
  $("shirt-number").value = "";
  $("item-quantity").value = "1";
  $("item-add").textContent = "Adicionar ao pedido";
  $("item-error").classList.add("d-none");
  showStep(2);
}

function applyProductMode(product) {
  const isBus = product.kind === "BUS";
  const shirt = product.kind === "CAMISETA";
  $("variant-field").classList.toggle("d-none", isBus);
  $("bus-price-field").classList.toggle("d-none", !isBus);
  $("shirt-name-field").classList.toggle("d-none", !shirt);
  $("shirt-number-field").classList.toggle("d-none", !shirt);
  $("shirt-name").required = shirt;
  $("shirt-number").required = shirt;
  if (isBus && product.variants.length > 0) {
    $("bus-price-value").textContent = formatCents(product.variants[0].priceCents);
  }
}

function fillVariants(product, selectedId = "") {
  const select = $("variant-select");
  select.replaceChildren();
  const placeholder = document.createElement("option");
  placeholder.value = "";
  placeholder.textContent = "Selecione uma opção";
  placeholder.disabled = true;
  placeholder.selected = !selectedId;
  select.append(placeholder);
  for (const variant of product.variants) {
    const option = document.createElement("option");
    option.value = variant.id;
    option.textContent = `${variant.name} · ${formatCents(variant.priceCents)}`;
    if (selectedId === variant.id) option.selected = true;
    select.append(option);
  }
  if (product.variants.length === 1) {
    select.value = product.variants[0].id;
  }
  renderVariantHelp();
}

function renderVariantHelp() {
  const variant = selectedVariant();
  $("variant-help").textContent = !variant
    ? ""
    : variant.availableQuantity === null
      ? "Disponível"
      : `${variant.availableQuantity} disponível(is)`;
}

function selectedVariant() {
  if (!state.selectedProduct) return null;
  return state.selectedProduct.variants.find((variant) => variant.id === $("variant-select").value) ?? null;
}

async function onItemSubmit(event) {
  event.preventDefault();
  if (!state.selectedProduct) return;
  const variant = selectedVariant();
  const quantity = Number($("item-quantity").value);
  let customization = {};
  if (!variant || !Number.isSafeInteger(quantity) || quantity < 1 || quantity > quantityLimit) {
    showItemError("Confira a opção e a quantidade selecionadas.");
    return;
  }

  if (state.selectedProduct.kind === "CAMISETA") {
    const shirtName = $("shirt-name").value.trim().replace(/\s+/gu, " ");
    const jerseyNumber = $("shirt-number").value.trim();
    if (!shirtName || shirtName.length > 40 || !/^[\p{L}\p{M} .'-]+$/u.test(shirtName)) {
      showItemError("Informe um nome válido para a camiseta.");
      $("shirt-name").focus();
      return;
    }
    if (!/^\d{1,12}$/u.test(jerseyNumber)) {
      showItemError("Informe um número válido para a camiseta.");
      $("shirt-number").focus();
      return;
    }
    customization = { shirtName, jerseyNumber };
  }

  const line = {
    variantId: variant.id,
    quantity,
    customization,
    productCode: state.selectedProduct.code,
    productName: state.selectedProduct.name,
    productKind: state.selectedProduct.kind,
    variantCode: variant.code,
    variantName: variant.name,
    variantAttributes: variant.attributes ?? {},
    unitPriceCents: variant.priceCents,
  };
  const candidateCart = [...state.cart];
  if (state.editingIndex === null) candidateCart.push(line);
  else candidateCart[state.editingIndex] = line;
  $("item-add").disabled = true;
  try {
    await apiPost("/api/checkout/quote", {
      items: candidateCart.map((candidate) => ({
        variantId: candidate.variantId,
        quantity: candidate.quantity,
        ...(candidate.productKind === "CAMISETA" ? { customization: candidate.customization } : {}),
      })),
    });
  } catch (error) {
    showItemError(error.message || "Não foi possível validar este item.");
    $("item-add").disabled = false;
    return;
  }
  $("item-add").disabled = false;
  state.cart = candidateCart;
  state.editingIndex = null;
  renderCart();
  $("item-error").classList.add("d-none");
  $("shirt-name").value = "";
  $("shirt-number").value = "";
  $("item-quantity").value = "1";
  $("item-add").textContent = "Adicionar ao pedido";
  announce("Item adicionado ao pedido.");
}

function showItemError(message) {
  $("item-error").textContent = message;
  $("item-error").classList.remove("d-none");
}

function renderCart() {
  const total = state.cart.reduce((sum, line) => sum + BigInt(line.unitPriceCents) * BigInt(line.quantity), 0n);
  const count = state.cart.reduce((sum, line) => sum + line.quantity, 0);
  for (const id of ["item-count", "item-count-two"]) $(id).textContent = String(count);
  for (const id of ["cart-total", "cart-total-two"]) $(id).textContent = formatCents(total.toString());
  renderCartLines($("cart-lines-step-one"));
  renderCartLines($("cart-lines-step-two"));
  $("products-continue").disabled = state.cart.length === 0;
  $("configuration-continue").disabled = state.cart.length === 0;
}

function renderCartLines(container) {
  container.replaceChildren();
  if (state.cart.length === 0) {
    const empty = document.createElement("p");
    empty.className = "muted mb-0";
    empty.textContent = "Nenhum item adicionado.";
    container.append(empty);
    return;
  }

  state.cart.forEach((line, index) => {
    const row = document.createElement("div");
    row.className = "cart-line";
    const text = document.createElement("div");
    const title = document.createElement("p");
    title.className = "cart-line__title";
    title.textContent = `${line.productName} · ${line.variantName}`;
    const detail = document.createElement("p");
    detail.className = "cart-line__detail";
    const customization = line.customization.shirtName
      ? ` · ${line.customization.shirtName} · nº ${line.customization.jerseyNumber}`
      : "";
    detail.textContent = `${line.quantity} × ${formatCents(line.unitPriceCents)}${customization}`;
    text.append(title, detail);
    const actions = document.createElement("div");
    actions.className = "cart-line__actions";
    const amount = document.createElement("p");
    amount.className = "cart-line__amount";
    amount.textContent = formatCents((BigInt(line.unitPriceCents) * BigInt(line.quantity)).toString());
    const edit = document.createElement("button");
    edit.type = "button";
    edit.className = "btn btn-link btn-sm cart-line__button";
    edit.textContent = "Editar";
    edit.setAttribute("aria-label", `Editar ${line.productName}`);
    edit.addEventListener("click", () => editLine(index));
    const remove = document.createElement("button");
    remove.type = "button";
    remove.className = "btn btn-link btn-sm cart-line__button";
    remove.textContent = "Remover";
    remove.setAttribute("aria-label", `Remover ${line.productName}`);
    remove.addEventListener("click", () => {
      state.cart.splice(index, 1);
      renderCart();
    });
    actions.append(amount, edit, remove);
    row.append(text, actions);
    container.append(row);
  });
}

function editLine(index) {
  const line = state.cart[index];
  const product = state.products.find((item) => item.code === line.productCode);
  if (!product) return;
  state.selectedProduct = product;
  state.editingIndex = index;
  $("selected-product-title").textContent = product.name;
  $("selected-product-description").textContent = "Atualize a configuração do item.";
  fillVariants(product, line.variantId);
  applyProductMode(product);
  $("shirt-name").value = line.customization.shirtName ?? "";
  $("shirt-number").value = line.customization.jerseyNumber ?? "";
  $("item-quantity").value = String(line.quantity);
  $("item-add").textContent = "Salvar alteração";
  showStep(2);
}

function renderBuyerOptions() {
  const classes = $("class-options");
  const modalities = $("modality-options");
  classes.replaceChildren();
  modalities.replaceChildren();
  for (const option of state.checkoutOptions.classes ?? []) classes.append(makeOption(option));
  for (const option of state.checkoutOptions.modalities ?? []) modalities.append(makeOption(option));
}

function makeOption(option) {
  const node = document.createElement("option");
  node.value = option.value;
  node.label = option.label;
  return node;
}

async function onBuyerSubmit(event) {
  event.preventDefault();
  const validation = validateBuyerForm();
  if (!validation.valid) {
    validation.firstInvalid?.focus();
    return;
  }
  state.buyer = readBuyerForm();
  clearGlobalAlert();
  $("buyer-continue").disabled = true;
  $("buyer-continue").textContent = "Conferindo valores…";
  try {
    const quote = await apiPost("/api/checkout/quote", { items: apiCartLines() });
    state.quote = quote;
    renderReview(quote, state.buyer);
    showStep(4);
    await configurePayment();
  } catch (error) {
    showGlobalError(error.message || "Não foi possível conferir o pedido.");
    if (error.fields) applyServerFieldErrors(error.fields);
  } finally {
    $("buyer-continue").disabled = false;
    $("buyer-continue").textContent = "Revisar pedido";
  }
}

function validateBuyerForm() {
  const form = $("buyer-form");
  for (const element of form.elements) element.setCustomValidity?.("");
  if (!form.reportValidity()) return { valid: false, firstInvalid: form.querySelector(":invalid") };
  const buyer = readBuyerForm();
  const digitsCpf = buyer.cpf.replace(/\D/gu, "");
  const digitsPhone = buyer.phone.replace(/\D/gu, "");
  const rg = buyer.rg.replace(/[\s.\-/]/gu, "");
  let valid = true;
  if (!isValidCpf(digitsCpf)) {
    $("buyer-cpf").setCustomValidity("Informe um CPF válido.");
    valid = false;
  }
  if (!/^\d{10,11}$/u.test(digitsPhone)) {
    $("buyer-phone").setCustomValidity("Informe um telefone com DDD.");
    valid = false;
  }
  if (rg.length < 4 || rg.length > 20 || !/^[\p{L}\p{N}]+$/u.test(rg)) {
    $("buyer-rg").setCustomValidity("Informe um RG válido.");
    valid = false;
  }
  const birthDate = new Date(`${buyer.birthDate}T00:00:00`);
  if (!Number.isFinite(birthDate.getTime()) || birthDate.getTime() > Date.now()) {
    $("buyer-birth-date").setCustomValidity("Informe uma data válida.");
    valid = false;
  }
  if (!valid) form.reportValidity();
  return { valid, firstInvalid: form.querySelector(":invalid") };
}

function readBuyerForm() {
  return {
    fullName: $("buyer-name").value.trim().replace(/\s+/gu, " "),
    cpf: $("buyer-cpf").value,
    rg: $("buyer-rg").value.trim(),
    birthDate: $("buyer-birth-date").value,
    phone: $("buyer-phone").value,
    email: $("buyer-email").value.trim().toLowerCase(),
    className: $("buyer-class").value.trim(),
    modality: $("buyer-modality").value.trim(),
  };
}

function apiCartLines() {
  return state.cart.map((line) => ({
    variantId: line.variantId,
    quantity: line.quantity,
    ...(line.productKind === "CAMISETA" ? { customization: line.customization } : {}),
  }));
}

function renderReview(quote, buyer) {
  const list = $("review-items");
  list.replaceChildren();
  for (const item of quote.items) {
    const row = document.createElement("div");
    row.className = "summary-item";
    const description = document.createElement("div");
    const title = document.createElement("p");
    title.className = "summary-item__title";
    title.textContent = `${item.productName} · ${item.variantName}`;
    const detail = document.createElement("p");
    detail.className = "summary-item__detail";
    const custom = item.customization?.shirtName
      ? ` · ${item.customization.shirtName} · nº ${item.customization.jerseyNumber}`
      : "";
    detail.textContent = `${item.quantity} × ${formatCents(item.unitPriceCents)}${custom}`;
    description.append(title, detail);
    const amount = document.createElement("p");
    amount.className = "summary-item__price";
    amount.textContent = formatCents(item.lineTotalCents);
    row.append(description, amount);
    list.append(row);
  }
  $("review-total").textContent = formatCents(quote.totalCents);
  $("review-buyer-name").textContent = buyer.fullName;
  $("review-buyer-contact").textContent = `${buyer.email} · ${buyer.phone}`;
  $("review-buyer-class").textContent = `${buyer.className} · ${buyer.modality}`;
}

async function configurePayment() {
  clearGlobalAlert();
  $("payment-unavailable").classList.add("d-none");
  $("card-payment-brick").replaceChildren();
  try {
    if (!state.paymentConfig) state.paymentConfig = await apiGet("/api/config/payment");
    if (!state.paymentConfig.available || !state.paymentConfig.publicKey) {
      $("payment-unavailable").classList.remove("d-none");
      return;
    }
    $("payment-loading").classList.remove("d-none");
    const MercadoPago = await loadMercadoPagoSdk();
    const mp = new MercadoPago(state.paymentConfig.publicKey, { locale: "pt-BR" });
    const builder = mp.bricks();
    state.brickController = await builder.create("cardPayment", "card-payment-brick", {
      initialization: {
        amount: Number(BigInt(state.quote.totalCents)) / 100,
        payer: {
          email: state.buyer?.email,
          identification: state.buyer?.cpf
            ? { type: "CPF", number: state.buyer.cpf.replace(/\D/gu, "") }
            : undefined,
        },
      },
      customization: {
        paymentMethods: { types: { excluded: ["debit_card", "prepaid_card"] } },
      },
      callbacks: {
        onReady: () => $("payment-loading").classList.add("d-none"),
        onSubmit: (formData, additionalData) => submitPayment(formData, additionalData, false),
        onError: () => {
          $("payment-loading").classList.add("d-none");
          showGlobalError("Não foi possível carregar o pagamento seguro. Tente novamente.");
        },
      },
    });
  } catch {
    $("payment-loading").classList.add("d-none");
    showGlobalError("Não foi possível carregar o pagamento seguro. Tente novamente.");
  }
}

async function loadMercadoPagoSdk() {
  if (window.MercadoPago) return window.MercadoPago;
  const existing = document.querySelector('script[data-mercadopago-sdk="true"]');
  if (existing) {
    await new Promise((resolve, reject) => {
      existing.addEventListener("load", resolve, { once: true });
      existing.addEventListener("error", reject, { once: true });
    });
    if (window.MercadoPago) return window.MercadoPago;
  }
  await new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = "https://sdk.mercadopago.com/js/v2";
    script.async = true;
    script.dataset.mercadopagoSdk = "true";
    script.onload = resolve;
    script.onerror = reject;
    document.head.append(script);
  });
  if (!window.MercadoPago) throw new Error("Mercado Pago SDK unavailable");
  return window.MercadoPago;
}

async function submitPayment(formData, additionalData, retry) {
  if (state.submitting) return Promise.reject(new Error("Payment already submitting"));
  state.submitting = true;
  clearGlobalAlert();
  $("payment-loading").classList.remove("d-none");
  try {
    const payment = {
      token: formData.token,
      paymentMethodId: formData.payment_method_id,
      paymentTypeId: additionalData?.paymentTypeId ?? "",
      installments: Number(formData.installments),
    };
    const idemKey = retry ? crypto.randomUUID() : getPendingIdempotencyKey();
    const response = retry
      ? await apiPost(`/api/orders/${encodeURIComponent(state.order.publicId)}/payment-attempts`, payment, idemKey)
      : await apiPost("/api/orders", {
        items: apiCartLines(),
        buyer: state.buyer,
        quotedTotalCents: state.quote.totalCents,
        payment,
      }, idemKey);
    state.order = response.order;
    sessionStorage.setItem("checkout-public-order", response.order.publicId);
    sessionStorage.removeItem("checkout-submit-key");
    renderConfirmation(response.order);
    startPolling();
    return Promise.resolve();
  } catch (error) {
    if (error instanceof ApiError && error.code === "ORDER_ALREADY_IN_PROGRESS") {
      await showCurrentOrder();
      return Promise.resolve();
    }
    if (!(error instanceof ApiError)) {
      await showCurrentOrder();
      showGlobalError("Estamos verificando a tentativa de pagamento. Não envie outra cobrança; consulte o status do pedido.");
      return Promise.resolve();
    }
    showGlobalError(error.message);
    return Promise.reject(error);
  } finally {
    state.submitting = false;
    $("payment-loading").classList.add("d-none");
  }
}

function getPendingIdempotencyKey() {
  let key = sessionStorage.getItem("checkout-submit-key");
  if (!key) {
    key = crypto.randomUUID();
    sessionStorage.setItem("checkout-submit-key", key);
  }
  return key;
}

function renderConfirmation(order) {
  stopPolling();
  state.order = order;
  const panel = document.querySelector('[data-step-panel="5"]');
  panel.classList.remove("d-none");
  panel.hidden = false;
  document.querySelectorAll("[data-step-panel]").forEach((element) => {
    if (element !== panel) {
      element.classList.add("d-none");
      element.hidden = true;
    }
  });
  updateStepper(4);
  const paymentStatus = order.paymentStatus ?? "PENDING";
  const approved = order.orderStatus === "PAID" || paymentStatus === "APPROVED";
  const rejected = paymentStatus === "REJECTED" || paymentStatus === "ERROR";
  const pending = !approved && !rejected && !["CANCELLED", "EXPIRED", "REFUNDED"].includes(paymentStatus);
  const css = approved ? "success" : pending ? "pending" : "failure";
  const heading = approved
    ? "Pagamento aprovado"
    : pending
      ? "Pagamento em processamento"
      : paymentStatus === "EXPIRED"
        ? "Prazo do pagamento encerrado"
        : paymentStatus === "CANCELLED"
          ? "Pagamento cancelado"
          : "Pagamento não aprovado";
  const message = approved
    ? "Seu pedido foi confirmado. Guarde a referência abaixo."
    : pending
      ? "Estamos aguardando a confirmação do Mercado Pago. Esta página será atualizada automaticamente."
      : rejected
        ? "O Mercado Pago não aprovou esta tentativa. Você pode tentar novamente com outro cartão."
        : "Consulte a referência abaixo para acompanhar seu pedido.";

  const root = document.createElement("div");
  root.className = `confirmation confirmation--${css}`;
  const icon = document.createElement("div");
  icon.className = "confirmation__icon";
  icon.setAttribute("aria-hidden", "true");
  icon.textContent = approved ? "✓" : pending ? "…" : "!";
  const title = document.createElement("h2");
  title.id = "confirmation-title";
  title.textContent = heading;
  const description = document.createElement("p");
  description.className = "muted";
  description.textContent = message;
  const reference = document.createElement("p");
  reference.className = "confirmation__reference";
  reference.append("Referência do pedido");
  const publicId = document.createElement("strong");
  publicId.textContent = order.publicId;
  reference.append(publicId);

  const summary = document.createElement("div");
  summary.className = "confirmation__summary";
  const items = document.createElement("div");
  for (const item of order.items ?? []) {
    const row = document.createElement("p");
    const custom = item.customization?.shirtName
      ? ` · ${item.customization.shirtName} · nº ${item.customization.jerseyNumber}`
      : "";
    row.textContent = `${item.quantity} × ${item.productName} · ${item.variantName}${custom} — ${formatCents(item.lineTotalCents)}`;
    items.append(row);
  }
  const total = document.createElement("p");
  total.className = "fw-bold mt-3";
  const chargedTotal = order.payment?.totalPaidAmountCents ?? order.totalCents;
  total.textContent = `Total do pedido: ${formatCents(order.totalCents)}${chargedTotal !== order.totalCents ? ` · Total informado pelo Mercado Pago: ${formatCents(chargedTotal)}` : ""}`;
  const terms = document.createElement("p");
  terms.className = "muted";
  if (order.payment?.installments) {
    const installmentText = order.payment.installmentAmountCents
      ? ` · ${formatCents(order.payment.installmentAmountCents)} cada`
      : "";
    terms.textContent = `Parcelamento selecionado: ${order.payment.installments}×${installmentText}`;
  }
  summary.append(items, total);
  if (terms.textContent) summary.append(terms);

  const actions = document.createElement("div");
  actions.className = "confirmation__actions";
  if (order.payment?.actionUrl && pending) {
    const continueAuth = document.createElement("a");
    continueAuth.className = "btn btn-primary";
    continueAuth.href = order.payment.actionUrl;
    continueAuth.target = "_blank";
    continueAuth.rel = "noopener noreferrer";
    continueAuth.textContent = "Continuar autenticação segura";
    actions.append(continueAuth);
  }
  if (rejected) {
    const retry = document.createElement("button");
    retry.className = "btn btn-primary";
    retry.type = "button";
    retry.textContent = "Tentar outro cartão";
    retry.addEventListener("click", mountRetryBrick);
    actions.append(retry);
  }

  const brickArea = document.createElement("div");
  brickArea.id = "retry-brick-area";
  brickArea.className = "mt-4 text-start";
  root.append(icon, title, description, reference, summary, actions, brickArea);
  panel.replaceChildren(root);
  announce(heading);
  if (pending) startPolling();
}

async function mountRetryBrick() {
  const container = $("retry-brick-area");
  container.replaceChildren();
  const brickHost = document.createElement("div");
  brickHost.id = "retry-card-payment-brick";
  container.append(brickHost);
  try {
    const config = state.paymentConfig ?? await apiGet("/api/config/payment");
    state.paymentConfig = config;
    if (!config.available || !config.publicKey) throw new Error("Pagamento não configurado");
    const MercadoPago = await loadMercadoPagoSdk();
    const mp = new MercadoPago(config.publicKey, { locale: "pt-BR" });
    const builder = mp.bricks();
    state.brickController = await builder.create("cardPayment", "retry-card-payment-brick", {
      initialization: {
        amount: Number(BigInt(state.order.totalCents)) / 100,
        ...(state.buyer?.email ? { payer: { email: state.buyer.email } } : {}),
      },
      customization: { paymentMethods: { types: { excluded: ["debit_card", "prepaid_card"] } } },
      callbacks: {
        onSubmit: (formData, additionalData) => submitPayment(formData, additionalData, true),
        onError: () => showGlobalError("Não foi possível carregar o pagamento seguro. Tente novamente."),
      },
    });
    brickHost.scrollIntoView({ behavior: "smooth", block: "center" });
  } catch {
    showGlobalError("Não foi possível carregar o pagamento seguro. Tente novamente.");
  }
}

async function showCurrentOrder() {
  try {
    const response = await apiGet("/api/checkout/current-order");
    if (response.order) renderConfirmation(response.order);
  } catch {
    // O estado será obtido novamente pelo comprador ao consultar o checkout.
  }
}

function startPolling() {
  stopPolling();
  if (!state.order) return;
  if (["APPROVED", "REJECTED", "CANCELLED", "EXPIRED", "REFUNDED", "PARTIALLY_REFUNDED", "CHARGEDBACK"].includes(state.order.paymentStatus)
    || state.order.orderStatus === "PAID") return;
  state.pollingTimer = window.setTimeout(async () => {
    try {
      const response = await apiGet(`/api/orders/${encodeURIComponent(state.order.publicId)}`);
      if (JSON.stringify(response.order) !== JSON.stringify(state.order)) renderConfirmation(response.order);
      else startPolling();
    } catch {
      startPolling();
    }
  }, 3500);
}

function stopPolling() {
  if (state.pollingTimer) window.clearTimeout(state.pollingTimer);
  state.pollingTimer = null;
}

function showStep(step) {
  clearGlobalAlert();
  document.querySelectorAll("[data-step-panel]").forEach((panel) => {
    const active = Number(panel.dataset.stepPanel) === step;
    panel.classList.toggle("d-none", !active);
    panel.hidden = !active;
  });
  updateStepper(step);
  window.scrollTo({ top: 0, behavior: "smooth" });
  const panel = document.querySelector(`[data-step-panel="${step}"]`);
  panel?.querySelector("h2")?.focus?.({ preventScroll: true });
}

function updateStepper(step) {
  document.querySelectorAll("[data-step-indicator]").forEach((item) => {
    const number = Number(item.dataset.stepIndicator);
    item.classList.toggle("is-current", number === Math.min(step, 4));
    item.classList.toggle("is-complete", number < Math.min(step, 4));
    if (number === Math.min(step, 4)) item.setAttribute("aria-current", "step");
    else item.removeAttribute("aria-current");
  });
  const bar = $("progress-bar");
  const progress = Math.min(step, 4) * 25;
  bar.style.width = `${progress}%`;
  bar.parentElement.setAttribute("aria-valuenow", String(progress));
}

function applyServerFieldErrors(fields) {
  const mapping = { fullName: "buyer-name", cpf: "buyer-cpf", rg: "buyer-rg", birthDate: "buyer-birth-date", phone: "buyer-phone", email: "buyer-email", className: "buyer-class", modality: "buyer-modality" };
  for (const [field, message] of Object.entries(fields)) {
    const id = mapping[field];
    if (id && $(id)) $(id).setCustomValidity(message);
  }
  $("buyer-form").reportValidity();
}

function showGlobalError(message) {
  const alert = $("global-alert");
  alert.className = "alert alert-danger";
  alert.textContent = message;
  alert.focus?.();
}

function clearGlobalAlert() {
  const alert = $("global-alert");
  alert.className = "alert d-none";
  alert.textContent = "";
}

function announce(message) {
  $("live-status").textContent = message;
}

function formatCents(value) {
  const cents = BigInt(value);
  const whole = cents / 100n;
  const fraction = (cents % 100n).toString().padStart(2, "0");
  return `R$ ${new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 0 }).format(Number(whole))},${fraction}`;
}

function isValidCpf(value) {
  const cpf = value.replace(/\D/gu, "");
  if (!/^\d{11}$/u.test(cpf) || /^([0-9])\1{10}$/u.test(cpf)) return false;
  const digit = (length) => {
    const sum = Array.from({ length }, (_, index) => Number(cpf[index]) * (length + 1 - index)).reduce((total, current) => total + current, 0);
    const remainder = (sum * 10) % 11;
    return remainder === 10 ? 0 : remainder;
  };
  return digit(9) === Number(cpf[9]) && digit(10) === Number(cpf[10]);
}
