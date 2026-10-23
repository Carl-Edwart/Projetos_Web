/**
 * CRUD Mundo · aba "Mapa"
 * - carrega a Google Maps JavaScript API
 * - mostra um marcador (bandeira) para cada país cadastrado
 * - destaca a ETEC Aquarius (São José dos Campos) com um ícone próprio
 * - lista lateral com busca e filtro por continente
 * - países sem coordenada na tabela interna são localizados via Geocoding API
 */
(function () {
    "use strict";

    var D = window.MAPA_DADOS;
    if (!D) { return; }

    var BASE = window.BASE_URL || "";
    var caixa = document.getElementById("mapa-caixa");
    var elMapa = document.getElementById("mapa");
    var lista = document.getElementById("lista-paises");
    var busca = document.getElementById("mapa-busca");
    var filtros = document.getElementById("mapa-continentes");
    var vazio = document.getElementById("lista-vazia");

    var paisesPorId = {};
    D.paises.forEach(function (p) { paisesPorId[p.id] = p; });

    var mapa = null;
    var janela = null;
    var marcadores = {};      // id do país -> AdvancedMarkerElement
    var etecMarcador = null;
    var ativo = null;         // { tipo: "pais"|"etec", id }
    var filtroTexto = "";
    var filtroContinente = "";

    function esc(s) {
        return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
            return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
        });
    }

    /* Bandeira que não carregar vira 🚩 (sem quebrar o layout) */
    document.addEventListener("error", function (ev) {
        var img = ev.target;
        if (!img || img.tagName !== "IMG" || !/flagcdn\.com/.test(img.src)) { return; }
        var span = document.createElement("span");
        span.className = (img.className || "") + " bandeira-emoji mk-emoji";
        span.textContent = "🚩";
        img.replaceWith(span);
    }, true);

    /* ===================== Lista lateral + filtros ===================== */
    function marcarItemAtivo() {
        lista.querySelectorAll("li").forEach(function (li) {
            li.classList.toggle("ativo", !!ativo && ativo.tipo === "pais" && String(ativo.id) === li.dataset.id);
        });
        marcadorEtecAtivo(!!ativo && ativo.tipo === "etec");
        Object.keys(marcadores).forEach(function (id) {
            var c = marcadores[id].content;
            if (c) { c.classList.toggle("ativo", !!ativo && ativo.tipo === "pais" && String(ativo.id) === id); }
        });
    }

    function marcadorEtecAtivo(on) {
        if (etecMarcador && etecMarcador.content) { etecMarcador.content.classList.toggle("ativo", on); }
    }

    function aplicarFiltros() {
        var q = filtroTexto.trim().toLowerCase();
        var visiveis = 0;
        lista.querySelectorAll("li").forEach(function (li) {
            var ok = (!filtroContinente || li.dataset.continente === filtroContinente) &&
                     (!q || li.dataset.busca.indexOf(q) >= 0);
            li.hidden = !ok;
            if (ok) { visiveis++; }
            var m = marcadores[li.dataset.id];
            if (m) { m.map = ok ? mapa : null; }
        });
        if (vazio) { vazio.hidden = visiveis > 0 || D.paises.length === 0; }
        if (mapa) { enquadrarVisiveis(); }
    }

    if (busca) {
        busca.addEventListener("input", function () { filtroTexto = busca.value; aplicarFiltros(); });
    }
    if (filtros) {
        filtros.addEventListener("click", function (ev) {
            var b = ev.target.closest(".chip-filtro");
            if (!b) { return; }
            filtros.querySelectorAll(".chip-filtro").forEach(function (x) { x.classList.toggle("ativo", x === b); });
            filtroContinente = b.dataset.continente || "";
            aplicarFiltros();
        });
    }

    lista.addEventListener("click", function (ev) {
        var b = ev.target.closest(".pais-item");
        if (b) { selecionarPais(parseInt(b.dataset.id, 10), true); }
    });
    var btnEtecCard = document.getElementById("etec-card");
    var btnEtec = document.getElementById("btn-etec");
    var btnTodos = document.getElementById("btn-todos");
    if (btnEtecCard) { btnEtecCard.addEventListener("click", irParaEtec); }
    if (btnEtec) { btnEtec.addEventListener("click", irParaEtec); }
    if (btnTodos) {
        btnTodos.addEventListener("click", function () {
            if (janela) { janela.close(); }
            ativo = null; marcarItemAtivo();
            if (busca) { busca.value = ""; }
            filtroTexto = ""; filtroContinente = "";
            if (filtros) {
                filtros.querySelectorAll(".chip-filtro").forEach(function (x, i) { x.classList.toggle("ativo", i === 0); });
            }
            aplicarFiltros();
        });
    }

    /* Sem chave configurada: só a lista funciona (o aviso já está na página) */
    if (!elMapa) { return; }

    /* ===================== Carregamento da API ========================= */
    function mostrarErro(titulo, texto) {
        if (!caixa) { return; }
        var antigo = caixa.querySelector(".mapa-erro, .mapa-carregando");
        if (antigo) { antigo.remove(); }
        var d = document.createElement("div");
        d.className = "mapa-erro";
        d.innerHTML = "<div style=\"font-size:2.2rem\">⚠️</div><h2>" + esc(titulo) + "</h2><p>" + esc(texto) + "</p>" +
            "<a class=\"btn btn-neutro\" target=\"_blank\" rel=\"noopener\" href=\"https://www.google.com/maps/search/?api=1&query=" +
            encodeURIComponent(D.etec.nome + ", " + D.etec.endereco) + "\">📍 Ver a ETEC no Google Maps</a>";
        caixa.appendChild(d);
    }

    /* O Google chama esta função quando a chave é recusada */
    window.gm_authFailure = function () {
        mostrarErro("O Google Maps recusou a chave",
            "Verifique se a Maps JavaScript API está ativada, se o faturamento está habilitado e se a restrição de " +
            "referenciador HTTP inclui este endereço (" + location.origin + "/*).");
    };

    window.iniciarMapaGoogle = function () {
        iniciar().catch(function (err) {
            if (window.console) { console.error("Mapa:", err); }
            mostrarErro("Não foi possível montar o mapa", "Recarregue a página. Se persistir, confira a chave da API.");
        });
    };

    var script = document.createElement("script");
    script.async = true;
    script.src = "https://maps.googleapis.com/maps/api/js?key=" + encodeURIComponent(D.chave) +
        "&v=weekly&loading=async&language=pt-BR&region=BR&callback=iniciarMapaGoogle";
    script.onerror = function () {
        mostrarErro("Sem conexão com o Google Maps", "Não foi possível carregar o Google Maps. Verifique sua internet e tente novamente.");
    };
    document.head.appendChild(script);

    /* =========================== Montagem ============================== */
    async function iniciar() {
        var libMapas = await google.maps.importLibrary("maps");
        var libMarcador = await google.maps.importLibrary("marker");

        var carregando = caixa.querySelector(".mapa-carregando");
        if (carregando) { carregando.remove(); }

        mapa = new libMapas.Map(elMapa, {
            center: { lat: 15, lng: 0 },
            zoom: 2,
            minZoom: 2,
            mapId: D.mapId || "DEMO_MAP_ID",
            gestureHandling: "greedy",
            streetViewControl: false,
            fullscreenControl: true,
            mapTypeControl: true,
            mapTypeControlOptions: { style: google.maps.MapTypeControlStyle.DROPDOWN_MENU },
            clickableIcons: false,
            restriction: { latLngBounds: { north: 85, south: -85, west: -180, east: 180 }, strictBounds: true }
        });
        janela = new libMapas.InfoWindow({ maxWidth: 320 });
        janela.addListener("closeclick", function () { ativo = null; marcarItemAtivo(); });
        mapa.addListener("click", function () { janela.close(); ativo = null; marcarItemAtivo(); });
        mapa.addListener("zoom_changed", function () {
            elMapa.classList.toggle("zoom-perto", mapa.getZoom() >= 4);
        });

        /* marcadores dos países */
        var pendentes = [];
        D.paises.forEach(function (p, i) {
            if (p.lat == null || p.lng == null) { pendentes.push(p); return; }
            criarMarcadorPais(libMarcador.AdvancedMarkerElement, p, i);
        });

        criarMarcadorEtec(libMarcador.AdvancedMarkerElement);
        enquadrarVisiveis();

        if (pendentes.length) { geocodificar(libMarcador.AdvancedMarkerElement, pendentes); }
    }

    function criarMarcadorPais(Marcador, p, indice) {
        var el = document.createElement("div");
        el.className = "mk-pais";
        el.style.animationDelay = (indice * 60) + "ms";
        el.title = p.nome;
        el.innerHTML = (p.iso
            ? "<img src=\"https://flagcdn.com/w80/" + esc(p.iso) + ".png\" alt=\"\" width=\"32\" height=\"32\">"
            : "<span class=\"mk-emoji\">🚩</span>") +
            "<span class=\"mk-nome\">" + esc(p.nome) + "</span>";

        var m = new Marcador({
            map: mapa,
            position: { lat: p.lat, lng: p.lng },
            content: el,
            title: p.nome,
            zIndex: 10
        });
        m.addListener("gmp-click", function () { selecionarPais(p.id, false); });
        marcadores[p.id] = m;
    }

    function criarMarcadorEtec(Marcador) {
        var el = document.createElement("div");
        el.className = "mk-etec";
        el.title = D.etec.apelido;
        el.innerHTML =
            "<span class=\"mk-etec-pulso\"></span>" +
            "<div class=\"mk-etec-pino\"><svg viewBox=\"0 0 24 24\" aria-hidden=\"true\">" +
            "<path d=\"M21.42 10.922a1 1 0 0 0-.019-1.838L12.83 5.18a2 2 0 0 0-1.66 0L2.6 9.08a1 1 0 0 0 0 1.832l8.57 3.908a2 2 0 0 0 1.66 0z\"/>" +
            "<path d=\"M22 10v6\"/><path d=\"M6 12.5V16a6 3 0 0 0 12 0v-3.5\"/></svg></div>" +
            "<span class=\"mk-etec-rotulo\">ETEC</span>";

        etecMarcador = new Marcador({
            map: mapa,
            position: { lat: D.etec.lat, lng: D.etec.lng },
            content: el,
            title: D.etec.apelido,
            zIndex: 1000
        });
        etecMarcador.addListener("gmp-click", function () { irParaEtec(); });
    }

    /* ====================== Câmera e balões ============================ */
    function enquadrarVisiveis() {
        if (!mapa) { return; }
        var limites = new google.maps.LatLngBounds();
        var n = 0;
        Object.keys(marcadores).forEach(function (id) {
            var m = marcadores[id];
            if (m.map) { limites.extend(m.position); n++; }
        });
        if (n === 0) { mapa.moveCamera({ center: { lat: 15, lng: 0 }, zoom: 2 }); return; }
        if (n === 1) {
            mapa.moveCamera({ center: limites.getCenter(), zoom: 4 });
            return;
        }
        mapa.fitBounds(limites, { top: 70, right: 60, bottom: 70, left: 60 });
        google.maps.event.addListenerOnce(mapa, "idle", function () {
            if (mapa.getZoom() > 5) { mapa.setZoom(5); }
        });
    }

    function selecionarPais(id, vindoDaLista) {
        var p = paisesPorId[id];
        if (!p) { return; }
        ativo = { tipo: "pais", id: id };
        marcarItemAtivo();
        if (!mapa) { return; }
        var m = marcadores[id];
        if (!m) {
            mostrarToast("“" + p.nome + "” ainda não tem localização no mapa.");
            return;
        }
        if (!m.map) { m.map = mapa; }
        mapa.panTo(m.position);
        if (mapa.getZoom() < 4) { mapa.setZoom(4); }
        janela.setContent(htmlPais(p));
        janela.open({ map: mapa, anchor: m });
        if (vindoDaLista && window.matchMedia("(max-width: 920px)").matches) {
            caixa.scrollIntoView({ behavior: "smooth", block: "start" });
        }
    }

    function irParaEtec() {
        ativo = { tipo: "etec" };
        marcarItemAtivo();
        if (!mapa || !etecMarcador) { return; }
        mapa.moveCamera({ center: { lat: D.etec.lat, lng: D.etec.lng }, zoom: 16 });
        janela.setContent(htmlEtec());
        janela.open({ map: mapa, anchor: etecMarcador });
        if (window.matchMedia("(max-width: 920px)").matches) {
            caixa.scrollIntoView({ behavior: "smooth", block: "start" });
        }
    }

    function linha(rotulo, valor) {
        return valor ? "<dt>" + esc(rotulo) + "</dt><dd>" + esc(valor) + "</dd>" : "";
    }

    function htmlPais(p) {
        var bandeira = p.iso
            ? "<img src=\"https://flagcdn.com/w80/" + esc(p.iso) + ".png\" alt=\"\">"
            : "<span class=\"iw-emoji\">🚩</span>";
        var cidades = p.topCidades && p.topCidades.length
            ? "<p class=\"iw-cidades\">🏙️ " + p.topCidades.map(esc).join(" · ") +
              (p.cidades > p.topCidades.length ? " e mais " + (p.cidades - p.topCidades.length) : "") + "</p>"
            : "<p class=\"iw-cidades\">Nenhuma cidade cadastrada.</p>";
        return "<div class=\"iw\">" +
            "<div class=\"iw-topo\">" + bandeira + "<div><h3>" + esc(p.nome) + "</h3>" +
            "<span class=\"iw-sub\">🗺️ " + esc(p.continente) + "</span></div></div>" +
            "<dl class=\"iw-grade\">" +
            linha("População", p.populacao + " hab.") + linha("Área", p.area + " km²") +
            linha("Idioma", p.idioma) + linha("Moeda", p.moeda) + linha("Regime", p.regime) +
            linha("Governante", p.governante) + linha("Cidades", String(p.cidades)) +
            "</dl>" + cidades +
            "<div class=\"iw-acoes\">" +
            "<a class=\"btn btn-primario\" href=\"" + esc(BASE) + "/backend/paises/index.php?destaque=" + p.id + "\">Ver no cadastro</a>" +
            "<a class=\"btn btn-neutro\" href=\"" + esc(BASE) + "/backend/paises/form.php?id=" + p.id + "\">✏️ Editar</a>" +
            "</div></div>";
    }

    function htmlEtec() {
        var e = D.etec;
        var destino = encodeURIComponent(e.nome + ", " + e.endereco);
        return "<div class=\"iw iw-etec\">" +
            "<div class=\"iw-topo\"><span class=\"iw-emoji\">🎓</span><div><h3>" + esc(e.apelido) + "</h3>" +
            "<span class=\"iw-sub\">Nossa escola</span></div></div>" +
            "<p class=\"iw-endereco\"><strong>" + esc(e.nome) + "</strong><span>" + esc(e.endereco) + "</span>" +
            "<span>📞 " + esc(e.telefone) + "</span></p>" +
            "<div class=\"iw-acoes\">" +
            "<a class=\"btn btn-primario\" target=\"_blank\" rel=\"noopener\" href=\"https://www.google.com/maps/dir/?api=1&destination=" + destino + "\">🧭 Como chegar</a>" +
            "<a class=\"btn btn-neutro\" target=\"_blank\" rel=\"noopener\" href=\"" + esc(e.site) + "\">Site da escola</a>" +
            "</div></div>";
    }

    /* ===== Países fora da tabela interna: Geocoding API + cache local ===== */
    function lerCache() {
        try { return JSON.parse(localStorage.getItem("crud_mundo_geo") || "{}"); } catch (e) { return {}; }
    }
    function gravarCache(c) {
        try { localStorage.setItem("crud_mundo_geo", JSON.stringify(c)); } catch (e) { /* sem espaço/privado */ }
    }
    function pausa(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }

    async function geocodificar(Marcador, pendentes) {
        var cache = lerCache();
        var libGeo = await google.maps.importLibrary("geocoding");
        var geo = new libGeo.Geocoder();
        var mudou = false;

        for (var i = 0; i < pendentes.length; i++) {
            var p = pendentes[i];
            var pos = cache[p.nome];
            if (!pos) {
                try {
                    var r = await geo.geocode({ address: p.nome });
                    var res = r.results && r.results[0];
                    if (res) {
                        pos = { lat: res.geometry.location.lat(), lng: res.geometry.location.lng() };
                        cache[p.nome] = pos; mudou = true;
                    }
                } catch (err) { /* país não encontrado ou API desativada */ }
                await pausa(250);
            }
            if (pos) {
                p.lat = pos.lat; p.lng = pos.lng;
                criarMarcadorPais(Marcador, p, i);
            }
        }
        if (mudou) { gravarCache(cache); }
        aplicarFiltros();
    }

    /* ===================== Aviso rápido (toast) ======================== */
    function mostrarToast(msg) {
        var t = document.createElement("div");
        t.className = "alerta alerta-info";
        t.style.cssText = "position:absolute;left:50%;top:12px;transform:translateX(-50%);z-index:6;max-width:90%";
        t.innerHTML = "<span>" + esc(msg) + "</span>";
        caixa.appendChild(t);
        setTimeout(function () { t.remove(); }, 3500);
    }
})();
