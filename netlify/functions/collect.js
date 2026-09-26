/* POST /api/collect
 *
 * Receptor dos eventos first-party que o navegador manda.
 *
 * Por que existir quando ja tem GA e Clarity: porque nenhum dos dois ve o
 * trafego bloqueado por adblock. Uma requisicao para o dominio proprio passa
 * porque nao existe lista de bloqueio para ela, e o resultado e o dado sem o
 * vies de 20-30% que o dashboard nao mostra.
 *
 * Decisao deliberada sobre IP: este endpoint NAO guarda o IP. Guarda o pais e
 * o estado, derivados na borda da Netlify. Dois motivos, e o segundo e o que
 * pesa:
 *
 *  1. O IP e dado pessoal sob a LGPD e voce-lo cria uma base de dado pessoal
 *     que ate agora nao existe, com obrigacao de base legal, prazo e canal de
 *     acesso do titular.
 *  2. Pais e estado respondem "de onde vem o trafego" -- a pergunta que o
 *     painel precisa responder -- sem identificar ninguem. O IP bruto nao
 *     agrega nenhuma analise que o pais nao responda, e cobra caro em
 *     privacidade.
 *
 * O IP e usado so em memoria, dentro do mesmo request, para derivar o geo, e
 * descartado antes de responder. Ele nunca e persistido nem devolvido.
 */

import { append, jaPurgouHoje, marcaPurgado, purgeOlderThan, retentionDays } from './_lib/store.js';
import { classifyRef, isBot } from './_lib/shared.js';

const MAX_BODY_BYTES = 32 * 1024;
const MAX_EVENTS_PER_REQUEST = 60;

/* Os eventos que este site emite. Um endpoint publico aceita qualquer JSON, e
 * sem esta lista alguem poderia escrever no seu storage o que quiser -- ou
 * nada, so para encher a cota. Aceitar so o que o site realmente manda mantem
 * o painel limpo e o storage pequeno. */
const ALLOWED_EVENTS = new Set([
    'page_view', 'context', 'consent_choice', 'scroll_depth',
    'section_view', 'section_dwell', 'engagement', 'cta_click', 'copy',
    'form_start', 'form_field_focus', 'form_field_filled', 'form_field_error',
    'form_submit_attempt', 'form_submit', 'form_abandon', 'vitals'
]);

function json(statusCode, body) {
    return {
        statusCode,
        headers: {
            'Content-Type': 'application/json; charset=utf-8',
            'Cache-Control': 'no-store'
        },
        body: JSON.stringify(body)
    };
}

/* Assinatura anti-abuso simples. Um beacon de analytics nao vem com
 * Authorization, entao rate limit por IP. Nao e seguranca: e para nao
 * transformar um endpoint publico em alvo de quem quer encher o storage. */
const hits = new Map();

function tooManyFrom(key) {
    const now = Date.now();
    const windowMs = 60000;
    const max = 60;
    const entry = hits.get(key) || { count: 0, since: now };
    if (now - entry.since > windowMs) { entry.count = 0; entry.since = now; }
    entry.count++;
    hits.set(key, entry);
    if (hits.size > 5000) hits.clear();
    return entry.count > max;
}

