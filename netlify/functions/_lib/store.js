/* Acesso ao armazenamento dos eventos.
 *
 * Usa Netlify Blobs, que nao exige banco nem plano pago. O ponto importante
 * deste arquivo e o fallback: se o ambiente nao estiver configurado -- em dev
 * local, num clone, no preview sem setup -- as funcoes continuam respondendo
 * e apenas nao guardam nada.
 *
 * A razao de nao quebrar e o conteudo do dado: quem chama e o navegador da
 * pessoa, num canal de telemetria. Se a gravacao falhar, o site tem de
 * continuar funcionando e o evento se perde. O oposto (devolver 500 e fazer o
 * navegador repetir, travar a fila, etc.) seria um sensor de analytics virar
 * problema do site.
 */

const STORE_NAME = 'analytics';
const PREFIX = 'events-';
const EXT = '.jsonl';

/* 24 meses, o prazo declarado na politica de privacidade. Um blob por dia
 * Some depois disso, entao o historico nao cresce sem limite. */
const RETENTION_DAYS = 730;

let store = null;
let storeChecked = false;

async function getStore() {
    if (storeChecked) return store;
    storeChecked = true;
    if (!process.env.NETLIFY_BLOBS_CONTEXT) {
        /* Ausente a variavel de ambiente. O site roda, so nao persiste. */
        return null;
    }
    try {
        /* Import dinamico: se a dependencia nao estiver instalada, so este
         * arquivo quebra -- e ainda assim com try/catch. */
        const { getStore: criar } = await import('@netlify/blobs');
        /* A API da biblioteca e getStore(nome). Nao existe construtor nem
         * classe exportada. */
        store = criar(STORE_NAME);
        return store;
    } catch (err) {
        console.warn('[store] @netlify/blobs indisponivel:', err && err.message);
        return null;
    }
}

export function storeEnabled() {
    return !!process.env.NETLIFY_BLOBS_CONTEXT;
}

/* Os eventos sao pequenos e regulares; guardar como JSON lines num unico
 * blob por dia e o suficiente para um portfolio e nao custa query.
 *
 * JSON lines e nao JSON: o append le o texto, acrescenta uma linha e regrava
 * o blob inteiro. Um array JSON exigiria reescrever e reparsear tudo, e o
 * formato de texto deixa a leitura tolerante a uma linha corrompida no meio
 * do arquivo. */
function dayKey(ts) {
    const d = new Date(ts);
    const y = d.getUTCFullYear();
    const m = String(d.getUTCMonth() + 1).padStart(2, '0');
    const day = String(d.getUTCDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
}

function blobKey(day) {
    return PREFIX + day + EXT;
}

function diaDaChave(key) {
    return key.slice(PREFIX.length, key.length - EXT.length);
}

/* Converte o texto do blob em registros. Uma linha corrompida -- que pode
 * acontecer se um processo morreu no meio de uma escrita -- e pulada em vez
 * de derrubar a leitura do dia inteiro. */
function parseLines(texto) {
    if (!texto) return [];
    const linhas = String(texto).split('\n');
    const saida = [];
    let ruins = 0;
    for (const linha of linhas) {
        if (!linha.trim()) continue;
        try {
            saida.push(JSON.parse(linha));
        } catch (err) {
            ruins++;
        }
    }
    if (ruins) console.warn('[store] ignoradas', ruins, 'linhas corrompidas');
    return saida;
}

export async function append(records) {
    const blobs = await getStore();
    if (!blobs) return { stored: false, reason: 'store-off' };
    if (!records || !records.length) return { stored: false, reason: 'vazio' };

    const byDay = {};
    records.forEach(rec => {
        const key = dayKey(rec.t);
        (byDay[key] = byDay[key] || []).push(rec);
    });

    let written = 0;
    for (const [day, rows] of Object.entries(byDay)) {
        const key = blobKey(day);
        try {
            const existente = await blobs.get(key, { type: 'text' });
            const anterior = parseLines(existente);
            const novo = anterior.concat(rows).map(r => JSON.stringify(r)).join('\n');
            /* set() e nao setJSON(): o conteudo ja e texto, e passar pelo
             * JSONSerializaria cada linha duas vezes. */
            await blobs.set(key, novo);
            written += rows.length;
        } catch (err) {
            console.warn('[store] falha ao gravar', day, err && err.message);
        }
    }
    return { stored: written > 0, written: written };
}

export async function readDay(day) {
    const blobs = await getStore();
    if (!blobs) return [];
    try {
        return parseLines(await blobs.get(blobKey(day), { type: 'text' }));
    } catch (err) {
        return [];
    }
}

export async function listDays(limit) {
    const blobs = await getStore();
    if (!blobs) return [];
    try {
        /* list() devolve um objeto { blobs: [{ key }] }, e nao um iterador.
         * Usar for await aqui falharia em tempo de execucao. */
        const { blobs: itens } = await blobs.list({ prefix: PREFIX });
        const chaves = (itens || []).map(i => i.key).filter(Boolean);
        /* Mais recente primeiro: o painel quer os ultimos dias, nao os
         * primeiros. */
        return chaves.sort().reverse().slice(0, limit || 30);
    } catch (err) {
        return [];
    }
}

/* Apaga os dias que passaram da retencao.
 *
 * Rodar no primeiro append do dia e nao por agenda: e o unico momento em que
 * ja existe uma instancia viva com permissao de escrita, sem depender de
 * cron ou de alguem lembrar de limpar. */
export async function purgeOlderThan(limiteDias) {
    const blobs = await getStore();
    if (!blobs) return { removed: 0 };

    try {
        const { blobs: itens } = await blobs.list({ prefix: PREFIX });
        const chaves = (itens || []).map(i => i.key);
        const alvos = chaves.filter(k => diaDaChave(k) && diaDaChave(k) < limiteDias);
        let removed = 0;
        for (const key of alvos) {
            try {
                await blobs.delete(key);
                removed++;
            } catch (err) {
                /* Um dia que nao apaga nao impede os outros de sairem. */
            }
        }
        if (removed) console.log('[store] retencao: removidos', removed, 'dias');
        return { removed: removed };
    } catch (err) {
        return { removed: 0 };
    }
}

export function retentionDays() {
    return RETENTION_DAYS;
}

export function jaPurgouHoje() {
    /* Uma vez por dia e suficiente. Chaveado no proprio storage significa que
     * funciona em qualquer instancia, sem estado em memoria que a serverless
     * perde a cada invocacao. */
    return process.env.__ANALYTICS_PURGED_DAY === dayKey(Date.now());
}

export function marcaPurgado() {
    process.env.__ANALYTICS_PURGED_DAY = dayKey(Date.now());
}

export { dayKey, blobKey, diaDaChave, parseLines };
