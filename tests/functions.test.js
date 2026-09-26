const { describe, it } = require('node:test');
const assert = require('node:assert');
const path = require('node:path');
const url = require('node:url');
const fs = require('node:fs');

const NETLIFY = path.join(__dirname, '..', 'netlify', 'functions');

/* Os modulos de storage falam com Netlify Blobs, que so existe no deploy.
 * Aqui o '_lib/store.js' e substituido por uma versao em memoria, para que a
 * agregacao possa ser testada de verdade com um trafego montado a mao.
 *
 * Sem isso, "a dashboard mostra o numero certo" e uma afirmacao sem prova.
 *
 * A substituicao acontece reescrevendo o import das functions para um modulo
 * virtual -- nao tentando reescrever o store.js, que causaria nomes
 * duplicados. */
const STORE_FALSO = `
const diaDe = ts => new Date(ts || Date.now()).toISOString().slice(0, 10);
export function available() { return true; }
export async function listDays() {
    /* So as chaves em formato de data. O store de teste usa '__hoje' como
     * marcador interno, e devolve-lo aqui faria o relatorio tentar parsear
     * '2026-09-26' como se fosse um registro. */
    return Array.from(globalThis.__store.keys())
        .filter(k => /^\\d{4}-\\d{2}-\\d{2}$/.test(k)).sort();
}
export async function readDay(dia) {
    const bruto = globalThis.__store.get(dia) || '';
    return bruto.split('\\n').filter(Boolean).map(l => JSON.parse(l));
}
export async function append(registros) {
    if (!globalThis.__store.has('__hoje')) {
        globalThis.__store.set('__hoje', diaDe());
    }
    const dia = globalThis.__store.get('__hoje');
    const linhas = (globalThis.__store.get(dia) || '').split('\\n').filter(Boolean);
    registros.forEach(r => linhas.push(JSON.stringify(r)));
    globalThis.__store.set(dia, linhas.join('\\n'));
    return { stored: true, written: registros.length };
}
export async function purgeOlderThan(limite) {
    const antes = globalThis.__store.size;
    Array.from(globalThis.__store.keys()).forEach(d => {
        if (/^\\d{4}-\\d{2}-\\d{2}$/.test(d) && d < limite) globalThis.__store.delete(d);
    });
    return { removed: antes - globalThis.__store.size };
}
export function retentionDays() { return 730; }
export function jaPurgouHoje() { return !!globalThis.__purgouHoje; }
export function marcaPurgado() { globalThis.__purgouHoje = true; }
`;

const STORE_URL = 'data:text/javascript;base64,' + Buffer.from(STORE_FALSO).toString('base64');
let cache = null;

async function carregar() {
    if (cache) return cache;
    /* Cada function e importada por um URL virtual, com o './_lib/store.js'
     * apontando para o store falso. Os modulos puros (_lib/shared.js e
     * _lib/vitals.js) nao dependem de storage e sao resolvidos de verdade. */
    const dir = url.pathToFileURL(NETLIFY + path.sep).href;
    const nomes = ['collect.js', 'form.js', 'stats.js'];
    const modulos = {};
    for (const nome of nomes) {
        let src = fs.readFileSync(path.join(NETLIFY, nome), 'utf8');
        /* so os imports do store viram URL virtual; os outros ficam
         * relativos e precisam virar absoluto */
        src = src.split("'./_lib/store.js'").join("'" + STORE_URL + "'");
        src = src.split("'./_lib/").join("'" + dir + "/_lib/");
        const url = 'data:text/javascript;base64,' + Buffer.from(src).toString('base64');
        modulos[nome.replace('.js', '')] = await import(url);
    }
    cache = modulos;
    return cache;
}

function req(metodo, corpo, headers) {
    return {
        method: metodo,
        headers: Object.assign({ 'user-agent': 'Mozilla/5.0 (Macintosh)' }, headers || {}),
        body: typeof corpo === 'string' ? corpo : JSON.stringify(corpo)
    };
}

const ctx = { geo: { country: 'br', subdivision: 'SP' } };

function hoje() {
    return new Date().toISOString().slice(0, 10);
}

/* Le o dia corrente do store falso, que e onde append() deposita. */
function readDia() {
    const dia = globalThis.__store.get('__hoje') || hoje();
    const bruto = globalThis.__store.get(dia) || '';
    return Promise.resolve(bruto.split('\n').filter(Boolean).map(l => JSON.parse(l)));
}

