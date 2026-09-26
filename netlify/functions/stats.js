/* GET /api/stats
 *
 * Le os eventos gravados e devolve o resumo agregado.
 *
 * A agregacao acontece aqui e nao no navegador por dois motivos: o painel
 * mostra 30 dias de dado, nao cabe no cliente; e o endpoint so devolve
 * contagens, entao ninguem com acesso a ele consegue ler evento cru.
 *
 * A protecao real do dado esta no netlify.toml (basic auth em /relatorio).
 * Isso e seguranca de fronteira, nao criptografia: suficiente para um painel
 * pessoal, e o mesmo nivel de exposicao que a pasta /admin tem em qualquer
 * hospedagem estatica.
 */

import { listDays, readDay } from './_lib/store.js';
import { gradeVital } from './_lib/vitals.js';

const MAX_DAYS = 30;

function num(v) {
    const n = Number(v);
    return Number.isFinite(n) ? n : 0;
}

function bump(map, key, by) {
    const k = String(key || 'desconhecido');
    map[k] = (map[k] || 0) + (by || 1);
}

function percentile(values, p) {
    if (!values.length) return 0;
    const sorted = values.slice().sort((a, b) => a - b);
    const idx = Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length));
    return sorted[idx];
}

function mean(values) {
    if (!values.length) return 0;
    return values.reduce((a, b) => a + b, 0) / values.length;
}

/* Uma sessao e uma visita. Contar por sid e o que impede um unico visitante
 * que rola a pagina 50 vezes de virar 50 sessoes. */
function buildReport(records) {
    const sessions = new Map();
    const visitors = new Map();
    const refSources = {};
    const refMediums = {};
    const countries = {};
    const devices = {};
    const langs = {};
    const ctas = {};
    const sections = {};
    const scrolls = {};
    const navs = {};
    const projViews = {};
    const projClicks = {};
    const vitals = { lcp: [], cls: [], inp: [], ttfb: [], fcp: [] };
    const funnelEvents = [];

    let events = 0;
    let bots = 0;
    let submits = 0;
    let submitOk = 0;
    let registros = 0;
    let copies = 0;

    records.forEach(rec => {
        if (!rec || !rec.e) return;
        events++;
        const d = rec.d || {};
        if (d.bot) { bots++; return; }
        /* Visitante unico, pelo id que o proprio navegador gerou. E o numero
         * que responde "quantas pessoas voltaram", que o total de sessoes nao
         * responde: quem rola a pagina 50 vezes tem uma sessao so, mas quem
         * volta no dia seguinte tem duas sessoes e continua sendo uma pessoa. */
        if (rec.v && rec.v.id) {
            const v = visitors.get(rec.v.id) || { first: rec.t, last: rec.t, visits: 0 };
            v.first = Math.min(v.first, rec.t);
            v.last = Math.max(v.last, rec.t);
            if (v.visits < rec.v.visits) v.visits = rec.v.visits;
            visitors.set(rec.v.id, v);
        }
        if (d.ref && d.ref.source) bump(refSources, d.ref.source);
        if (d.ref && d.ref.medium) bump(refMediums, d.ref.medium);
        if (d.country) bump(countries, d.country);
        if (d.device) bump(devices, d.device);
        if (d.lang) bump(langs, d.lang);
        /* Cria a sessao uma vez so.
         *
         * A primeira versao fazia sessions.set em todo evento. Como o
         * scroll_depth e o engagement chegam depois do page_view, cada evento
         * novo nascia uma sessao com maxScroll e active zerados -- e o
         * formulario, que e o ultimo evento da visita, apagava o progresso
         * inteiro. O resultado era "profundidade maxima" igual ao ultimo
         * scroll e tempo ativo sempre 0. */
        if (d.page && !sessions.has(rec.s)) {
            sessions.set(rec.s, {
                t: rec.t, page: d.page, device: d.device, maxScroll: 0, active: 0
            });
        }

        const p = rec.p || {};
        const name = rec.e;

        if (name === 'cta_click') {
            bump(ctas, p.id);
            if (p.kind === 'nav') bump(navs, p.id);
            if (String(p.id || '').indexOf('repo_') === 0) bump(projClicks, p.id);
            if (String(p.id || '').indexOf('card_') === 0) bump(projViews, p.id);
        }
        if (name === 'section_view') bump(sections, p.section);
        if (name === 'scroll_depth') {
            bump(scrolls, p.depth);
            const s = sessions.get(rec.s);
            if (s && num(p.depth) > s.maxScroll) s.maxScroll = num(p.depth);
        }
        if (name === 'engagement') {
            const s = sessions.get(rec.s);
            if (s) { s.active = num(p.active_ms); s.maxScroll = Math.max(s.maxScroll, num(p.max_scroll)); }
        }
        if (name === 'vitals') {
            if (p.lcp_ms) vitals.lcp.push(num(p.lcp_ms));
            if (p.cls) vitals.cls.push(num(p.cls));
            if (p.inp_ms) vitals.inp.push(num(p.inp_ms));
            if (p.ttfb_ms) vitals.ttfb.push(num(p.ttfb_ms));
            if (p.fcp_ms) vitals.fcp.push(num(p.fcp_ms));
        }
        if (name === 'form_submit') { submits++; if (p.ok) submitOk++; }
        /* Registro duravel do envio. Nao entra em submits: o navegador ja
         * mandou form_submit pelo caminho de medicao, e somar os dois
         * contaria o mesmo contato duas vezes. */
        if (name === 'form_record') registros++;
        if (name === 'copy') copies++;
        if (String(name).indexOf('form_') === 0) funnelEvents.push({ name: name, params: p });
    });

    const sessionList = Array.from(sessions.values());
    const visitorList = Array.from(visitors.values());
    const activeMs = sessionList.map(s => s.active).filter(v => v > 0);
    const maxScrolls = sessionList.map(s => s.maxScroll);

    /* Recorrencia: quem voltou mais de uma vez. A janela e de 30 dias porque
     * e o periodo que o painel mostra, entao comparar alem disso contaria
     * gente que nao esta no periodo. */
    const repeat = visitorList.filter(v => v.visits > 1);
    const span = visitorList.length
        ? Math.max(1, Math.round((Date.now() - Math.min.apply(null,
            visitorList.map(v => v.first))) / 86400000))
        : 0;

    const vitalSummary = {};
    Object.keys(vitals).forEach(metric => {
        const values = vitals[metric];
        if (!values.length) return;
        vitalSummary[metric] = {
            n: values.length,
            p50: Math.round(percentile(values, 50)),
            p75: Math.round(percentile(values, 75)),
            mean: Math.round(mean(values)),
            grade: gradeVital(metric, percentile(values, 75))
        };
    });

    return {
        totals: {
            events: events,
            botEvents: bots,
            sessions: sessionList.length,
            humanEvents: events - bots,
            visitors: visitorList.length,
            repeatVisitors: repeat.length,
            repeatRate: visitorList.length
                ? Math.round((repeat.length / visitorList.length) * 100) : 0,
            visitsPerVisitor: visitorList.length
                ? Math.round((sessionList.length / visitorList.length) * 100) / 100 : 0,
            windowDays: span,
            submits: submits,
            submitOk: submitOk,
            registros: registros,
            copies: copies
        },
        /* Mediana e percentis, nao media. Tempo de sessao tem distribuicao
         * assimetrica a direita -- uma pessoa que deixou a aba aberta a noite
         * puxa a media para cima e faz o numero nao representar ninguem. */
        engagement: {
            activeMsP50: Math.round(percentile(activeMs, 50)),
            activeMsP75: Math.round(percentile(activeMs, 75)),
            maxScrollP50: percentile(maxScrolls, 50),
            maxScrollP75: percentile(maxScrolls, 75),
            reached100: maxScrolls.filter(v => v >= 100).length
        },
        origins: { source: refSources, medium: refMediums, country: countries },
        device: { device: devices, lang: langs },
        ctas: ctas,
        nav: navs,
        projects: { views: projViews, clicks: projClicks },
        sections: sections,
        scrollDepth: scrolls,
        vitals: vitalSummary,
        funnelRaw: funnelEvents
    };
}

