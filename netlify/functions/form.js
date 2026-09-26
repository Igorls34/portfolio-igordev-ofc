/* POST /api/form
 *
 * Registro das submissoes do formulario de contato.
 *
 * Por que existe: o formulario envia direto para os bots de WhatsApp e e-mail
 * (assets/js/script.js) e nao ha gravacao em lugar nenhum. Se voce nao estiver
 * olhando o WhatsApp no instante do envio, o lead simplesmente nao existe.
 * Esta funcao e o canal duravel -- e ela nao substitui o envio, apenas
 * registra o que foi tentado.
 *
 * O que NAO e guardado por padrao: nome, e-mail, telefone e o texto da
 * mensagem. Aqui fica so a metrica do envio (horario, tempo de preenchimento,
 * canal que respondeu, origem, pais). O motivo e o mesmo do IP em collect.js:
 * o painel precisa de "quantas pessoas preencheram e em quanto tempo", e isso
 * nao exige o conteudo. Guardar o texto da mensagem cria base de dado de
 * dado de terceiro sem nenhuma analise que a justifique.
 *
 * Para guardar o conteudo de verdade, defina ANALYTICS_STORE_LEADS=1 no
 * ambiente da Netlify. Aí o painel mostra nome, e-mail e telefone, e a
 * politica de privacidade precisa passar a descrever esse armazenamento.
 *
 * Esta funcao nunca impede o envio: o cliente trata falha aqui como telemetria
 * perdida, e o formulario ja foi resolvido antes do fetch sair.
 */

import { append } from './_lib/store.js';
import { isBot } from './_lib/shared.js';

const MAX_BODY_BYTES = 16 * 1024;

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

function storeLeads() {
    return String(process.env.ANALYTICS_STORE_LEADS || '').toLowerCase() === 'true'
        || process.env.ANALYTICS_STORE_LEADS === '1';
}

export default async function handler(req, context) {
    if (req.method !== 'POST') return json(405, { error: 'method-not-allowed' });

    const declared = Number(req.headers['content-length'] || 0);
    if (declared && declared > MAX_BODY_BYTES) return json(413, { error: 'payload-grande' });

    let payload;
    try {
        payload = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
    } catch (err) {
        return json(400, { error: 'json-invalido' });
    }
    if (!payload || typeof payload !== 'object') return json(400, { error: 'formato-inesperado' });

    const geo = (context && context.geo) || {};
    const keepContent = storeLeads();

    /* Mesmo formato de registro de collect.js, de proposito.
     *
     * A primeira versao escrevia o envio de um jeito proprio (kind no topo,
     * country no topo) e o painel nunca contou esses registros, porque a
     * agregacao so olhava rec.e.
     *
     * O nome do evento e form_record, e nao form_submit, porque o navegador
     * ja manda form_submit pelo caminho de medicao. Usar o mesmo nome
     * contaria o mesmo envio duas vezes no painel: uma como metrica e outra
     * como registro duravel. Aqui o papel e outro -- este registro e o
     * historico de contatos, nao uma metrica de UX. */
    const record = {
        t: Number(payload.ts) || Date.now(),
        s: String(payload.sid || '').slice(0, 40),
        e: 'form_record',
        p: {
            /* So "qual canal respondeu". O nome e o valor sao de terceiro. */
            channels: String(payload.channels || '').slice(0, 40),
            elapsed_ms: Number(payload.elapsed_ms) || 0,
            path: String(payload.path || '').slice(0, 120),
            utm: payload.attribution && typeof payload.attribution === 'object'
                ? payload.attribution : {}
        },
        d: {
            ts: Number(payload.ts) || Date.now(),
            country: typeof geo.country === 'string' ? geo.country.slice(0, 2).toUpperCase() : '',
            region: typeof geo.subdivision === 'string' ? geo.subdivision.slice(0, 3).toUpperCase() : '',
            bot: isBot(req.headers['user-agent'] || ''),
            page: String(payload.path || '').slice(0, 200)
        }
    };

    if (keepContent && payload.lead && typeof payload.lead === 'object') {
        const trim = (v, n) => String(v || '').slice(0, n);
        record.p.lead = {
            name: trim(payload.lead.name, 80),
            email: trim(payload.lead.email, 120),
            phone: trim(payload.lead.phone, 20),
            message: trim(payload.lead.message, 2000)
        };
    }

    let result;
    try {
        result = await append([record]);
    } catch (err) {
        return json(204, { stored: false });
    }
    return json(result.stored ? 202 : 204, {
        stored: result.stored,
        withContent: keepContent
    });
}