/* Zera o store entre cenarios. */
function dadosLimpos() {
    globalThis.__store = new Map();
    globalThis.__purgouHoje = false;
}

/* Grava direto no store, sem passar pela borda, para montar o historico. */
function seedDia(registros) {
    const dia = hoje();
    globalThis.__store.set('__hoje', dia);
    globalThis.__store.set(dia, registros.map(r => JSON.stringify(r)).join('\n'));
}

describe('coleta de eventos', () => {
    it('grava os eventos permitidos e ignora os desconhecidos', async () => {
        dadosLimpos();
        const { default: collect } = (await carregar()).collect;
        const r = await collect(req('POST', {
            ts: 1700000000000,
            sid: 'sessao-1',
            page: '/',
            visitor: { id: 'v1', firstSeenAt: 1690000000000, visits: 3 },
            events: [
                { e: 'page_view', p: { title: 'Portifolio' } },
                { e: 'scroll_depth', p: { depth: 75 } },
                { e: 'evento_inventado', p: {} }
            ]
        }), ctx);

        assert.strictEqual(r.statusCode, 202);
        const gravados = await readDia();
        const nomes = gravados.map(x => x.e);
        assert.ok(nomes.includes('page_view'), 'page_view nao foi gravado');
        assert.ok(nomes.includes('scroll_depth'), 'scroll_depth nao foi gravado');
        assert.ok(!nomes.includes('evento_inventado'),
            'um evento fora da allowlist foi gravado');
    });

    it('preserva o id de visitante para juntar sessoes', async () => {
        dadosLimpos();
        const { default: collect } = (await carregar()).collect;
        await collect(req('POST', {
            sid: 'sessao-2',
            visitor: { id: 'vid-9', firstSeenAt: 1690000000000, visits: 5 },
            events: [{ e: 'page_view', p: {} }]
        }), ctx);
        const [rec] = await readDia();
        assert.strictEqual(rec.v.id, 'vid-9');
        assert.strictEqual(rec.v.visits, 5);
    });

    it('descarta o que vem de bot e conta separado', async () => {
        dadosLimpos();
        const { default: collect } = (await carregar()).collect;
        await collect(req('POST', {
            sid: 's-bot',
            events: [{ e: 'page_view', p: {} }]
        }, { 'user-agent': 'Googlebot/2.1 (+http://www.google.com/bot.html)' }), ctx);
        const [rec] = await readDia();
        assert.strictEqual(rec.d.bot, true, 'o bot nao foi marcado');
    });

    it('recusa corpo grande mesmo sem content-length', async () => {
        /* Regressao: o limite so olhava o cabecalho declarado, que o cliente
         * controla. Mandando chunked encoding, o corpo entrava inteiro. */
        dadosLimpos();
        const { default: collect } = (await carregar()).collect;
        const grande = { events: [{ e: 'page_view', p: { x: 'y'.repeat(200 * 1024) } }] };
        const r = await collect(req('POST', grande, { 'content-type': 'application/json' }), ctx);
        assert.strictEqual(r.statusCode, 413, 'aceitou corpo grande sem content-length');
    });

    it('recusa corpo grande em vez de tentar gravar', async () => {
        dadosLimpos();
        const { default: collect } = (await carregar()).collect;
        const r = await collect(req('POST', {
            events: [{ e: 'page_view', p: { grande: 'x'.repeat(200 * 1024) } }]
        }), ctx);
        assert.ok(r.statusCode === 413 || r.statusCode === 400,
            'corpo grande foi aceito: ' + r.statusCode);
    });

    it('exige metodo POST', async () => {
        const { default: collect } = (await carregar()).collect;
        const r = await collect(req('GET', {}), ctx);
        assert.strictEqual(r.statusCode, 405);
    });
});

