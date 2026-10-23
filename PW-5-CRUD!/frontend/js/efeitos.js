/**
 * CRUD Mundo · efeitos visuais (JavaScript puro)
 *  - barra de progresso da rolagem + topo que "encolhe" ao rolar
 *  - itens que aparecem suavemente ao rolar (com atraso escalonado)
 *  - contagem animada nos números do painel
 *  - brilho que segue o mouse e leve inclinação 3D nos cartões
 *  - onda (ripple) nos botões
 *  - pulso nos números que se atualizam sozinhos (aba API Países)
 *  - botão "voltar ao topo", menu mobile que fecha sozinho e transição entre páginas
 * Tudo respeita "prefers-reduced-motion" e nunca esconde conteúdo se o JS falhar.
 */
(function () {
    "use strict";

    var d = document;
    var root = d.documentElement;
    var reduzir = !!(window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches);

    function pronto(fn) {
        if (d.readyState === "loading") { d.addEventListener("DOMContentLoaded", fn); } else { fn(); }
    }

    /* ===== 1. rolagem: progresso, topo compacto, voltar ao topo ===== */
    function rolagem() {
        var topo = d.querySelector(".topo");
        var barra = d.createElement("div");
        barra.id = "progresso-rolagem";
        barra.setAttribute("aria-hidden", "true");
        d.body.appendChild(barra);

        var btn = d.createElement("button");
        btn.id = "voltar-topo";
        btn.type = "button";
        btn.setAttribute("aria-label", "Voltar ao topo");
        btn.textContent = "↑";
        btn.addEventListener("click", function () {
            window.scrollTo({ top: 0, behavior: reduzir ? "auto" : "smooth" });
        });
        d.body.appendChild(btn);

        var agendado = false;
        function atualizar() {
            agendado = false;
            var y = window.pageYOffset || root.scrollTop;
            var max = root.scrollHeight - window.innerHeight;
            barra.style.transform = "scaleX(" + (max > 0 ? Math.min(1, y / max) : 0) + ")";
            if (topo) { topo.classList.toggle("topo-rolou", y > 12); }
            btn.classList.toggle("visivel", y > 420);
        }
        window.addEventListener("scroll", function () {
            if (!agendado) { agendado = true; window.requestAnimationFrame(atualizar); }
        }, { passive: true });
        window.addEventListener("resize", atualizar);
        atualizar();
    }

    /* ===== 2. menu mobile: fecha ao clicar fora, no link ou com Esc ===== */
    function menuMobile() {
        var btn = d.querySelector(".nav-btn");
        var nav = d.querySelector(".topo nav");
        if (!btn || !nav) { return; }
        function fechar() { if (nav.classList.contains("aberta")) { btn.click(); } }
        d.addEventListener("click", function (ev) {
            if (!nav.classList.contains("aberta")) { return; }
            if (ev.target.closest(".topo nav a") || !ev.target.closest(".topo-interno")) { fechar(); }
        });
        d.addEventListener("keydown", function (ev) { if (ev.key === "Escape") { fechar(); } });
        window.addEventListener("resize", function () { if (window.innerWidth > 1180) { fechar(); } });
    }

    /* ===== 3. onda (ripple) nos botões ===== */
    function ripple() {
        d.addEventListener("click", function (ev) {
            var el = ev.target.closest && ev.target.closest(".btn, .chip-filtro, .api-aba");
            if (!el || el.disabled) { return; }
            var r = el.getBoundingClientRect();
            var tam = Math.max(r.width, r.height) * 2;
            var o = d.createElement("span");
            o.className = "ripple";
            o.style.width = o.style.height = tam + "px";
            o.style.left = (ev.clientX - r.left - tam / 2) + "px";
            o.style.top = (ev.clientY - r.top - tam / 2) + "px";
            el.appendChild(o);
            setTimeout(function () { o.remove(); }, 650);
        });
    }

    /* ===== 4. aparecer ao rolar ===== */
    var SEL_REVELAR = ".hero, .estat, .atalho, .cartao:not(.mapa-caixa), .pais-card, .resumo-card, .res-bloco, .tabela tbody tr";

    function revelar() {
        if (!("IntersectionObserver" in window)) { return; }
        var obs = new IntersectionObserver(function (entradas) {
            var ordem = 0;
            entradas.forEach(function (e) {
                if (!e.isIntersecting) { return; }
                var el = e.target;
                obs.unobserve(el);
                el.style.setProperty("--rv-atraso", Math.min(ordem * 50, 400) + "ms");
                ordem++;
                // dois quadros: garante que o estado inicial (oculto) foi pintado antes de animar
                window.requestAnimationFrame(function () {
                    window.requestAnimationFrame(function () { el.classList.add("rv-in"); });
                });
                // depois da animação devolve o controle ao CSS normal (hover etc.)
                setTimeout(function () {
                    el.classList.remove("rv", "rv-in");
                    el.style.removeProperty("--rv-atraso");
                }, 1100);
            });
        }, { threshold: 0.08, rootMargin: "0px 0px -4% 0px" });

        function preparar(el) {
            if (el.classList.contains("rv") || el.closest(".mapa-caixa, dialog, .modal")) { return; }
            el.classList.add("rv");
            obs.observe(el);
        }
        function varrer(no) {
            if (no.nodeType !== 1) { return; }
            if (no.matches(SEL_REVELAR)) { preparar(no); }
            no.querySelectorAll && no.querySelectorAll(SEL_REVELAR).forEach(preparar);
        }

        root.classList.add("js-efeitos");
        varrer(d.body);
        // conteúdo criado depois (listas e resultados da aba API Países)
        new MutationObserver(function (muts) {
            muts.forEach(function (m) { m.addedNodes.forEach(varrer); });
        }).observe(d.body, { childList: true, subtree: true });
    }

    /* ===== 5. contagem animada (números do painel) ===== */
    function contar() {
        var nums = d.querySelectorAll(".estat .numero");
        if (!nums.length || !("IntersectionObserver" in window)) { return; }
        var obs = new IntersectionObserver(function (entradas) {
            entradas.forEach(function (e) {
                if (!e.isIntersecting) { return; }
                var el = e.target;
                obs.unobserve(el);
                var alvo = parseInt(el.dataset.alvo, 10);
                var ini = null;
                var dur = 900;
                function passo(t) {
                    if (ini === null) { ini = t; }
                    var p = Math.min(1, (t - ini) / dur);
                    var suave = 1 - Math.pow(1 - p, 3);
                    el.textContent = String(Math.round(alvo * suave));
                    if (p < 1) { window.requestAnimationFrame(passo); }
                }
                window.requestAnimationFrame(passo);
            });
        }, { threshold: 0.4 });
        nums.forEach(function (el) {
            var txt = el.textContent.trim();
            if (!/^\d+$/.test(txt)) { return; }
            el.dataset.alvo = txt;
            el.setAttribute("aria-label", txt);
            el.textContent = "0";
            obs.observe(el);
        });
    }

    /* ===== 6. brilho que segue o mouse + inclinação 3D ===== */
    function brilhoEInclinacao() {
        if (!window.matchMedia("(hover: hover) and (pointer: fine)").matches) { return; }
        var SEL = ".estat, .atalho, .pais-card, .resumo-card, .etec-card";
        var quadro = null;

        d.addEventListener("pointermove", function (ev) {
            var el = ev.target.closest && ev.target.closest(SEL);
            if (!el || quadro) { return; }
            var x = ev.clientX, y = ev.clientY;
            quadro = window.requestAnimationFrame(function () {
                quadro = null;
                var r = el.getBoundingClientRect();
                var px = x - r.left, py = y - r.top;
                el.style.setProperty("--mx", px + "px");
                el.style.setProperty("--my", py + "px");
                if (el.matches(".pais-card, .estat, .atalho")) {
                    el.style.setProperty("--ry", ((px / r.width) - 0.5) * 7 + "deg");
                    el.style.setProperty("--rx", ((py / r.height) - 0.5) * -7 + "deg");
                }
            });
        }, { passive: true });

        d.addEventListener("pointerout", function (ev) {
            var el = ev.target.closest && ev.target.closest(SEL);
            if (!el || (ev.relatedTarget && el.contains(ev.relatedTarget))) { return; }
            el.style.setProperty("--rx", "0deg");
            el.style.setProperty("--ry", "0deg");
        });
    }

    /* ===== 7. pulso quando um número se atualiza sozinho ===== */
    function pulsos() {
        var alvos = d.querySelectorAll(".resumo-num, .api-chip b");
        if (!alvos.length) { return; }
        var mo = new MutationObserver(function (muts) {
            muts.forEach(function (m) {
                var el = m.target.nodeType === 1 ? m.target : m.target.parentElement;
                if (!el) { return; }
                el.classList.remove("pulso");
                void el.offsetWidth; // reinicia a animação
                el.classList.add("pulso");
            });
        });
        alvos.forEach(function (el) { mo.observe(el, { childList: true, characterData: true, subtree: true }); });
    }

    /* ===== 8. transição suave ao trocar de página ===== */
    function transicaoPagina() {
        d.addEventListener("click", function (ev) {
            if (ev.defaultPrevented || ev.button !== 0 || ev.metaKey || ev.ctrlKey || ev.shiftKey || ev.altKey) { return; }
            var a = ev.target.closest && ev.target.closest("a[href]");
            if (!a || a.target === "_blank" || a.hasAttribute("download")) { return; }
            var url;
            try { url = new URL(a.href, location.href); } catch (e) { return; }
            if (url.origin !== location.origin || !/^https?:$/.test(url.protocol)) { return; }
            if (url.pathname === location.pathname && url.search === location.search) { return; }
            ev.preventDefault();
            root.classList.add("saindo");
            setTimeout(function () { location.href = url.href; }, 150);
        });
        // voltar pelo histórico (cache do navegador) não pode deixar a página invisível
        window.addEventListener("pageshow", function () { root.classList.remove("saindo"); });
    }

    /* ===== início ===== */
    pronto(function () {
        rolagem();
        menuMobile();
        ripple();
        if (reduzir) { return; }
        contar();
        revelar();
        brilhoEInclinacao();
        pulsos();
        transicaoPagina();
    });
})();
