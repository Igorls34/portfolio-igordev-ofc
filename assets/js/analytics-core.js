/* Funcoes puras da camada de analytics.
 *
 * Regra do arquivo: nada aqui toca no DOM, em rede ou em API de browser.
 * O DOM fica em assets/js/analytics.js; a rede fica nas Netlify Functions.
 * Assim os testes com node --test exercitam a logica que roda no navegador,
 * em vez de testar uma reimplementacao.
 *
 * Por que existe separado do core.js: o core.js e o site (formulario, titulos,
 * animacoes). O analytics e uma concern transversal, descartavel e
 * obrigatoriamente isolado -- se ele quebrar, o site continua funcionando.
 * Um modulo a mais tambem significa que da para remover a coleta inteira
 * apagando dois arquivos e duas tags <script>, sem tocar no site.
 *
 * No browser vira global AnalyticsCore; no Node vira module.exports.
 */
(function (root, factory) {
    'use strict';
    if (typeof module === 'object' && module.exports) {
        module.exports = factory();
    } else {
        root.AnalyticsCore = factory();
    }
}(typeof self !== 'undefined' ? self : this, function () {
    'use strict';

    /* A mesma chave que o core.js usa para o banner. O teste
     * analytics-core.test.js trava que as duas nao divergem: se uma mudar e a
     * outra nao, o banner para de lembrar a resposta. */
    const CONSENT_KEY = 'igordev_consent';

    /* ==================== CONSENTIMENTO ==================== */

    /* Consent Mode v2. "denied" aqui NAO bloqueia a coleta: e o que faz o GA
     * mandar "ping" sem cookie e sem guardar identifier. E o mecanismo que da
     * cobertura de 100% do trafego sem transformar cookie em dado pessoal. */
    const CONSENT_SIGNALS = [
        'ad_storage',
        'ad_user_data',
        'ad_personalization',
        'analytics_storage',
        'functionality_storage',
        'personalization_storage',
        'security_storage'
    ];

    function getConsent(storage) {
        if (!storage) return null;
        try {
            const value = storage.getItem(CONSENT_KEY);
            return value === 'granted' || value === 'denied' ? value : null;
        } catch (err) {
            return null;
        }
    }

    function setConsent(storage, value) {
        const next = value === 'granted' ? 'granted' : 'denied';
        if (!storage) return next;
        try {
            storage.setItem(CONSENT_KEY, next);
        } catch (err) {
            /* Safari privado / storage cheio. O banner some assim mesmo: o
             * pior caso e perguntar de novo na proxima visita. */
        }
        return next;
    }

    function shouldLoadAnalytics(consent) {
        return consent === 'granted';
    }

    function defaultConsentState(waitMs) {
        const state = { wait_for_update: typeof waitMs === 'number' ? waitMs : 500 };
        CONSENT_SIGNALS.forEach(signal => { state[signal] = 'denied'; });
        return state;
    }

    function consentUpdate(choice) {
        const granted = choice === 'granted';
        const state = {};
        CONSENT_SIGNALS.forEach(signal => { state[signal] = granted ? 'granted' : 'denied'; });
        return state;
    }

    /* ==================== FORMATO DE EVENTO (GA4) ==================== */

    /* Limites reais do GA4. Acima disso o parametro e truncado ou o evento e
     * descartado, e o dado some sem aviso no dashboard. */
    const GA_MAX_VALUE_LEN = 100;
    const GA_MAX_PARAM_NAME_LEN = 40;
    const GA_MAX_PARAMS = 25;

    function sanitizeValue(value) {
        if (value === null || value === undefined) return '';
        if (typeof value === 'boolean') return value;
        if (typeof value === 'number') {
            return Number.isFinite(value) ? value : 0;
        }
        if (typeof value === 'string') return value.slice(0, GA_MAX_VALUE_LEN);
        if (Array.isArray(value)) return value.map(sanitizeValue).join(',').slice(0, GA_MAX_VALUE_LEN);
        /* Objeto aninhado: o GA4 descarta silenciosamente. Serializa para o
         * dado nao desaparecer sem ninguem perceber. */
        if (typeof value === 'object') {
            try {
                return JSON.stringify(value).slice(0, GA_MAX_VALUE_LEN);
            } catch (err) {
                return '';
            }
        }
        return String(value).slice(0, GA_MAX_VALUE_LEN);
    }

    /* Limite de profundidade. Um objeto circular -- ou um payload malicioso
     * que se referencia a si mesmo -- faria a recursao estourar a pilha e
     * derrubar a pagina. Dois niveis cobrem device.platform e afins. */
    const MAX_FLATTEN_DEPTH = 3;

    function flattenParams(params, prefix, out, depth) {
        const target = out || {};
        const base = prefix || '';
        const level = typeof depth === 'number' ? depth : 0;
        Object.keys(params || {}).forEach(key => {
            const value = params[key];
            if (value === undefined || value === null) return;
            const name = (base ? base + '_' : '') + key
                .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
                .replace(/[^a-zA-Z0-9_]/g, '_')
                .toLowerCase()
                .replace(/^_+|_+$/g, '')
                .slice(0, GA_MAX_PARAM_NAME_LEN);
            /* Acima do limite de profundidade, o objeto vira string em vez de
             * ser reexpandido. */
            const isPlainObject = value && typeof value === 'object' && !Array.isArray(value);
            if (isPlainObject && level < MAX_FLATTEN_DEPTH) {
                flattenParams(value, name, target, level + 1);
                return;
            }
            target[name] = sanitizeValue(value);
        });
        return target;
    }

    function buildEvent(name, params) {
        const flat = flattenParams(params || {});
        /* O GA4 descarta o evento inteiro acima de 25 parametros, sem aviso.
         * Cortar aqui deixa o evento chegar com os campos mais importantes, o
         * que e melhor que nao chegar. */
        const kept = {};
        Object.keys(flat).slice(0, GA_MAX_PARAMS).forEach(key => { kept[key] = flat[key]; });
        return {
            name: String(name || '').slice(0, GA_MAX_PARAM_NAME_LEN),
            params: kept
        };
    }

    /* ==================== ATRIBUICAO ==================== */

    const UTM_KEYS = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content', 'utm_id'];
    const CLICK_IDS = ['gclid', 'fbclid', 'ttclid', 'msclkid', 'twclid', 'li_fat_id'];

    /* Parser proprio em vez de URLSearchParams: nao cria dependencia de global,
     * e o comportamento fica identico entre navegador e teste. */
    function parseQuery(search) {
        const out = {};
        const raw = String(search || '').replace(/^[?#]/, '');
        if (!raw) return out;
        raw.split('&').forEach(pair => {
            if (!pair) return;
            const eq = pair.indexOf('=');
            const key = eq === -1 ? pair : pair.slice(0, eq);
            const val = eq === -1 ? '' : pair.slice(eq + 1);
            try {
                out[decodeURIComponent(key.replace(/\+/g, ' '))] =
                    decodeURIComponent(val.replace(/\+/g, ' '));
            } catch (err) {
                out[key] = val;
            }
        });
        return out;
    }

    function parseAttribution(search) {
        const q = parseQuery(search);
        const out = {};
        UTM_KEYS.forEach(key => { if (q[key]) out[key] = q[key]; });
        CLICK_IDS.forEach(key => { if (q[key]) out[key] = q[key]; });
        return out;
    }

    const SEARCH_ENGINES = {
        'google': 'google', 'bing': 'bing', 'duckduckgo': 'duckduckgo',
        'yahoo': 'yahoo', 'baidu': 'baidu', 'yandex': 'yandex',
        'ecosia': 'ecosia', 'brave': 'brave', 'startpage': 'startpage',
        'qwant': 'qwant', 'naver': 'naver', 'yep': 'yep'
    };

    const SOCIAL = {
        'linkedin.com': 'linkedin', 'www.linkedin.com': 'linkedin',
        'instagram.com': 'instagram', 'www.instagram.com': 'instagram',
        'github.com': 'github', 'www.github.com': 'github',
        'facebook.com': 'facebook', 'l.facebook.com': 'facebook',
        'l.instagram.com': 'instagram', 't.co': 'twitter', 'twitter.com': 'twitter',
        'x.com': 'twitter', 'reddit.com': 'reddit', 'wa.me': 'whatsapp'
    };

    function hostOf(url) {
        if (!url) return '';
        const match = /^[a-z][a-z0-9+.-]*:\/\/([^/?#]+)/i.exec(String(url));
        return match ? match[1].toLowerCase() : '';
    }

    /* Casa por rotulo de dominio, e nao por igualdade. "google.com.br",
     * "google.pt" e "www.google.com" sao o mesmo buscador: comparar a string
     * inteira classificaria o trafego brasileiro -- justamente o que importa
     * aqui -- como site desconhecido. */
    function hostMatches(host, key) {
        if (!host || !key) return false;
        const labels = host.replace(/^www\./, '').split('.');
        return labels.indexOf(key) !== -1;
    }

    /* Origem do acesso, normalizada. "direct" quando nao ha referrer nenhum --
     * o caso mais comum em portfolio, e o que sobe quando a gente compartilha
     * link em conversa, porque o preview nao manda referrer. */
    function classifyReferrer(referrer, selfHost) {
        const host = hostOf(referrer);
        if (!host) return { source: 'direct', medium: 'none', host: '' };
        const self = String(selfHost || '').toLowerCase();
        if (self && host === self) return { source: 'internal', medium: 'referral', host: host };
        const base = host.replace(/^www\./, '');

        const engine = Object.keys(SEARCH_ENGINES).find(k => hostMatches(base, k));
        if (engine) return { source: SEARCH_ENGINES[engine], medium: 'organic', host: host };

        const socialKey = Object.keys(SOCIAL).find(k => host === k || hostMatches(base, k));
        if (socialKey) {
            return { source: SOCIAL[socialKey], medium: 'social', host: host };
        }
        return { source: host, medium: 'referral', host: host };
    }

    function stripToPath(url) {
        const raw = String(url || '');
        const withoutHash = raw.split('#')[0];
        const path = /^[a-z][a-z0-9+.-]*:\/\/[^/]+(\/[^?]*)?/i.exec(withoutHash);
        const value = path ? path[1] : withoutHash.split('?')[0];
        return (value || '/').slice(0, GA_MAX_VALUE_LEN);
    }

    /* ==================== VISITANTE / SESSAO ==================== */

    const VISITOR_KEY = 'igordev_vid';
    const VISITOR_META_KEY = 'igordev_vmeta';

    /* Bot nao e pessoa, e polui toda media. Descartar no cliente ajuda, mas a
     * regra que vale e a do servidor:/functions/collect.js tambem filtra. */
    const BOT_RE = /(bot|crawler|spider|slurp|bingpreview|headlesschrome|lighthouse|gtmetrix|pingdom|uptime|curl|wget|python-requests|httpclient|semrush|ahrefs|mj12|dotbot|petal|bytespider|yandex|baiduspider|facebookexternalhit|slackbot|discordbot|telegrambot|whatsapp)/i;

    function isBotUserAgent(ua) {
        return BOT_RE.test(String(ua || ''));
    }

    function randomId(rand) {
        const source = typeof rand === 'function' ? rand : Math.random;
        let out = '';
        for (let i = 0; i < 32; i++) {
            out += Math.floor(source() * 16).toString(16);
        }
        return out;
    }

    /* ID first-party. Precisa de localStorage, que e bloqueado em Safari
     * privado e quando o storage esta cheio: por isso o resultado pode ser
     * null, e o chamador trata visitante anonimo sem quebrar. */
    function getOrCreateVisitor(storage, rand) {
        if (!storage) return null;
        try {
            const now = Date.now();
            const id = storage.getItem(VISITOR_KEY) || randomId(rand);
            const rawMeta = storage.getItem(VISITOR_META_KEY);
            let meta = null;
            try { meta = rawMeta ? JSON.parse(rawMeta) : null; } catch (err) { meta = null; }
            const isNew = !meta;
            /* Incrementa ANTES de gravar. Gravar o valor antigo e o bug
             * classico: a segunda visita leria 0 de novo e o contador ficaria
             * parado em 1 para sempre. */
            const visits = ((meta && meta.visits) || 0) + 1;
            const record = {
                id: id,
                firstSeenAt: (meta && meta.firstSeenAt) || now,
                lastSeenAt: now,
                visits: visits
            };
            storage.setItem(VISITOR_KEY, id);
            storage.setItem(VISITOR_META_KEY, JSON.stringify(record));
            return {
                id: id,
                firstSeenAt: record.firstSeenAt,
                lastSeenAt: now,
                visits: visits,
                isNewVisit: isNew
            };
        } catch (err) {
            return null;
        }
    }

    function daysSince(firstSeenAt, nowMs) {
        if (!firstSeenAt) return null;
        const ms = (typeof nowMs === 'number' ? nowMs : Date.now()) - firstSeenAt;
        if (ms < 0) return 0;
        return Math.floor(ms / 86400000);
    }

    /* ==================== ROLAGEM ==================== */

    const SCROLL_THRESHOLDS = [25, 50, 75, 90, 100];

    /* Marcador de quais faixas ja dispararam. Sem isso, um unico scroll longo
     * dispararia eventos a cada frame. */
    function newScrollTracker(thresholds) {
        const marks = thresholds || SCROLL_THRESHOLDS;
        const fired = {};
        return {
            thresholds: marks.slice(),
            check(pct) {
                const value = typeof pct === 'number' && Number.isFinite(pct) ? pct : 0;
                const newly = [];
                marks.forEach(mark => {
                    if (value >= mark && !fired[mark]) {
                        fired[mark] = true;
                        newly.push(mark);
                    }
                });
                return newly;
            },
            highest() {
                return marks.filter(mark => fired[mark]).pop() || 0;
            }
        };
    }

    /* ==================== TEMPO ==================== */

    function clampDelta(ms) {
        const value = typeof ms === 'number' && Number.isFinite(ms) ? ms : 0;
        return Math.max(0, Math.min(Math.round(value), 86400000));
    }

    /* ==================== VITALS (RUM) ==================== */

    /* Faixas do "web.dev" / Core Web Vitals. O nome do estagio e o que permite
     * comparar o deploy de hoje com o de ontem. */
    const VITAL_THRESHOLDS = {
        lcp: { good: 2500, poor: 4000 },
        inp: { good: 200, poor: 500 },
        cls: { good: 0.1, poor: 0.25 },
        ttfb: { good: 800, poor: 1800 },
        fcp: { good: 1800, poor: 3000 }
    };

    function gradeVital(metric, value) {
        const range = VITAL_THRESHOLDS[metric];
        if (!range) return 'unknown';
        const num = typeof value === 'number' ? value : Number(value);
        if (!Number.isFinite(num)) return 'unknown';
        if (num <= range.good) return 'good';
        if (num <= range.poor) return 'needs-improvement';
        return 'poor';
    }

    /* ==================== FUNIL DO FORMULARIO ==================== */

    const FORM_FIELDS = ['name', 'email', 'phone', 'message'];

    function funnelStepOf(field) {
        const index = FORM_FIELDS.indexOf(String(field || ''));
        return index === -1 ? -1 : index + 1;
    }

    /* Funcao pura: recebe a lista de eventos do funil e devolve o resumo. E o
     * mesmo codigo que o painel usa para desenhar, entao o painel nao pode
     * divergir do que o navegador coletou. O campo vem pelo NOME em todos os
     * eventos, nunca por indice, senao reordenar a lista de campos quebraria a
     * leitura do historico. */
    function summarizeFunnel(events) {
        const byField = {};
        FORM_FIELDS.forEach(field => {
            byField[field] = { field: field, focused: 0, errors: 0, filled: 0 };
        });
        let starts = 0;
        let submits = 0;
        let submitOk = 0;
        let abandons = 0;

        (events || []).forEach(ev => {
            if (!ev || typeof ev !== 'object') return;
            const p = ev.params && typeof ev.params === 'object' ? ev.params : {};
            if (ev.name === 'form_start') starts++;
            if (ev.name === 'form_submit') { submits++; if (p.ok) submitOk++; }
            if (ev.name === 'form_abandon') abandons++;

            const step = typeof p.field === 'string' ? byField[p.field] : null;
            if (!step) return;
            if (ev.name === 'form_field_focus') step.focused++;
            if (ev.name === 'form_field_error') step.errors++;
            if (ev.name === 'form_field_filled') step.filled++;
        });

        /* O que interessa para decidir: em qual campo a pessoa parou de vez.
         * Perdeu quem chegou ate um campo e nunca viu o proximo. */
        const steps = FORM_FIELDS.map((field, i) => {
            const step = byField[field];
            const next = FORM_FIELDS[i + 1];
            const reachedNext = next ? byField[next].focused > 0 : submits > 0;
            return {
                field: field,
                step: i + 1,
                focused: step.focused,
                errors: step.errors,
                filled: step.filled,
                reached: step.focused > 0,
                lostHere: step.focused > 0 && !reachedNext
            };
        });

        return {
            starts: starts,
            submits: submits,
            submitOk: submitOk,
            abandons: abandons,
            completionRate: starts ? Math.round((submitOk / starts) * 1000) / 10 : 0,
            steps: steps
        };
    }

    /* ==================== RESUMO ==================== */

    return {
        CONSENT_KEY: CONSENT_KEY,
        CONSENT_SIGNALS: CONSENT_SIGNALS,
        SCROLL_THRESHOLDS: SCROLL_THRESHOLDS,
        FORM_FIELDS: FORM_FIELDS,
        VITAL_THRESHOLDS: VITAL_THRESHOLDS,
        UTM_KEYS: UTM_KEYS,
        CLICK_IDS: CLICK_IDS,
        getConsent: getConsent,
        setConsent: setConsent,
        shouldLoadAnalytics: shouldLoadAnalytics,
        defaultConsentState: defaultConsentState,
        consentUpdate: consentUpdate,
        sanitizeValue: sanitizeValue,
        flattenParams: flattenParams,
        buildEvent: buildEvent,
        parseQuery: parseQuery,
        parseAttribution: parseAttribution,
        hostOf: hostOf,
        classifyReferrer: classifyReferrer,
        stripToPath: stripToPath,
        isBotUserAgent: isBotUserAgent,
        randomId: randomId,
        getOrCreateVisitor: getOrCreateVisitor,
        daysSince: daysSince,
        newScrollTracker: newScrollTracker,
        clampDelta: clampDelta,
        gradeVital: gradeVital,
        funnelStepOf: funnelStepOf,
        summarizeFunnel: summarizeFunnel
    };
}));