describe('registro do formulario', () => {
    it('nao grava o conteudo por padrao', async () => {
        dadosLimpos();
        const { default: form } = (await carregar()).form;
        delete process.env.ANALYTICS_STORE_LEADS;
        const r = await form(req('POST', {
            sid: 'sessao-3',
            channels: 'whatsapp',
            lead: { name: 'Ana', email: 'ana@x.com', message: 'Ola' }
        }), ctx);
        assert.strictEqual(r.statusCode, 202);
        const [rec] = await readDia();
        assert.strictEqual(rec.e, 'form_record');
        assert.strictEqual(rec.p.lead, undefined, 'o lead foi guardado sem a flag');
        assert.strictEqual(rec.p.channels, 'whatsapp');
    });

    it('guarda o conteudo quando a flag e explicitamente true', async () => {
        dadosLimpos();
        const { default: form } = (await carregar()).form;
        process.env.ANALYTICS_STORE_LEADS = 'true';
        try {
            await form(req('POST', {
                sid: 'sessao-4',
                lead: { name: 'Ana', email: 'ana@x.com', message: 'Ola' }
            }), ctx);
            const [rec] = await readDia();
            assert.strictEqual(rec.p.lead.email, 'ana@x.com');
        } finally {
            delete process.env.ANALYTICS_STORE_LEADS;
        }
    });

    it('a flag "false" nao liga o armazenamento de conteudo', async () => {
        dadosLimpos();
        const { default: form } = (await carregar()).form;
        process.env.ANALYTICS_STORE_LEADS = 'false';
        try {
            await form(req('POST', { lead: { email: 'ana@x.com' } }), ctx);
            const [rec] = await readDia();
            assert.strictEqual(rec.p.lead, undefined, '"false" ligou o armazenamento');
        } finally {
            delete process.env.ANALYTICS_STORE_LEADS;
        }
    });

    it('nao confunde o registro duravel com a metrica de envio', async () => {
        /* Se os dois usassem o mesmo nome, um contato viraria dois no painel. */
        dadosLimpos();
        const { default: form } = (await carregar()).form;
        await form(req('POST', { sid: 's' }), ctx);
        const [rec] = await readDia();
        assert.notStrictEqual(rec.e, 'form_submit',
            'o registro duravel usa o nome da metrica e seria contado em dobro');
    });
});

