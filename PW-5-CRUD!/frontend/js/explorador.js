/**
 * CRUD Mundo · aba "API Países"
 * Conversa com backend/api/geo.php, que consulta REST Countries + CountriesNow.
 */
(function () {
    "use strict";

    var CFG = window.EXPLORADOR;
    if (!CFG) { return; }

    /* ------------------------------ utilidades ------------------------------ */
    function $(id) { return document.getElementById(id); }

    function esc(s) {
        return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
            return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
        });
    }
    function num(n) { return n == null ? "—" : Number(n).toLocaleString("pt-BR"); }
    function norm(s) {
        return String(s || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, " ").trim();
    }
    function pausa(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }

    /** GET no endpoint JSON; lança Error com a mensagem do servidor */
    async function api(acao, params) {
        var q = new URLSearchParams(Object.assign({ acao: acao }, params || {}));
        var resp;
        try {
            resp = await fetch(CFG.api + "?" + q.toString(), { credentials: "same-origin", headers: { Accept: "application/json" } });
        } catch (e) {
            throw new Error("Sem conexão com o servidor.");
        }
        if (resp.status === 401) { location.href = (window.BASE_URL || "") + "/login.php"; throw new Error("Sessão expirada."); }
        var dados = null;
        try { dados = await resp.json(); } catch (e) { /* resposta não-JSON */ }
        if (!resp.ok) { throw new Error((dados && dados.erro) || "Erro " + resp.status + " ao consultar a API."); }
        return dados;
    }

    function bandeira(url, classe, alt) {
        if (!url) { return '<span class="bandeira-vazia">🚩</span>'; }
        return '<img class="' + (classe || "flag") + '" src="' + esc(url) + '" alt="' + esc(alt || "") + '" loading="lazy">';
    }
    // bandeira que não carregar vira 🚩
    document.addEventListener("error", function (ev) {
        var img = ev.target;
        if (img && img.tagName === "IMG" && /^(flag|flag-grande|flag-mini)$/.test(img.className)) {
            var s = document.createElement("span");
            s.className = "bandeira-vazia";
            s.textContent = "🚩";
            img.replaceWith(s);
        }
    }, true);

    /* ------------------------------ abas ------------------------------ */
    var abas = document.querySelectorAll(".api-aba");
    var carregouExplorar = false;
    abas.forEach(function (b) {
        b.addEventListener("click", function () {
            abas.forEach(function (x) {
                var on = x === b;
                x.classList.toggle("ativo", on);
                x.setAttribute("aria-selected", on ? "true" : "false");
                $("painel-" + x.dataset.aba).hidden = !on;
            });
            if (b.dataset.aba === "explorar" && !carregouExplorar) { carregouExplorar = true; carregarExplorar(); }
            if (b.dataset.aba === "manual") { garantirLista().then(preencherDatalistPaises); }
        });
    });

    /* ------------------------------ status das APIs ------------------------------ */
    function chip(id, estado, texto) {
        var el = $(id);
        var nome = el.textContent.split("·")[0].trim();
        el.innerHTML = '<i class="ponto ponto-' + estado + '"></i> ' + esc(nome) + " · <b>" + esc(texto) + "</b>";
    }

    function mostrarAviso(msg) {
        var a = $("api-aviso");
        if (!msg) { a.hidden = true; return; }
        a.querySelector("span").textContent = msg;
        a.hidden = false;
    }

    async function carregarStatus() {
        try {
            var s = await api("status");
            var rc = s.restcountries;
            if (rc.modo === "completo") { chip("chip-rc", "ok", rc.chavePropria ? "online · chave própria" : "online"); }
            else if (rc.modo === "demo") { chip("chip-rc", "aviso", "chave demo (dados limitados)"); }
            else { chip("chip-rc", "erro", "indisponível — usando reserva"); }
            chip("chip-cn", s.countriesnow.ok ? "ok" : "erro", s.countriesnow.ok ? "online" : "indisponível");

            var m = s.paises || {};
            var meta = $("chip-meta");
            if (m.total) {
                var quando = m.quando ? new Date(m.quando * 1000).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }) : "";
                meta.textContent = m.total + " países na base" + (quando ? " · atualizado às " + quando : "") + (m.cache ? " (cache)" : "");
                meta.hidden = false;
            }
            if (rc.modo === "demo") {
                mostrarAviso("A chave pública de demonstração do REST Countries só devolve dados de exemplo. Os países foram completados pela fonte reserva (CountriesNow), sem população/área. Para dados completos, crie uma chave gratuita em restcountries.com e cole em backend/config/apis.php.");
            } else if (rc.modo === "erro") {
                mostrarAviso("REST Countries indisponível" + (rc.detalhe ? " (" + rc.detalhe + ")" : "") + ". Usando a fonte reserva (CountriesNow): bandeira, capital e moeda apenas.");
            } else if (m.obsoleto) {
                mostrarAviso("Não foi possível atualizar agora; exibindo dados guardados anteriormente.");
            }
        } catch (e) {
            chip("chip-rc", "erro", "sem resposta");
            chip("chip-cn", "erro", "sem resposta");
            mostrarAviso(e.message);
        }
    }

    $("btn-atualizar").addEventListener("click", async function () {
        var b = this;
        b.disabled = true;
        b.textContent = "Atualizando…";
        try { await api("limpar_cache"); } catch (e) { /* ignora */ }
        location.reload();
    });

    /* ------------------------------ 1. validação dos cadastros ------------------------------ */
    var SELOS = {
        confirmado: ["selo-ok", "✔ Confirmado"], provavel: ["selo-prov", "≈ Provável"],
        nao_encontrado: ["selo-erro", "✖ Não encontrado"], indisponivel: ["selo-aviso", "⚠ Indisponível"]
    };
    var ICONE_CIDADE = { confirmada: "✔", provavel: "≈", nao_encontrada: "✖", indisponivel: "⚠" };
    var CLASSE_CIDADE = { confirmada: "cid-ok", provavel: "cid-prov", nao_encontrada: "cid-erro", indisponivel: "cid-aviso" };

    var resumo = { paisesOk: 0, paisesTotal: 0, cidadesOk: 0, cidadesTotal: 0, alertas: 0 };
    function atualizarResumo(final) {
        $("r-paises").textContent = resumo.paisesOk + " / " + CFG.paises.length;
        $("r-cidades").textContent = resumo.cidadesOk + " / " + resumo.cidadesTotal;
        $("r-alertas").textContent = String(resumo.alertas);
        $("api-resumo").classList.toggle("pronto", !!final);
    }

    function pintarLinha(tr, r) {
        var alertas = 0;
        var api_ = r.api;

        // bandeira
        tr.querySelector(".col-bandeira").innerHTML = api_ ? bandeira(api_.bandeiraPng, "flag", "Bandeira de " + r.nome) : '<span class="bandeira-vazia">🚩</span>';

        // situação
        var selo = SELOS[r.status] || SELOS.indisponivel;
        var htmlStatus = '<span class="selo ' + selo[0] + '">' + selo[1] + "</span>";
        if (api_) {
            htmlStatus += '<small class="detalhe">' + esc(api_.nome) + " (" + esc(api_.iso2) + ")" +
                (r.como === "aproximado" ? " · grafia aproximada" : "") + "</small>";
        } else if (r.erro) {
            htmlStatus += '<small class="detalhe">' + esc(r.erro) + "</small>";
        } else if (r.status === "nao_encontrado") {
            htmlStatus += '<small class="detalhe">Não consta nas bases consultadas</small>';
        }
        tr.querySelector(".col-status").innerHTML = htmlStatus;
        if (r.status === "confirmado") { resumo.paisesOk++; } else { alertas++; }

        // dados atualizados
        var linhas = [];
        if (api_) {
            if (api_.capitais && api_.capitais.length) { linhas.push("🏛️ " + esc(api_.capitais.join(", "))); }
            if (api_.regiao) { linhas.push("🗺️ " + esc(api_.regiao) + (api_.subregiao ? " · " + esc(api_.subregiao) : "")); }
            var c = r.comparacao || {};
            if (c.populacao) {
                var p = c.populacao;
                var dif = p.difPct == null ? "" : " (" + (p.difPct > 0 ? "+" : "") + String(p.difPct).replace(".", ",") + "%)";
                linhas.push('👥 <span class="' + (p.divergente ? "dif-alerta" : "") + '">' + num(p.api) + " hab." + dif + "</span>");
                if (p.divergente) { alertas++; }
            }
            if (c.area && c.area.divergente) {
                linhas.push('📐 <span class="dif-alerta">' + num(Math.round(c.area.api)) + " km² (cadastro: " + num(Math.round(c.area.cadastrado)) + ")</span>");
                alertas++;
            }
            if (c.continente && c.continente.confere === false) {
                linhas.push('🧭 <span class="dif-alerta">Continente diverge: API diz ' + esc(c.continente.api) + "</span>");
                alertas++;
            }
            if (api_.moedas && api_.moedas.length) {
                linhas.push("💰 " + esc(api_.moedas.map(function (m) { return m.nome || m.codigo; }).join(", ")));
            }
        }
        tr.querySelector(".col-dados").innerHTML = linhas.length
            ? linhas.map(function (l) { return '<div class="dado-linha">' + l + "</div>"; }).join("")
            : '<small class="detalhe">—</small>';

        // cidades
        var cidades = r.cidades || [];
        if (!cidades.length) {
            tr.querySelector(".col-cidades").innerHTML = '<small class="detalhe">Nenhuma cidade cadastrada</small>';
        } else {
            tr.querySelector(".col-cidades").innerHTML = '<div class="cidades-chips">' + cidades.map(function (c) {
                resumo.cidadesTotal++;
                if (c.status === "confirmada") { resumo.cidadesOk++; } else if (c.status !== "indisponivel") { alertas++; }
                var extra = c.correspondencia && norm(c.correspondencia) !== norm(c.nome) ? " → " + esc(c.correspondencia) : "";
                return '<span class="cid ' + (CLASSE_CIDADE[c.status] || "cid-aviso") + '" title="' + esc(c.detalhe + (c.fonte ? " [" + c.fonte + "]" : "")) + '">' +
                    ICONE_CIDADE[c.status] + " " + esc(c.nome) + extra + "</span>";
            }).join("") + "</div>";
        }
        resumo.alertas += alertas;
        tr.classList.toggle("linha-alerta", alertas > 0);
    }

    function erroLinha(tr, msg) {
        tr.querySelector(".col-status").innerHTML = '<span class="selo selo-aviso">⚠ Indisponível</span><small class="detalhe">' + esc(msg) + "</small>";
    }

    async function validarCadastros() {
        atualizarResumo(false);
        var linhas = Array.prototype.slice.call(document.querySelectorAll("#tabela-validacao tbody tr[data-id]"));
        for (var i = 0; i < linhas.length; i++) {
            var tr = linhas[i];
            try {
                var r = await api("auditar", { id: tr.dataset.id });
                pintarLinha(tr, r);
            } catch (e) {
                erroLinha(tr, e.message);
            }
            atualizarResumo(i === linhas.length - 1);
        }
        atualizarResumo(true);
    }

    /* ------------------------------ lista de países (compartilhada) ------------------------------ */
    var listaPaises = null;
    var promessaLista = null;
    function garantirLista() {
        if (listaPaises) { return Promise.resolve(listaPaises); }
        if (!promessaLista) {
            promessaLista = api("paises").then(function (d) { listaPaises = d.paises; return listaPaises; }).catch(function (e) {
                promessaLista = null;
                throw e;
            });
        }
        return promessaLista;
    }
    function nomeExibicao(p) { return p.nomePt || p.nome; }

    function achaPaisPorTexto(txt) {
        var n = norm(txt);
        if (!n || !listaPaises) { return null; }
        for (var i = 0; i < listaPaises.length; i++) {
            var p = listaPaises[i];
            if (norm(p.nome) === n || norm(p.nomePt) === n || p.iso2.toLowerCase() === n) { return p; }
        }
        return null;
    }

    /* ------------------------------ 2. validador manual ------------------------------ */
    var dlPaises = $("dl-paises"), dlEstados = $("dl-estados"), dlCidades = $("dl-cidades");
    var mPais = $("m-pais"), mEstado = $("m-estado"), mCidade = $("m-cidade");
    var estadosAtual = { iso: null, lista: [] };
    var cidadesAtual = { chave: null, lista: [] };

    function preencherDatalistPaises() {
        if (!listaPaises || dlPaises.children.length) { return; }
        var frag = document.createDocumentFragment();
        listaPaises.forEach(function (p) {
            var o = document.createElement("option");
            o.value = nomeExibicao(p);
            if (p.nomePt && p.nomePt !== p.nome) { o.label = p.nome; }
            frag.appendChild(o);
        });
        dlPaises.appendChild(frag);
    }

    async function aoMudarPais() {
        var p = achaPaisPorTexto(mPais.value);
        dlEstados.innerHTML = "";
        dlCidades.innerHTML = "";
        estadosAtual = { iso: null, lista: [] };
        cidadesAtual = { chave: null, lista: [] };
        if (!p) { return; }
        try {
            var d = await api("estados", { iso: p.iso2 });
            estadosAtual = { iso: p.iso2, lista: d.estados || [] };
            var frag = document.createDocumentFragment();
            estadosAtual.lista.forEach(function (e) {
                var o = document.createElement("option");
                o.value = e.nome;
                if (e.codigo) { o.label = e.codigo; }
                frag.appendChild(o);
            });
            dlEstados.appendChild(frag);
        } catch (e) { /* sem sugestões; a validação ainda funciona */ }
    }

    async function carregarCidadesSugestao() {
        var p = achaPaisPorTexto(mPais.value);
        if (!p) { return; }
        var estado = mEstado.value.trim();
        var chave = p.iso2 + "|" + norm(estado);
        if (cidadesAtual.chave !== chave) {
            try {
                var d = await api("cidades", estado ? { iso: p.iso2, estado: estado } : { iso: p.iso2 });
                var lista = estado ? (d.cidades || []) : (d.cidades || []);
                cidadesAtual = { chave: chave, lista: lista };
            } catch (e) {
                cidadesAtual = { chave: chave, lista: [] };
            }
        }
        filtrarSugestoesCidade();
    }
    function filtrarSugestoesCidade() {
        var t = norm(mCidade.value);
        var lista = cidadesAtual.lista;
        var vistos = [];
        for (var i = 0; i < lista.length && vistos.length < 150; i++) {
            if (!t || norm(lista[i]).indexOf(t) === 0) { vistos.push(lista[i]); }
        }
        dlCidades.innerHTML = vistos.map(function (c) { return '<option value="' + esc(c) + '">'; }).join("");
    }

    mPais.addEventListener("change", aoMudarPais);
    mEstado.addEventListener("change", function () { cidadesAtual.chave = null; });
    mCidade.addEventListener("focus", carregarCidadesSugestao);
    mCidade.addEventListener("input", filtrarSugestoesCidade);

    function blocoResultado(titulo, estado, corpo) {
        var mapa = {
            confirmado: ["res-ok", "✔ Confirmado"], confirmada: ["res-ok", "✔ Confirmada"],
            provavel: ["res-prov", "≈ Provável"], nao_encontrado: ["res-erro", "✖ Não encontrado"],
            nao_encontrada: ["res-erro", "✖ Não encontrada"], indisponivel: ["res-aviso", "⚠ Indisponível"],
            sem_base: ["res-aviso", "⚠ Sem dados na base"]
        };
        var m = mapa[estado] || mapa.indisponivel;
        return '<div class="res-bloco ' + m[0] + '"><div class="res-topo"><span class="res-titulo">' + esc(titulo) +
            '</span><span class="selo-res">' + m[1] + '</span></div><div class="res-corpo">' + corpo + "</div></div>";
    }

    async function validarManual() {
        var alvo = $("m-resultado");
        var pais = mPais.value.trim();
        if (pais.length < 2) { alvo.innerHTML = '<p class="res-vazio">Informe ao menos o país.</p>'; return; }
        alvo.innerHTML = '<p class="res-vazio"><span class="spinner"></span> Consultando as APIs…</p>';
        $("m-validar").disabled = true;
        try {
            var r = await api("validar", { pais: pais, estado: mEstado.value.trim(), cidade: mCidade.value.trim() });
            var html = "";

            // país
            if (r.pais.api) {
                var p = r.pais.api;
                html += blocoResultado("País", r.pais.status,
                    '<div class="res-pais">' + bandeira(p.bandeiraPng, "flag-grande", "Bandeira de " + p.nome) +
                    "<div><strong>" + esc(p.nomePt || p.nome) + "</strong><small>" + esc(p.oficial || p.nome) + " · " + esc(p.iso2) + (p.iso3 ? "/" + esc(p.iso3) : "") + "</small>" +
                    "<small>" + (p.capitais.length ? "🏛️ " + esc(p.capitais.join(", ")) + " · " : "") + (p.regiao ? "🗺️ " + esc(p.regiao) : "") +
                    (p.populacao ? " · 👥 " + num(p.populacao) : "") + "</small></div></div>");
            } else {
                html += blocoResultado("País", "nao_encontrado", "<p>“" + esc(pais) + "” não consta nas bases consultadas.</p>");
            }

            // estado
            if (r.estado) {
                var e = r.estado;
                html += blocoResultado("Estado / província", e.status,
                    e.api ? "<p><strong>" + esc(e.api.nome) + "</strong>" + (e.api.codigo ? " · sigla " + esc(e.api.codigo) : "") + "</p>"
                          : "<p>" + esc(e.detalhe || "") + "</p>");
            }

            // cidade
            if (r.cidade) {
                var c = r.cidade;
                var nome = c.correspondencia ? '<p><strong>' + esc(c.correspondencia) + "</strong></p>" : "";
                html += blocoResultado("Cidade", c.status, nome + "<p>" + esc(c.detalhe) + (c.fonte ? " <small>(fonte: " + esc(c.fonte) + ")</small>" : "") + "</p>");
            }
            alvo.innerHTML = html;
        } catch (e) {
            alvo.innerHTML = '<div class="alerta alerta-erro"><span>' + esc(e.message) + "</span></div>";
        } finally {
            $("m-validar").disabled = false;
        }
    }

    $("m-validar").addEventListener("click", validarManual);
    [mPais, mEstado, mCidade].forEach(function (el) {
        el.addEventListener("keydown", function (ev) { if (ev.key === "Enter") { ev.preventDefault(); validarManual(); } });
    });
    document.querySelectorAll(".api-exemplos [data-ex]").forEach(function (b) {
        b.addEventListener("click", async function () {
            var p = b.dataset.ex.split("|");
            await garantirLista().catch(function () {});
            mPais.value = p[0] || ""; mEstado.value = p[1] || ""; mCidade.value = p[2] || "";
            aoMudarPais();
            validarManual();
        });
    });

    /* ------------------------------ 3. explorar ------------------------------ */
    var grade = $("x-grade");

    function renderGrade() {
        var q = norm($("x-busca").value);
        var regiao = $("x-regiao").value;
        var itens = listaPaises.filter(function (p) {
            return (!regiao || p.regiao === regiao) &&
                (!q || norm(p.nome).indexOf(q) >= 0 || norm(p.nomePt).indexOf(q) >= 0 || p.iso2.toLowerCase() === q);
        });
        $("x-contagem").textContent = itens.length + " de " + listaPaises.length + " países";
        if (!itens.length) { grade.innerHTML = '<p class="lista-vazia">Nenhum país encontrado.</p>'; return; }
        grade.innerHTML = itens.map(function (p) {
            return '<button type="button" class="pais-card" data-iso="' + esc(p.iso2) + '">' +
                bandeira(p.bandeira, "flag-grande", "Bandeira de " + p.nome) +
                "<strong>" + esc(nomeExibicao(p)) + "</strong>" +
                "<small>" + (p.nomePt && p.nomePt !== p.nome ? esc(p.nome) + " · " : "") + esc(p.regiao || "—") + "</small></button>";
        }).join("");
    }

    async function carregarExplorar() {
        try {
            await garantirLista();
            var regioes = {};
            listaPaises.forEach(function (p) { if (p.regiao) { regioes[p.regiao] = true; } });
            var sel = $("x-regiao");
            Object.keys(regioes).sort().forEach(function (r) {
                var o = document.createElement("option");
                o.value = r; o.textContent = r;
                sel.appendChild(o);
            });
            renderGrade();
        } catch (e) {
            grade.innerHTML = '<div class="alerta alerta-erro"><span>' + esc(e.message) + "</span></div>";
        }
    }
    $("x-busca").addEventListener("input", function () { if (listaPaises) { renderGrade(); } });
    $("x-regiao").addEventListener("change", function () { if (listaPaises) { renderGrade(); } });

    grade.addEventListener("click", function (ev) {
        var b = ev.target.closest(".pais-card");
        if (b) { abrirDetalhe(b.dataset.iso); }
    });

    var dialogo = $("x-dialogo");
    $("x-fechar").addEventListener("click", function () { dialogo.close(); });
    dialogo.addEventListener("click", function (ev) { if (ev.target === dialogo) { dialogo.close(); } });

    function linhaInfo(rot, val) {
        return val ? "<dt>" + esc(rot) + "</dt><dd>" + val + "</dd>" : "";
    }

    async function abrirDetalhe(iso) {
        $("x-conteudo").innerHTML = '<p class="lista-vazia"><span class="spinner"></span> Carregando…</p>';
        if (!dialogo.open) { dialogo.showModal(); }
        try {
            var d = await api("pais", { iso: iso });
            var p = d.pais;
            var moedas = (p.moedas || []).map(function (m) { return esc(m.nome || m.codigo) + (m.codigo ? " (" + esc(m.codigo) + (m.simbolo ? " " + esc(m.simbolo) : "") + ")" : ""); }).join(", ");
            var html = '<div class="det-topo">' + bandeira(p.bandeiraPng, "flag-grande", "Bandeira de " + p.nome) +
                '<div><h2 id="x-titulo">' + esc(p.nomePt || p.nome) + "</h2>" +
                "<p class=\"subtitulo\">" + esc(p.oficial || p.nome) + " · " + esc(p.iso2) + (p.iso3 ? "/" + esc(p.iso3) : "") + "</p>" +
                (d.cadastro ? '<span class="selo selo-ok">✔ Cadastrado no sistema</span>' : '<span class="selo selo-espera">Não cadastrado</span>') +
                "</div></div>" +
                '<dl class="det-grade">' +
                linhaInfo("Capital", esc((p.capitais || []).join(", "))) +
                linhaInfo("Região", esc(p.regiao) + (p.subregiao ? " · " + esc(p.subregiao) : "")) +
                linhaInfo("População", p.populacao ? num(p.populacao) + " hab." : "") +
                linhaInfo("Área", p.area ? num(Math.round(p.area)) + " km²" : "") +
                linhaInfo("Moedas", moedas) +
                linhaInfo("Idiomas", esc((p.idiomas || []).join(", "))) +
                linhaInfo("Fusos horários", esc((p.fusos || []).join(", "))) +
                linhaInfo("DDI", (p.ddi || []).length ? "+" + esc(p.ddi.join(", +")) : "") +
                linhaInfo("Domínio", esc((p.tld || []).join(", "))) +
                linhaInfo("Trânsito", p.lado ? (p.lado === "left" ? "mão esquerda" : p.lado === "right" ? "mão direita" : esc(p.lado)) : "") +
                linhaInfo("Fronteiras", esc((p.fronteiras || []).join(", "))) +
                linhaInfo("ONU", p.onu == null ? "" : (p.onu ? "membro" : "não é membro")) +
                "</dl>" +
                '<div class="det-links">' +
                (p.mapa ? '<a class="btn btn-neutro btn-pequeno" target="_blank" rel="noopener" href="' + esc(p.mapa) + '">📍 Google Maps</a>' : "") +
                (p.wikipedia ? '<a class="btn btn-neutro btn-pequeno" target="_blank" rel="noopener" href="' + esc(p.wikipedia) + '">Wikipédia</a>' : "") +
                (d.cadastro ? '<a class="btn btn-neutro btn-pequeno" href="' + esc((window.BASE_URL || "") + "/backend/paises/index.php?destaque=" + d.cadastro.id) + '">Ver no cadastro</a>' : "") +
                "</div>" +
                '<div class="det-geo"><h3>Estados / províncias</h3><div id="x-estados"><button type="button" class="btn btn-primario btn-pequeno" id="x-ver-estados">Carregar estados</button></div>' +
                '<div id="x-cidades-estado"></div></div>';
            $("x-conteudo").innerHTML = html;
            $("x-ver-estados").addEventListener("click", function () { carregarEstadosDetalhe(p.iso2); });
        } catch (e) {
            $("x-conteudo").innerHTML = '<div class="alerta alerta-erro"><span>' + esc(e.message) + "</span></div>";
        }
    }

    async function carregarEstadosDetalhe(iso) {
        var alvo = $("x-estados");
        alvo.innerHTML = '<span class="spinner"></span> Consultando CountriesNow…';
        try {
            var d = await api("estados", { iso: iso });
            if (!d.estados.length) {
                alvo.innerHTML = '<p class="res-vazio">A base não tem estados/províncias para este país.</p>' +
                    '<button type="button" class="btn btn-neutro btn-pequeno" id="x-cid-pais">Ver cidades do país</button>';
                $("x-cid-pais").addEventListener("click", function () { carregarCidadesDetalhe(iso, null, null); });
                return;
            }
            alvo.innerHTML = '<div class="estados-chips">' + d.estados.map(function (e) {
                return '<button type="button" class="chip-filtro" data-estado="' + esc(e.nome) + '">' + esc(e.nome) + (e.codigo ? " · " + esc(e.codigo) : "") + "</button>";
            }).join("") + "</div>";
            alvo.querySelectorAll("[data-estado]").forEach(function (b) {
                b.addEventListener("click", function () {
                    alvo.querySelectorAll("[data-estado]").forEach(function (x) { x.classList.toggle("ativo", x === b); });
                    carregarCidadesDetalhe(iso, b.dataset.estado, b.textContent);
                });
            });
        } catch (e) {
            alvo.innerHTML = '<div class="alerta alerta-erro"><span>' + esc(e.message) + "</span></div>";
        }
    }

    async function carregarCidadesDetalhe(iso, estado, rotulo) {
        var alvo = $("x-cidades-estado");
        alvo.innerHTML = '<p class="res-vazio"><span class="spinner"></span> Carregando cidades…</p>';
        try {
            var d = await api("cidades", estado ? { iso: iso, estado: estado } : { iso: iso });
            var lista = d.cidades || [];
            if (!lista.length) { alvo.innerHTML = '<p class="res-vazio">Nenhuma cidade encontrada na base.</p>'; return; }
            alvo.innerHTML = '<h4>Cidades' + (rotulo ? " — " + esc(rotulo) : "") + " (" + lista.length + ')</h4>' +
                '<input type="search" class="campo-busca" id="x-cid-filtro" placeholder="Filtrar cidades…">' +
                '<div class="cidades-lista" id="x-cid-lista"></div>';
            var box = $("x-cid-lista");
            function desenhar() {
                var t = norm($("x-cid-filtro").value);
                var itens = lista.filter(function (c) { return !t || norm(c).indexOf(t) >= 0; }).slice(0, 300);
                box.innerHTML = itens.map(function (c) { return '<span class="cid cid-neutro">' + esc(c) + "</span>"; }).join("") +
                    (lista.length > 300 && !t ? '<span class="res-vazio">… use o filtro para ver as demais</span>' : "");
            }
            $("x-cid-filtro").addEventListener("input", desenhar);
            desenhar();
        } catch (e) {
            alvo.innerHTML = '<div class="alerta alerta-erro"><span>' + esc(e.message) + "</span></div>";
        }
    }

    /* ------------------------------ início ------------------------------ */
    // primeiro o status (preenche o cache dos países); depois a validação, uma linha por vez
    carregarStatus().then(validarCadastros);
})();