/* Comparacao em tempo constante. Nao e overkill: sem isso, um atacante que
 * discover o endpoint consegue descobrir o token medindo quanto tempo cada
 * tentativa leva -- o ataque classico de timing. */
function tokenMatches(provided, expected) {
    if (!expected) return false;
    const a = Buffer.from(String(provided || ''));
    const b = Buffer.from(String(expected));
    /* Percorre sempre o maior dos dois, mesmo quando os tamanhos diferem, e
     * so depois compara. Sem o laco nos dois casos, o tempo de resposta
     * revelaria o tamanho do token -- ataque classico de timing. */
    const len = Math.max(a.length, b.length);
    let diff = a.length ^ b.length;
    for (let i = 0; i < len; i++) {
        diff |= (a[i] || 0) ^ (b[i] || 0);
    }
    return diff === 0;
}

export default async function handler(req) {
    if (req.method !== 'GET') return { statusCode: 405, headers: { Allow: 'GET' }, body: '' };

    /* Fechado por padrao. Sem ANALYTICS_TOKEN definido o endpoint nao abre
     * em hipotese alguma -- e o que impede o erro classico de esquecer de
     * configurar a variavel e publicar o historico inteiro do portfolio. */
    const expected = process.env.ANALYTICS_TOKEN || '';
    const provided = req.headers['x-analytics-token'] || '';
    if (!expected) {
        return {
            statusCode: 503,
            headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
            body: JSON.stringify({
                error: 'token-nao-configurado',
                aviso: 'Defina ANALYTICS_TOKEN no ambiente do site para liberar o painel.'
            })
        };
    }
    if (!tokenMatches(provided, expected)) {
        return {
            statusCode: 401,
            headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
            body: JSON.stringify({ error: 'nao-autorizado' })
        };
    }

    const url = new URL(req.url, 'http://localhost');
    const days = Math.min(MAX_DAYS, Math.max(1, Number(url.searchParams.get('days')) || 7));

    const keys = await listDays(days);
    const records = [];
    for (const key of keys) {
        const rows = await readDay(key.replace('events-', '').replace('.jsonl', ''));
        records.push(...rows);
    }

    return {
        statusCode: 200,
        headers: {
            'Content-Type': 'application/json; charset=utf-8',
            'Cache-Control': 'no-store'
        },
        body: JSON.stringify({
            days: days,
            daysWithData: keys.length,
            store: !!process.env.NETLIFY_BLOBS_CONTEXT,
            report: buildReport(records)
        })
    };
}