export default async function handler(req, context) {
    if (req.method === 'OPTIONS') {
        return { statusCode: 204, headers: { Allow: 'POST, OPTIONS' }, body: '' };
    }
    if (req.method !== 'POST') return json(405, { error: 'method-not-allowed' });

    const ip = (context && (context.clientAddress || context.ip)) || 'desconhecido';
    if (tooManyFrom(ip)) return json(429, { error: 'rate-limited' });

    /* O limite e conferido de duas formas.
     *
     * A primeira versao so olhava o content-length declarado. Esse cabecalho e
     * do cliente: quem quiser escrever 50 MB basta mandar chunked encoding e
     * omitir o cabecalho, e o corpo chega inteiro para ser parseado antes de
     * qualquer limite agir. Medir o que ja chegou na mao e o que fecha a
     * porta de verdade. */
    const declared = Number(req.headers['content-length'] || 0);
    if (declared && declared > MAX_BODY_BYTES) return json(413, { error: 'payload-grande' });

    if (typeof req.body === 'string' && req.body.length > MAX_BODY_BYTES) {
        return json(413, { error: 'payload-grande' });
    }

    let payload;
    try {
        payload = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
    } catch (err) {
        return json(400, { error: 'json-invalido' });
    }
    if (!payload || typeof payload !== 'object' || !Array.isArray(payload.events)) {
        return json(400, { error: 'formato-inesperado' });
    }
    if (!payload.events.length) return json(400, { error: 'sem-eventos' });
    if (payload.events.length > MAX_EVENTS_PER_REQUEST) {
        payload.events = payload.events.slice(0, MAX_EVENTS_PER_REQUEST);
    }

    const ua = (req.headers['user-agent'] || '').slice(0, 200);
    /* Bot descartado aqui, e nao so no cliente: quem fala com a borda e o
     * servidor, e um User-Agent falsificado e o caso mais comum. */
    const bot = isBot(ua);

    /* Geo derivado da borda, sem persistir o endereco. */
    const geo = (context && context.geo) || {};
    const country = typeof geo.country === 'string' ? geo.country.slice(0, 2).toUpperCase() : '';
    const region = typeof geo.subdivision === 'string' ? geo.subdivision.slice(0, 3).toUpperCase() : '';

    /* Origem: confia na classificacao do navegador quando ela vem no formato
     * esperado e recalcula quando nao vem. Sem o fallback, um cliente que
     * mandasse so a string crua entraria no painel como "direct" e o relatorio
     * de origem ficaria errado em silencio. */
    const ref = (payload.ref && typeof payload.ref === 'object')
        ? classifyRef(payload.ref, req.headers['host'] || '')
        : classifyRef(payload.refRaw || '', req.headers['host'] || '');

    const session = {
        ts: Date.now(),
        country: country,
        region: region,
        /* Distingue TWO, browser e preview de card, que as metricas de UX nao
         * conseguem separar sozinhas. */
        device: (req.headers['sec-ch-ua-mobile'] === '?1' || /Mobi|Android/i.test(ua))
            ? 'mobile' : 'desktop',
        lang: (req.headers['accept-language'] || '').slice(0, 5),
        bot: bot,
        ref: ref,
        page: String(payload.page || '').slice(0, 200)
    };

    /* O id de visitante e um valor que o proprio visitante gerou: nao e dado
     * pessoal, mas e o que permite juntar as sessoes de uma mesma pessoa no
     * relatorio. Sem guardar, todo evento fica orfao e o painel so mostra
     * visitas, nunca visitantes recorrentes. */
    const visitor = (payload.visitor && typeof payload.visitor === 'object')
        ? {
            id: String(payload.visitor.id || '').slice(0, 40),
            firstSeenAt: Number(payload.visitor.firstSeenAt) || 0,
            visits: Number(payload.visitor.visits) || 0
        }
        : null;

    const records = payload.events
        .filter(ev => ev && ALLOWED_EVENTS.has(String(ev.e || '')))
        .slice(0, MAX_EVENTS_PER_REQUEST)
        .map(ev => ({
            t: Number(ev.t) || session.ts,
            s: String(ev.sid || '').slice(0, 40),
            e: String(ev.e || '').slice(0, 40),
            v: visitor,
            p: ev.p && typeof ev.p === 'object' ? ev.p : {},
            d: session
        }));

    if (!records.length) {
        /* Nada reconhecido: 204 para o cliente nao ficar reenviando. */
        return json(204, { stored: false, reason: 'nenhum-evento-conhecido' });
    }

    /* A retencao roda junto com a primeira gravacao do dia, e nunca segura o
     * evento: se a limpeza falhar, o evento entra assim mesmo. Perder telemetria
     * e melhor do que perder a primeira visita do dia. */
    if (!jaPurgouHoje()) {
        marcaPurgado();
        const limite = new Date(Date.now() - retentionDays() * 86400000)
            .toISOString().slice(0, 10);
        purgeOlderThan(limite).catch(err => {
            console.warn('[collect] retencao falhou:', err && err.message);
        });
    }

    let result;
    try {
        result = await append(records);
    } catch (err) {
        /* Erro aqui e de storage, nao do cliente. 204 evita que o navegador
         * considere falha e tente de novo. */
        return json(204, { stored: false });
    }

    return json(result.stored ? 202 : 204, {
        stored: result.stored,
        written: result.written || 0
    });
}