describe('relatorio', () => {
    /* Devolve o codigo e o bloco "report" ja parseado. A resposta real vem
     * embrulhada em { days, daysWithData, store, report }, e os testes
     * interessam so pelo conteudo do relatorio.
     *
     * esperado e o token no ambiente; enviado e o que chega no cabecalho.
     * Sao separados de proposito -- com um so parametro, "fecha com token
     * errado" acabaria mandando o token certo e o teste passaria por acidente. */
    async function relatorioCom(registros, esperado, enviado) {
        dadosLimpos();
        const { default: stats } = (await carregar()).stats;
        if (esperado === undefined) delete process.env.ANALYTICS_TOKEN;
        else process.env.ANALYTICS_TOKEN = esperado;
        seedDia(registros);
        const informado = enviado === undefined ? esperado : enviado;
        const r = await stats(req('GET', null, {
            'x-analytics-token': informado || ''
        }), ctx);
        return { statusCode: r.statusCode, report: r.statusCode === 200 ? JSON.parse(r.body).report : null };
    }

    const base = {
        t: 1700000000000, s: 's1',
        d: { page: '/', device: 'desktop', lang: 'pt-BR', country: 'BR', ref: { source: 'google', medium: 'organic' } }
    };

    it('fecha quando nao ha token configurado', async () => {
        /* 503 e nao 401 de proposito: token ausente e configuracao quebrada do
         * painel, nao tentativa de acesso indevido. O que importa e que nunca
         * devolve 200 -- e a unica coisa que este teste precisa garantir. */
        const r = await relatorioCom([base], undefined);
        assert.notStrictEqual(r.statusCode, 200, 'abriu sem token configurado');
        assert.strictEqual(r.statusCode, 503);
    });

    it('fecha com token errado', async () => {
        const r = await relatorioCom([base], 'segredo', 'token-errado');
        assert.strictEqual(r.statusCode, 401, 'abriu com o token errado');
        assert.strictEqual(r.report, null, 'devolveu relatorio mesmo assim');
    });

    it('fecha com token vazio', async () => {
        const r = await relatorioCom([base], 'segredo', '');
        assert.strictEqual(r.statusCode, 401, 'abriu sem mandar token nenhum');
    });

    it('fecha com token de tamanho diferente', async () => {
        /* O caminho de tamanhos diferentes e separado no codigo e e o que
         * mais aparece em tentativa de adivinhacao. */
        const r = await relatorioCom([base], 'segredo', 'seg');
        assert.strictEqual(r.statusCode, 401);
        const maior = await relatorioCom([base], 'segredo', 'segredo-muito-mais-longo');
        assert.strictEqual(maior.statusCode, 401);
    });

    it('abre com o token certo', async () => {
        const r = await relatorioCom([base], 'segredo');
        assert.strictEqual(r.statusCode, 200);
    });

    it('nao deixa o max scroll ser sobrescrito por evento posterior', async () => {
        /* Regressao: sessions.set rodava em todo evento e zerava o progresso,
         * entao a deepest scroll virava a ultima e o tempo ativo sumia. */
        const r = await relatorioCom([
            Object.assign({}, base, { e: 'page_view', p: {} }),
            Object.assign({}, base, { e: 'scroll_depth', p: { depth: 25 } }),
            Object.assign({}, base, { e: 'scroll_depth', p: { depth: 100 } }),
            Object.assign({}, base, { e: 'scroll_depth', p: { depth: 50 } }),
            Object.assign({}, base, { e: 'engagement', p: { active_ms: 45000, max_scroll: 100 } })
        ], 'segredo');
        const b = r.report;
        assert.strictEqual(b.totals.sessions, 1, 'a mesma sessao foi contada varias vezes');
        assert.strictEqual(b.engagement.maxScrollP50, 100,
            'o max scroll ficou no ultimo evento em vez do maior');
    });

    it('soma as sessoes distintas sem contar em dobro', async () => {
        const r = await relatorioCom([
            Object.assign({}, base, { e: 'page_view', p: {} }),
            Object.assign({}, base, { s: 's2', e: 'page_view', p: {} })
        ], 'segredo');
        const b = r.report;
        assert.strictEqual(b.totals.sessions, 2);
    });

    it('conta o mesmo envio uma vez so', async () => {
        const r = await relatorioCom([
            Object.assign({}, base, { e: 'form_submit', p: { ok: true } }),
            Object.assign({}, base, { e: 'form_record', p: { channels: 'whatsapp' } })
        ], 'segredo');
        const b = r.report;
        assert.strictEqual(b.totals.submits, 1, 'o envio foi contado duas vezes');
        assert.strictEqual(b.totals.registros, 1, 'o registro duravel sumiu do relatorio');
    });

    it('conta visitantes unicos e recorrencia', async () => {
        const r = await relatorioCom([
            Object.assign({}, base, { s: 'a', v: { id: 'v1', visits: 1 }, e: 'page_view', p: {} }),
            Object.assign({}, base, { s: 'b', v: { id: 'v1', visits: 2 }, e: 'page_view', p: {} }),
            Object.assign({}, base, { s: 'c', v: { id: 'v2', visits: 1 }, e: 'page_view', p: {} })
        ], 'segredo');
        const b = r.report;
        assert.strictEqual(b.totals.visitors, 2, 'visitantes unicos errados');
        assert.strictEqual(b.totals.repeatVisitors, 1, 'recorrencia errada');
        assert.strictEqual(b.totals.repeatRate, 50, 'taxa de recorrencia errada');
    });

    it('separa evento de bot do total humano', async () => {
        const r = await relatorioCom([
            Object.assign({}, base, { e: 'page_view', p: {} }),
            Object.assign({}, base, { s: 'bot', d: { page: '/', bot: true }, e: 'page_view', p: {} })
        ], 'segredo');
        const b = r.report;
        assert.strictEqual(b.totals.botEvents, 1);
        assert.strictEqual(b.totals.events, 2, 'o total bruto nao pode incluir o bot');
        assert.strictEqual(b.totals.sessions, 1, 'o bot nao pode virar sessao');
    });

    it('classifica a vitals pelo p75, que e o que o Google usa', async () => {
        const muitos = [];
        for (let i = 0; i < 20; i++) {
            muitos.push(Object.assign({}, base, {
                s: 's' + i, e: 'vitals', p: { lcp_ms: i < 15 ? 2000 : 6000 }
            }));
        }
        const r = await relatorioCom(muitos, 'segredo');
        const b = r.report;
        assert.ok(b.vitals.lcp, 'a LCP sumiu do relatorio');
        assert.ok(b.vitals.lcp.p75 >= 2000, 'p75 ausente');
        assert.ok(b.vitals.lcp.grade, 'a nota da vital sumiu');
    });

    it('devolve so agregado, nunca o evento cru', async () => {
        const r = await relatorioCom([
            Object.assign({}, base, { e: 'cta_click', p: { id: 'contato_whatsapp' } })
        ], 'segredo');
        const b = r.report;
        assert.strictEqual(typeof b, 'object');
        const texto = JSON.stringify(b);
        assert.ok(!/"events"\s*:\s*\[/.test(texto), 'a resposta trouxe a lista de eventos');
        assert.ok(b.ctas && b.ctas.contato_whatsapp === 1, 'a contagem do CTA sumiu');
    });
});
