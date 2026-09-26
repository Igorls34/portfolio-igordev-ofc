/* Camada de coleta: DOM, listeners e observers.
 *
 * Este arquivo e o unico que toca no DOM para fins de analytics. Ele nao sabe
 * nada de onde o dado vai: entrega para o GA4, para a fila first-party e para o
 * Clarity, e cada um desses caminhos e opcional e independente.
 *
 * Regra que atravessa o arquivo inteiro: se qualquer parte falhar, o site
 * continua funcionando. Toda inicializacao vai por try/catch e nada aqui
 * pode lancar para a pagina. O motivo e concreto -- analytics e a parte do
 * site que mais quebra por culpa de terceiros (tag do GA muda o contrato,
 * adblocker bloqueia, API do navegador some), e o preco de uma excecao
 *.escapeada e a pagina em branco.
 *
 * Nao ha import/export: o projeto nao tem build, entao os scripts sao
 * classicos e se encontram por variavel global.
 *   analytics-core.js  ->  AnalyticsCore   (logica pura, tem testes)
 *   analytics.js       ->  IgorAnalytics   (este arquivo)
 */
(function (root) {
    'use strict';

    const Core = root.AnalyticsCore;
    const GA_ID = 'G-0EDZHK8SL8';
    const CLARITY_ID = 'w32g841pzr';
    const BEACON_URL = '/api/collect';
    const FORM_URL = '/api/form';

    const storage = (function () {
        try {
            const s = root.localStorage;
            /* Safari privado entrega um localStorage que funciona na leitura e
             * lanca na escrita. Escrever e o teste honesto. */
            s.setItem('__t', '1');
            s.removeItem('__t');
            return s;
        } catch (err) {
            return null;
        }
    }());

    const state = {
        sid: Core.randomId(),
        vid: null,
        startedAt: Date.now(),
        hiddenAt: null,
        activeMs: 0,
        maxScroll: 0,
        sectionEnteredAt: {},
        sectionSeen: {},
        formStartedAt: null,
        formTracked: false,
        queue: [],
        gaReady: false
    };

    /* ---------- envios ---------- */

    function gtag() {
        root.dataLayer = root.dataLayer || [];
        root.dataLayer.push(arguments);
    }

    function isGranted() {
        return Core.shouldLoadAnalytics(Core.getConsent(storage));
    }

    /* O GA so recebe evento depois do Consent Mode resolver. Antes disso, o
     * evento fica so na fila first-party (que tambem espera o consentimento). */
    function toGa(name, params) {
        if (!state.gaReady) return;
        try {
            const ev = Core.buildEvent(name, params);
            gtag('event', ev.name, ev.params);
        } catch (err) { /* um evento ruim nao pode derrubar os outros */ }
    }

    function toFirstParty(name, params) {
        state.queue.push({
            t: Date.now(),
            sid: state.sid,
            vid: state.vid,
            e: name,
            p: Core.flattenParams(params || {})
        });
        scheduleFlush();
    }

    /* Consent Mode: o GA carrega na hora mas com tudo "denied". E ele que
     * manda ping sem cookie, dando cobertura de trafego que recusou. O
     * first-party so fala depois do aceite, porque quem manda nele somos nos,
     * e ai a escolha e nossa. */
    function dispatch(name, params) {
        /* O page_view do GA vem do config dele proprio, com a URL sem query
         * para nao vazar dado de campanha para o Google. Aqui so o
         * first-party, que e quem guarda historico. */
        if (name !== 'page_view') toGa(name, params);
        if (isGranted()) toFirstParty(name, params);
    }

    let flushTimer = null;

    function scheduleFlush() {
        if (!state.queue.length) return;
        if (flushTimer) return;
        /* Agrupa eventos curtos num envio so. Um beacon por evento estouraria
         * a taxa de upload do mobile. */
        flushTimer = root.setTimeout(function () { flush(false); }, 1500);
    }

    function flush(useBeacon) {
        if (flushTimer) { root.clearTimeout(flushTimer); flushTimer = null; }
        if (!state.queue.length) return;
        if (!isGranted()) { state.queue.length = 0; return; }

        const body = JSON.stringify({
            page: Core.stripToPath(root.location && root.location.href),
            ref: Core.classifyReferrer(
                (root.document && root.document.referrer) || '',
                root.location && root.location.host
            ),
            visitor: state.vid ? {
                id: state.vid.id,
                firstSeenAt: state.vid.firstSeenAt,
                visits: state.vid.visits,
                daysSinceFirst: Core.daysSince(state.vid.firstSeenAt)
            } : null,
            events: state.queue.splice(0, state.queue.length)
        });

        try {
            const blob = new root.Blob([body], { type: 'application/json' });
            if (useBeacon && root.navigator && root.navigator.sendBeacon) {
                if (root.navigator.sendBeacon(BEACON_URL, blob)) return;
            }
        } catch (err) { /* sem Blob: usa fetch */ }

        if (!root.fetch) return;
        try {
            root.fetch(BEACON_URL, {
                method: 'POST',
                body: body,
                headers: { 'Content-Type': 'application/json' },
                keepalive: true
            }).catch(function () {
                /* Perdeu este lote. Nao e catastrofico: a proxima pagina
                 * manda o contexto de novo. */
            });
        } catch (err) { /* offline, CORS, qualquer coisa: segue o site */ }
    }

    /* ---------- contexto do visitante ---------- */

    function deviceSnapshot() {
        const nav = root.navigator || {};
        const scr = root.screen || {};
        const conn = nav.connection || nav.mozConnection || nav.webkitConnection || {};
        const snap = {
            lang: nav.language,
            langs: (nav.languages || []).slice(0, 3).join(','),
            tz: Core.sanitizeValue(root.Intl && root.Intl.DateTimeFormat
                ? root.Intl.DateTimeFormat().resolvedOptions().timeZone : ''),
            ua: (nav.userAgent || '').slice(0, 120),
            screen: scr.width + 'x' + scr.height,
            dpr: root.devicePixelRatio,
            touch: nav.maxTouchPoints || 0,
            cores: nav.hardwareConcurrency,
            mem: nav.deviceMemory,
            effType: conn.effectiveType,
            saveData: !!conn.saveData,
            online: nav.onLine
        };
        if (nav.userAgentData) {
            const uad = nav.userAgentData;
            snap.platform = uad.platform;
            snap.mobile = !!uad.mobile;
            const brands = (uad.brands || []).map(function (b) { return b.brand; });
            snap.brands = brands.join(',');
        }
        return snap;
    }

    function sendContext() {
        if (Core.isBotUserAgent((root.navigator || {}).userAgent)) return;
        const attribution = Core.parseAttribution(
            (root.location && root.location.search) || ''
        );
        dispatch('context', Object.assign(deviceSnapshot(), attribution, {
            path: Core.stripToPath(root.location && root.location.href),
            ref: Core.classifyReferrer(
                (root.document && root.document.referrer) || '',
                root.location && root.location.host
            ),
            w: root.innerWidth,
            h: root.innerHeight
        }));
    }

    /* ---------- rolagem e secao ---------- */

    function initScroll() {
        if (typeof root.IntersectionObserver !== 'function') return;
        const tracker = Core.newScrollTracker();
        let ticking = false;

        const onScroll = function () {
            if (ticking) return;
            ticking = true;
            /* O evento de scroll dispara antes do paint. Medir aqui daria a
             * altura da pagina anterior. */
            root.requestAnimationFrame(function () {
                ticking = false;
                const doc = root.document.documentElement;
                const total = doc.scrollHeight - root.innerHeight;
                if (total <= 0) return;
                const pct = Math.round(((root.scrollY || doc.scrollTop) / total) * 100);
                if (pct > state.maxScroll) state.maxScroll = pct;
                tracker.check(pct).forEach(function (mark) {
                    dispatch('scroll_depth', { depth: mark });
                });
            });
        };

        /* Sentinela no fim da pagina: e o unico jeito confiavel de saber que a
         * pessoa chegou a 100%. Deducao por scrollY tem razao de erro. */
        if (root.IntersectionObserver) {
            const sentinel = root.document.createElement('div');
            sentinel.setAttribute('aria-hidden', 'true');
            sentinel.style.cssText = 'position:absolute;bottom:0;height:1px;width:1px;';
            root.document.body.appendChild(sentinel);
            new root.IntersectionObserver(function (entries) {
                entries.forEach(function (e) {
                    if (e.isIntersecting) dispatch('scroll_depth', { depth: 100, at_bottom: true });
                });
            }, { rootMargin: '0px' }).observe(sentinel);
        }

        root.addEventListener('scroll', onScroll, { passive: true });
        root.addEventListener('pagehide', function () {
            dispatch('engagement', {
                active_ms: state.activeMs,
                max_scroll: state.maxScroll,
                elapsed_ms: Core.clampDelta(Date.now() - state.startedAt)
            });
            flush(true);
        });
    }

    function initSections() {
        if (typeof root.IntersectionObserver !== 'function') return;
        const sections = root.document.querySelectorAll('section[id], main section, footer');
        if (!sections.length) return;

        const observer = new root.IntersectionObserver(function (entries) {
            entries.forEach(function (entry) {
                const id = entry.target.id || entry.target.className || 'desconhecida';
                if (entry.isIntersecting) {
                    state.sectionEnteredAt[id] = Date.now();
                    /* Com threshold em [0.25, 0.6] o observer dispara varias
                     * vezes conforme a secao cresce na tela. Sem esta guarda,
                     * "Projetos" contaria 5 impressoes numa visita so. */
                    if (!state.sectionSeen[id]) {
                        state.sectionSeen[id] = true;
                        dispatch('section_view', { section: Core.sanitizeValue(id) });
                    }
                } else {
                    const since = state.sectionEnteredAt[id];
                    if (!since) return;
                    delete state.sectionEnteredAt[id];
                    dispatch('section_dwell', {
                        section: Core.sanitizeValue(id),
                        seconds: Math.round((Date.now() - since) / 100) / 10
                    });
                }
            });
        }, { threshold: [0.25, 0.6] });

        Array.prototype.forEach.call(sections, function (s) { observer.observe(s); });
    }

    /* ---------- tempo ativo ---------- */

    function initEngagement() {
        const mark = function () {
            const now = Date.now();
            /* Contar tempo com a aba em background inflaria a metrica: a
             * pessoa foi embora e o numero continuaria subindo. */
            if (state.hiddenAt) state.activeMs += now - state.hiddenAt;
            state.hiddenAt = now;
        };
        root.document.addEventListener('visibilitychange', mark);
        root.addEventListener('pagehide', mark);
    }

    /* ---------- cliques ---------- */

    function classifyLink(el) {
        const track = el.closest ? el.closest('[data-track]') : null;
        const href = el.getAttribute('href') || '';
        if (track) return { kind: track.getAttribute('data-track-kind') || 'cta', id: track.getAttribute('data-track') };
        if (!href || href.charAt(0) === '#') return { kind: 'internal', id: href };
        const host = Core.hostOf(href);
        const self = root.location && root.location.host;
        if (host && self && host === self) return { kind: 'internal', id: Core.stripToPath(href) };
        return { kind: 'outbound', id: host || href.slice(0, 60) };
    }

    function initClicks() {
        root.document.addEventListener('click', function (e) {
            const el = e.target;
            if (!el || !el.closest) return;
            const link = el.closest('a, button');
            if (!link) return;
            const info = classifyLink(link);
            const label = Core.sanitizeValue(
                (link.getAttribute('aria-label') || link.textContent || '').replace(/\s+/g, ' ').trim()
            );
            dispatch('cta_click', {
                kind: info.kind,
                id: info.id,
                label: label,
                href_host: Core.hostOf(link.getAttribute('href') || '')
            });
        }, true);

        /* Copiar e um sinal forte num portfolio: copiar e-mail e codigo indica
         * interesse concreto, e nao aparece em nenhum heatmap. */
        root.document.addEventListener('copy', function () {
            dispatch('copy', { path: Core.stripToPath(root.location && root.location.href) });
        });
    }

    /* ---------- funil do formulario ---------- */

    function initForm() {
        const form = root.document.getElementById('contact-form');
        if (!form) return;

        const start = function () {
            if (state.formStartedAt) return;
            state.formStartedAt = Date.now();
            dispatch('form_start', { path: Core.stripToPath(root.location && root.location.href) });
        };

        form.addEventListener('focusin', function (e) {
            const field = e.target && e.target.name;
            if (!field || field === 'website') return;
            start();
            /* O tempo ate o primeiro campo e o que separa "vei o form e
             * largou" de "vei com intencao". */
            dispatch('form_field_focus', {
                field: field,
                step: Core.funnelStepOf(field),
                since_start_ms: state.formStartedAt
                    ? Core.clampDelta(Date.now() - state.formStartedAt) : null
            });
        });

        form.addEventListener('input', function (e) {
            const el = e.target;
            if (!el || !el.name || el.name === 'website') return;
            const filled = String(el.value || '').trim().length > 0;
            const last = el.dataset.trackedFilled;
            if (filled && last !== '1') {
                el.dataset.trackedFilled = '1';
                dispatch('form_field_filled', { field: el.name, step: Core.funnelStepOf(el.name) });
            } else if (!filled && last === '1') {
                el.dataset.trackedFilled = '0';
            }
        });

        /* Validador nativo, ligado antes do handler do site para poder contar
         * o erro e ainda deixar o browser exibir a mensagem. */
        form.addEventListener('invalid', function (e) {
            const field = e.target && e.target.name;
            if (!field || field === 'website') return;
            start();
            dispatch('form_field_error', {
                field: field,
                step: Core.funnelStepOf(field),
                reason: e.target.validity && e.target.validity.valueMissing ? 'vazio' : 'invalido'
            });
        }, true);

        form.addEventListener('submit', function () {
            const elapsed = state.formStartedAt
                ? Core.clampDelta(Date.now() - state.formStartedAt) : null;
            /* Nao manda o conteudo: so o forma e o tempo. O texto digitado e
             * dado de terceiro e nao tem analise que justifique storing. */
            dispatch('form_submit_attempt', {
                elapsed_ms: elapsed,
                filled: Core.FORM_FIELDS.map(function (f) {
                    const el = form.elements[f];
                    return (el && String(el.value || '').trim()) ? 1 : 0;
                }).join('')
            });
        }, true);

        /* Abandono: saiu da pagina com o form preenchido e sem enviar. */
        root.addEventListener('pagehide', function () {
            if (state.formStartedAt && !state.formTracked) {
                const filled = Core.FORM_FIELDS.some(function (f) {
                    const el = form.elements[f];
                    return el && String(el.value || '').trim();
                });
                if (filled) {
                    dispatch('form_abandon', {
                        elapsed_ms: Core.clampDelta(Date.now() - state.formStartedAt)
                    });
                }
            }
            flush(true);
        });
    }

    /* dispara form_submit depois que o script.js terminou os envios */
    function reportFormResult(ok, channels) {
        state.formTracked = true;
        const elapsed = state.formStartedAt
            ? Core.clampDelta(Date.now() - state.formStartedAt) : null;
        dispatch('form_submit', {
            ok: !!ok,
            channels: channels || '',
            elapsed_ms: elapsed
        });
        /* Demais dados do envio direto vao para /api/form, que grava em
         * storage proprio. Nao manda o conteudo: so o forma e o tempo. O
         * texto digitado e dado de terceiro e nao tem analise que justifique
         * storing. */
        if (!isGranted()) return;

        try {
            const payload = JSON.stringify({
                ts: Date.now(),
                sid: state.sid,
                elapsed_ms: elapsed,
                channels: channels || '',
                attribution: Core.parseAttribution((root.location && root.location.search) || ''),
                path: Core.stripToPath(root.location && root.location.href)
            });
            root.fetch(FORM_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: payload,
                keepalive: true
            }).catch(function () { /* perda de telemetria, nunca do envio */ });
        } catch (err) { /* sem fetch, sem registro */ }
    }

    /* ---------- RUM ---------- */

    function initRum() {
        if (typeof root.PerformanceObserver !== 'function') return;
        const vitals = {};
        const safe = function (types, cb) {
            try {
                const po = new root.PerformanceObserver(function (list) {
                    try { list.getEntries().forEach(cb); } catch (err) { /* ignora */ }
                });
                po.observe({ type: types, buffered: true });
            } catch (err) { /* tipo nao suportado neste browser */ }
        };

        /* LCP so emite enquanto a pagina cresce; o ultimo e o valido. */
        safe('largest-contentful-paint', function (e) {
            vitals.lcp = Math.round(e.startTime);
        });
        /* CLS e cumulativo: o valor sozinho e proximo de zero, o que faz todo
         * dashboard mostrar "otimo" mesmo com layout saltando. */
        safe('layout-shift', function (e) {
            if (!e.hadRecentInput) vitals.cls = (vitals.cls || 0) + e.value;
        });
        safe('paint', function (e) {
            if (e.name === 'first-contentful-paint') vitals.fcp = Math.round(e.startTime);
        });
        /* INP so se mede em interacao real, entao depende de haver clique. */
        safe('event', function (e) {
            if (e.duration > 0 && (!vitals.inp || e.duration > vitals.inp)) {
                vitals.inp = Math.round(e.duration);
            }
        });

        const report = function () {
            const nav = (root.performance || {}).navigation;
            const out = {};
            if (vitals.lcp) out.lcp_ms = vitals.lcp;
            if (vitals.cls) out.cls = Math.round(vitals.cls * 1000) / 1000;
            if (vitals.inp) out.inp_ms = vitals.inp;
            if (vitals.fcp) out.fcp_ms = vitals.fcp;
            if (nav) {
                out.ttfb_ms = Math.round(nav.responseStart || 0);
                out.dom_ready_ms = Math.round(nav.domContentLoadedEventEnd || 0);
                out.transfer_bytes = nav.transferSize || 0;
            }
            if (!Object.keys(out).length) return;
            out.lcp_grade = Core.gradeVital('lcp', vitals.lcp);
            out.cls_grade = Core.gradeVital('cls', vitals.cls);
            out.inp_grade = Core.gradeVital('inp', vitals.inp);
            out.ttfb_grade = Core.gradeVital('ttfb', out.ttfb_ms);
            dispatch('vitals', out);
        };
        /* LCP e emitido por ultimo e so estabiliza depois do load, entao o
         * envio espera a pagina assentar. */
        root.addEventListener('load', function () {
            root.setTimeout(report, 0);
            root.setTimeout(report, 4000);
        });
    }

    /* ---------- consentimento ---------- */

    function applyConsent(choice) {
        gtag('consent', 'update', Core.consentUpdate(choice));
        if (!Core.shouldLoadAnalytics(choice)) {
            state.queue.length = 0;
            return;
        }
        gtag('set', 'user_properties', {
            days_since_first: Core.daysSince(state.vid && state.vid.firstSeenAt)
        });
        /* O Clarity so entra depois do aceite. Carregar antes comecaria a
         * gravar sessao de quem nao aceitou, que e o que a politica promete
         * que nao acontece. */
        if (root.clarity) {
            maskFormForClarity();
        } else {
            const clarity = root.document.createElement('script');
            clarity.async = true;
            clarity.id = 'clarity-tag';
            clarity.src = 'https://www.clarity.ms/tag/' + CLARITY_ID;
            clarity.addEventListener('load', maskFormForClarity);
            root.document.head.appendChild(clarity);
        }
        maskFormForClarity();
    }

    /* O Clarity tem por padrao mascar texto digitado, mas a garantia de que
     * nao grava o formulario depende da configuracao. Marcar a regiao como
     * sensivel e o que transforma a promessa da politica em fato tecnico.
     * A assinatura da API mudou entre versoes, entao qualquer erro aqui e
     * engolido: e uma melhoria, nunca um risco novo. */
    function maskFormForClarity() {
        if (!root.clarity) return;
        const attempts = [
            ['set', 'sensitive', ['#contact-form']],
            ['set', 'sensitive', '#contact-form']
        ];
        attempts.forEach(function (args) {
            try { root.clarity(args[0], args[1], args[2]); } catch (err) { /* tenta o proximo */ }
        });
    }

    function initConsent() {
        const banner = root.document.getElementById('consent-banner');
        const stored = Core.getConsent(storage);
        if (stored) {
            if (banner) banner.remove();
            applyConsent(stored);
            return;
        }
        if (!banner) return;
        banner.classList.add('visible');
        banner.querySelectorAll('[data-consent]').forEach(function (btn) {
            btn.addEventListener('click', function () {
                const choice = btn.getAttribute('data-consent');
                Core.setConsent(storage, choice);
                banner.remove();
                applyConsent(choice);
                if (Core.shouldLoadAnalytics(choice)) {
                    state.vid = Core.getOrCreateVisitor(storage);
                    dispatch('consent_choice', {
                        choice: choice,
                        days_since_first: Core.daysSince(state.vid && state.vid.firstSeenAt),
                        visits: (state.vid && state.vid.visits) || 1
                    });
                }
            });
        });
    }

    /* ---------- carga dos tags ---------- */

    /* Consent Mode v2 tem de rodar ANTES do config, senao o primeiro page
     * view ja sai com cookie. E o "denied" daqui que faz o GA mandar ping sem
     * nada gravado -- e por isso que recusar tambem rende dado, agregado. */
    function pushDefaultConsent() {
        gtag('consent', 'default', Core.defaultConsentState(500));
    }

    function loadGa() {
        if (state.gaReady) return;
        state.gaReady = true;
        const s = root.document.createElement('script');
        s.async = true;
        s.src = 'https://www.googletagmanager.com/gtag/js?id=' + GA_ID;
        s.addEventListener('error', function () { state.gaReady = false; });
        root.document.head.appendChild(s);
        gtag('js', new Date());
        gtag('config', GA_ID, {
            anonymize_ip: true,
            /* Sinais de ads desligados: nao ha campanha paga no portfolio, e
             * liga-los cria perfil cross-site que so aumenta exposicao. */
            allow_google_signals: false,
            allow_ad_personalization_signals: false,
            transport_type: 'beacon',
            /* page_location vai sem query string. A query carrega utm, gclid
             * e as vezes parametro de campanha; no GA4 ela vira dimensao e
             * identify, e nao ha ganho em manda-la. */
            page_location: stripQueryFromPageUrl(),
            page_path: Core.stripToPath(root.location && root.location.href)
        });
    }

    function stripQueryFromPageUrl() {
        const href = (root.location && root.location.href) || '';
        try {
            const u = new root.URL(href);
            u.search = '';
            u.hash = '';
            return u.toString();
        } catch (err) {
            return Core.stripToPath(href);
        }
    }

    /* ---------- bootstrap ---------- */

    function init() {
        const consent = Core.getConsent(storage);
        if (Core.shouldLoadAnalytics(consent)) {
            state.vid = Core.getOrCreateVisitor(storage);
        }
        /* Ordem importa: default denied, depois a tag, depois o consentimento
         * ja salvo. Inverter qualquer um destes faz o Consent Mode valer. */
        pushDefaultConsent();
        loadGa();
        initConsent();

        sendContext();
        initScroll();
        initSections();
        initEngagement();
        initClicks();
        initForm();
        initRum();

        dispatch('page_view', {
            path: Core.stripToPath(root.location && root.location.href),
            is_home: !!root.location && root.location.pathname === '/'
        });
    }

    /* Cada inicializacao isolada: uma falha nao pode impedir as outras nem
     * a pagina de pintar. */
    function safely(name, fn) {
        try {
            fn();
        } catch (err) {
            /* Nome fica no console para diagnoico, sem poluir com stack. */
            if (root.console && root.console.warn) root.console.warn('[analytics] ' + name, err);
        }
    }

    /* safely() executa a funcao; aqui o que precisamos e o contrario --
     * devolver uma versao protegida, para a API publica. Sao coisas diferentes
     * e confundir as duas deixaria todo o IgorAnalytics indefinido. */
    function guard(name, fn) {
        return function () {
            try {
                return fn.apply(null, arguments);
            } catch (err) {
                if (root.console && root.console.warn) {
                    root.console.warn('[analytics] ' + name, err);
                }
                return undefined;
            }
        };
    }

    function boot() {
        safely('init', init);
    }

    root.IgorAnalytics = {
        dispatch: guard('dispatch', dispatch),
        reportFormResult: guard('reportFormResult', reportFormResult),
        flush: guard('flush', function () { flush(false); }),
        boot: boot
    };

    if (root.document.readyState === 'loading') {
        root.document.addEventListener('DOMContentLoaded', boot);
    } else {
        boot();
    }
}(typeof self !== 'undefined' ? self : this));
