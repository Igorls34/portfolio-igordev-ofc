const { describe, it } = require('node:test');
const assert = require('node:assert');

const Core = require('../assets/js/analytics-core.js');

/* Memoria simples no formato da API do Storage, com a mesma falha do Safari
 * privado: getItem funciona, setItem lanca. */
function memoria(inicial) {
    const dados = Object.assign({}, inicial || {});
    return {
        getItem: k => (k in dados ? dados[k] : null),
        setItem: (k, v) => { dados[k] = String(v); },
        removeItem: k => { delete dados[k]; },
        _dados: dados
    };
}

function storageQueLanca() {
    return {
        getItem: () => null,
        setItem: () => { throw new Error('QuotaExceededError'); },
        removeItem: () => { throw new Error('QuotaExceededError'); }
    };
}

describe('consentimento', () => {
    it('padrao e null antes de responder', () => {
        assert.strictEqual(Core.getConsent(memoria()), null);
    });

    it('guarda e recupera granted e denied', () => {
        const s = memoria();
        Core.setConsent(s, 'granted');
        assert.strictEqual(Core.getConsent(s), 'granted');
        Core.setConsent(s, 'denied');
        assert.strictEqual(Core.getConsent(s), 'denied');
    });

    it('trata qualquer valor desconhecido como null, nao como granted', () => {
        /* Se um valor corrompido passasse como granted, coletaríamos sem
         * consentimento -- o pior erro possivel nesta camada. */
        const s = memoria({ igordev_consent: 'talvez' });
        assert.strictEqual(Core.getConsent(s), null);
        assert.strictEqual(Core.shouldLoadAnalytics(Core.getConsent(s)), false);
    });

    it('so granted libera coleta first-party', () => {
        assert.strictEqual(Core.shouldLoadAnalytics('granted'), true);
        assert.strictEqual(Core.shouldLoadAnalytics('denied'), false);
        assert.strictEqual(Core.shouldLoadAnalytics(null), false);
        assert.strictEqual(Core.shouldLoadAnalytics(''), false);
    });

    it('nao quebra quando o storage lanca', () => {
        const s = storageQueLanca();
        assert.strictEqual(Core.setConsent(s, 'granted'), 'granted');
        assert.strictEqual(Core.getConsent(s), null);
    });

    it('so funciona sem storage algum', () => {
        assert.strictEqual(Core.getConsent(null), null);
        assert.strictEqual(Core.setConsent(null, 'granted'), 'granted');
    });

    it('o estado padrao nega os 7 sinais do Consent Mode v2', () => {
        const state = Core.defaultConsentState(500);
        assert.strictEqual(Core.CONSENT_SIGNALS.length, 7);
        Core.CONSENT_SIGNALS.forEach(signal => {
            assert.ok(signal in state, 'faltou o sinal ' + signal);
            assert.strictEqual(state[signal], 'denied', signal + ' deveria estar denied');
        });
        assert.strictEqual(state.wait_for_update, 500);
    });

    it('update concede os 7 sinais de uma vez', () => {
        const up = Core.consentUpdate('granted');
        Core.CONSENT_SIGNALS.forEach(s => assert.strictEqual(up[s], 'granted'));
        const down = Core.consentUpdate('denied');
        Core.CONSENT_SIGNALS.forEach(s => assert.strictEqual(down[s], 'denied'));
    });

    it('qualquer coisa diferente de granted revoga', () => {
        const up = Core.consentUpdate('sim');
        Core.CONSENT_SIGNALS.forEach(s => assert.strictEqual(up[s], 'denied'));
    });
});

describe('flattenParams', () => {
    it('achata objeto aninhado em chave com underscore', () => {
        const out = Core.flattenParams({ device: { platform: 'Win', cores: 8 } });
        assert.deepStrictEqual(out, { device_platform: 'Win', device_cores: 8 });
    });

    it('achata dois niveis', () => {
        const out = Core.flattenParams({ a: { b: { c: 1 } } });
        assert.deepStrictEqual(out, { a_b_c: 1 });
    });

    it('converte camelCase em snake_case, como o GA4 espera', () => {
        assert.deepStrictEqual(Core.flattenParams({ maxScroll: 80 }), { max_scroll: 80 });
    });

    it('descarta null e undefined em vez de mandar string vazia', () => {
        assert.deepStrictEqual(Core.flattenParams({ a: null, b: undefined, c: 1 }), { c: 1 });
    });

    it('preserva false e zero, que sao dados e nao ausencia', () => {
        const out = Core.flattenParams({ ok: false, erros: 0 });
        assert.strictEqual(out.ok, false);
        assert.strictEqual(out.erros, 0);
    });

    it('transforma array em string, porque o GA4 nao aceita array', () => {
        assert.deepStrictEqual(Core.flattenParams({ tags: ['a', 'b'] }), { tags: 'a,b' });
    });

    it('sobrevive a objeto circular, sem estourar a pilha nem devolver objeto', () => {
        /* Um payload malicioso que se referencia a si mesmo nao pode derrubar
         * a pagina -- e o valor de retorno tem de continuar sendo primitivo,
         * porque o GA4 descarta evento com parametro nao-primitivo. */
        const circular = { nome: 'x' };
        circular.eu = circular;

        const out = Core.flattenParams({ circular: circular });
        assert.strictEqual(typeof out, 'object');
        Object.keys(out).forEach(key => {
            assert.notStrictEqual(typeof out[key], 'object',
                'vazou objeto em ' + key + ': ' + out[key]);
        });
        /* E o limite de profundidade tem de valer: nao achata ate o fim. */
        assert.ok(Object.keys(out).length < 20, 'achatou demais: ' + Object.keys(out).length);
    });

    it('limpa caracteres invalidos do nome do parametro', () => {
        assert.deepStrictEqual(Core.flattenParams({ 'meu campo!': 1 }), { meu_campo: 1 });
    });

    it('aceita lista vazia e null', () => {
        assert.deepStrictEqual(Core.flattenParams({}), {});
        assert.deepStrictEqual(Core.flattenParams(null), {});
    });
});

describe('sanitizeValue', () => {
    it('trunca string no limite do GA4 (100)', () => {
        assert.strictEqual(Core.sanitizeValue('a'.repeat(500)).length, 100);
    });

    it('nao quebra com NaN nem Infinity', () => {
        assert.strictEqual(Core.sanitizeValue(NaN), 0);
        assert.strictEqual(Core.sanitizeValue(Infinity), 0);
        assert.strictEqual(Core.sanitizeValue(-Infinity), 0);
    });

    it('mantem booleanos como booleanos', () => {
        assert.strictEqual(Core.sanitizeValue(false), false);
        assert.strictEqual(Core.sanitizeValue(true), true);
    });

    it('transforma null e undefined em string vazia', () => {
        assert.strictEqual(Core.sanitizeValue(null), '');
        assert.strictEqual(Core.sanitizeValue(undefined), '');
    });
});

describe('buildEvent', () => {
    it('monta nome e parametros achatados', () => {
        const ev = Core.buildEvent('cta_click', { kind: 'cta', id: 'repo_x' });
        assert.strictEqual(ev.name, 'cta_click');
        assert.deepStrictEqual(ev.params, { kind: 'cta', id: 'repo_x' });
    });

    it('corta em 25 parametros, o limite do GA4', () => {
        const many = {};
        for (let i = 0; i < 40; i++) many['p' + i] = i;
        const ev = Core.buildEvent('x', many);
        assert.strictEqual(Object.keys(ev.params).length, 25);
    });
});

describe('parseAttribution', () => {
    it('le utm completo', () => {
        const q = '?utm_source=linkedin&utm_medium=social&utm_campaign=lançamento&utm_content=cta';
        const a = Core.parseAttribution(q);
        assert.strictEqual(a.utm_source, 'linkedin');
        assert.strictEqual(a.utm_medium, 'social');
        assert.strictEqual(a.utm_campaign, 'lançamento');
        assert.strictEqual(a.utm_content, 'cta');
    });

    it('le click id do anuncio', () => {
        const a = Core.parseAttribution('?gclid=abc123&fbclid=def456&ttclid=ghi789');
        assert.strictEqual(a.gclid, 'abc123');
        assert.strictEqual(a.fbclid, 'def456');
        assert.strictEqual(a.ttclid, 'ghi789');
    });

    it('descodifica %xx e + dentro de chaves de atribuicao', () => {
        /* parseAttribution e uma allowlist: parametro fora da lista e
         * descartado de proposito, senao a query inteira viraria dado
         * dimensional. E por isso que este teste usa utm_ de verdade. */
        const a = Core.parseAttribution('?utm_source=campanha%20de%20ver%C3%A3o&utm_medium=social+bio');
        assert.strictEqual(a.utm_source, 'campanha de verão');
        assert.strictEqual(a.utm_medium, 'social bio');
    });

    it('descarta parametro fora da allowlist', () => {
        const a = Core.parseAttribution('?senha=secreta&utm_source=x');
        assert.deepStrictEqual(a, { utm_source: 'x' });
    });

    it('ignora parametro que nao é de atribuicao', () => {
        const a = Core.parseAttribution('?senha=secreta&x=1');
        assert.deepStrictEqual(a, {});
    });

    it('so sobrevive string malformada, sem quebrar', () => {
        assert.deepStrictEqual(Core.parseAttribution('?%E0%A4%A=x'), {});
        assert.deepStrictEqual(Core.parseAttribution(''), {});
        assert.deepStrictEqual(Core.parseAttribution(null), {});
    });
});

describe('classifyReferrer', () => {
    const eu = 'igordev-portfolio-ofc.netlify.app';

    it('sem referrer é acesso direto', () => {
        assert.deepStrictEqual(Core.classifyReferrer('', eu),
            { source: 'direct', medium: 'none', host: '' });
    });

    it('mesmo dominio é interno', () => {
        const r = Core.classifyReferrer('https://' + eu + '/x', eu);
        assert.strictEqual(r.source, 'internal');
    });

    it('buscadora é organico', () => {
        assert.strictEqual(Core.classifyReferrer('https://www.google.com.br/', eu).source, 'google');
        assert.strictEqual(Core.classifyReferrer('https://www.google.com.br/', eu).medium, 'organic');
    });

    it('reconhece dominio regional de buscador', () => {
        /* google.com.br e o caso que mais importa aqui: comparar a string
         * inteira classificaria o trafego brasileiro como site desconhecido. */
        const casos = [
            ['https://www.google.com.br/', 'google'],
            ['https://google.pt/', 'google'],
            ['https://www.bing.com.br/', 'bing'],
            ['https://search.yahoo.co.jp/', 'yahoo'],
            ['https://duckduckgo.com/?q=x', 'duckduckgo'],
            ['https://www.ecosia.org/', 'ecosia']
        ];
        casos.forEach(([url, esperado]) => {
            const r = Core.classifyReferrer(url, eu);
            assert.strictEqual(r.source, esperado, url);
            assert.strictEqual(r.medium, 'organic', url);
        });
    });

    it('nao confunde dominio parecido com buscador', () => {
        /* O contra-teste do casamento por rotulo: um site chamado
         * "notgoogle.com" nao e o Google e nao pode virar organico. */
        ['https://notgoogle.com/', 'https://meubing.com.br/', 'https://yahoo.com.br/not-google']
            .forEach(url => {
                assert.notStrictEqual(Core.classifyReferrer(url, eu).source, 'google', url);
            });
    });

    it('rede social é social', () => {
        assert.strictEqual(Core.classifyReferrer('https://www.linkedin.com/feed', eu).source, 'linkedin');
        assert.strictEqual(Core.classifyReferrer('https://l.instagram.com/?u=x', eu).source, 'instagram');
        assert.strictEqual(Core.classifyReferrer('https://t.co/abc', eu).source, 'twitter');
    });

    it('site desconhecido vira referral com o host', () => {
        const r = Core.classifyReferrer('https://blog.aleatorio.com.br/p', eu);
        assert.strictEqual(r.source, 'blog.aleatorio.com.br');
        assert.strictEqual(r.medium, 'referral');
    });

    it('nao quebra com entrada invalida', () => {
        assert.strictEqual(Core.classifyReferrer('nao-e-url', eu).source, 'direct');
        assert.strictEqual(Core.classifyReferrer(null, eu).source, 'direct');
    });
});

describe('stripToPath', () => {
    it('tira dominio, query e hash', () => {
        assert.strictEqual(
            Core.stripToPath('https://exemplo.com/a/b?gclid=1#projetos'), '/a/b');
    });

    it('preserva query de quem nao pediu remocao e usa como esta', () => {
        assert.strictEqual(Core.stripToPath('/privacidade.html?x=1'), '/privacidade.html');
    });

    it('raiz vira barra', () => {
        assert.strictEqual(Core.stripToPath('https://exemplo.com/'), '/');
        assert.strictEqual(Core.stripToPath('https://exemplo.com'), '/');
    });

    it('aceita entrada vazia', () => {
        assert.strictEqual(Core.stripToPath(''), '/');
        assert.strictEqual(Core.stripToPath(null), '/');
    });
});

describe('identificador de visitante', () => {
    it('cria e reaproveita o mesmo id', () => {
        const s = memoria();
        const a = Core.getOrCreateVisitor(s);
        const b = Core.getOrCreateVisitor(s);
        assert.ok(a.id);
        assert.strictEqual(a.id, b.id);
    });

    it('conta visitas', () => {
        const s = memoria();
        assert.strictEqual(Core.getOrCreateVisitor(s).visits, 1);
        assert.strictEqual(Core.getOrCreateVisitor(s).visits, 2);
        assert.strictEqual(Core.getOrCreateVisitor(s).visits, 3);
    });

    it('marca a primeira visita', () => {
        const s = memoria();
        assert.strictEqual(Core.getOrCreateVisitor(s).isNewVisit, true);
        assert.strictEqual(Core.getOrCreateVisitor(s).isNewVisit, false);
    });

    it('devolve null quando o storage lanca, em vez de quebrar a pagina', () => {
        assert.strictEqual(Core.getOrCreateVisitor(storageQueLanca()), null);
        assert.strictEqual(Core.getOrCreateVisitor(null), null);
    });

    it('ignora metadata corrompida em vez de falhar', () => {
        const s = memoria({ igordev_vmeta: '{quebrado' });
        const v = Core.getOrCreateVisitor(s);
        assert.ok(v && v.id, 'deveria se recuperar de metadata invalida');
        assert.strictEqual(v.visits, 1);
    });

    it('id tem 32 hex', () => {
        const id = Core.randomId(() => 0.5);
        assert.match(id, /^[0-9a-f]{32}$/);
    });

    it('dias desde a primeira visita', () => {
        const agora = Date.now();
        assert.strictEqual(Core.daysSince(agora, agora), 0);
        assert.strictEqual(Core.daysSince(agora - 3 * 86400000, agora), 3);
        /* Relogio andando para tras nao pode dar negativo. */
        assert.strictEqual(Core.daysSince(agora + 86400000, agora), 0);
        assert.strictEqual(Core.daysSince(null, agora), null);
    });
});

describe('marcador de rolagem', () => {
    it('dispara cada marco uma vez so', () => {
        const t = Core.newScrollTracker();
        assert.deepStrictEqual(t.check(10), []);
        assert.deepStrictEqual(t.check(30), [25]);
        assert.deepStrictEqual(t.check(60), [50]);
        /* Passar de novo por 50 nao repete: senao um scroll longo geraria
         * dezenas de eventos identicos. */
        assert.deepStrictEqual(t.check(80), [75]);
        assert.deepStrictEqual(t.check(40), []);
    });

    it('pula varios marcos de uma vez', () => {
        const t = Core.newScrollTracker();
        assert.deepStrictEqual(t.check(100), [25, 50, 75, 90, 100]);
    });

    it('ignora valor invalido', () => {
        const t = Core.newScrollTracker();
        assert.deepStrictEqual(t.check(NaN), []);
        assert.deepStrictEqual(t.check('50'), []);
    });

    it('highest devolve o maior marco ja atingido', () => {
        const t = Core.newScrollTracker();
        t.check(60);
        assert.strictEqual(t.highest(), 50);
        t.check(100);
        assert.strictEqual(t.highest(), 100);
    });
});

describe('clampDelta', () => {
    it('descarta negativo e limita absurdamente grande', () => {
        assert.strictEqual(Core.clampDelta(-500), 0);
        assert.strictEqual(Core.clampDelta(999999999), 86400000);
    });

    it('arredonda e tolera invalido', () => {
        assert.strictEqual(Core.clampDelta(1500.6), 1501);
        assert.strictEqual(Core.clampDelta(NaN), 0);
        assert.strictEqual(Core.clampDelta(null), 0);
    });
});

describe('summarizeFunnel', () => {
    it('resume o funil completo', () => {
        const evs = [
            { name: 'form_start' },
            { name: 'form_field_focus', params: { field: 'name' } },
            { name: 'form_field_filled', params: { field: 'name' } },
            { name: 'form_field_focus', params: { field: 'email' } },
            { name: 'form_field_filled', params: { field: 'email' } },
            { name: 'form_field_focus', params: { field: 'phone' } },
            { name: 'form_field_filled', params: { field: 'phone' } },
            { name: 'form_field_focus', params: { field: 'message' } },
            { name: 'form_submit', params: { ok: true } }
        ];
        const f = Core.summarizeFunnel(evs);
        assert.strictEqual(f.starts, 1);
        assert.strictEqual(f.submits, 1);
        assert.strictEqual(f.submitOk, 1);
        assert.strictEqual(f.completionRate, 100);
        f.steps.forEach(s => assert.strictEqual(s.lostHere, false, s.field + ' nao deveria ter perdido'));
    });

    it('aponta o campo onde a pessoa parou', () => {
        /* Alguem chegou no telefone e foi embora. E a informacao que diz se o
         * campo obrigatorio de telefone esta custando conversao. */
        const f = Core.summarizeFunnel([
            { name: 'form_start' },
            { name: 'form_field_focus', params: { field: 'name' } },
            { name: 'form_field_focus', params: { field: 'email' } },
            { name: 'form_field_focus', params: { field: 'phone' } }
        ]);
        const perdido = f.steps.filter(s => s.lostHere);
        assert.strictEqual(perdido.length, 1);
        assert.strictEqual(perdido[0].field, 'phone');
        assert.strictEqual(f.completionRate, 0);
    });

    it('conta erros por campo', () => {
        const f = Core.summarizeFunnel([
            { name: 'form_field_focus', params: { field: 'phone' } },
            { name: 'form_field_error', params: { field: 'phone', reason: 'vazio' } },
            { name: 'form_field_error', params: { field: 'phone', reason: 'vazio' } }
        ]);
        const phone = f.steps.find(s => s.field === 'phone');
        assert.strictEqual(phone.errors, 2);
    });

    it('so conta submit como ok quando ok e verdadeiro', () => {
        /* Duas pessoas comecaram, duas enviaram, uma deu certo. 50%. */
        const f = Core.summarizeFunnel([
            { name: 'form_start' },
            { name: 'form_field_focus', params: { field: 'name' } },
            { name: 'form_submit', params: { ok: false } },
            { name: 'form_start' },
            { name: 'form_field_focus', params: { field: 'name' } },
            { name: 'form_submit', params: { ok: true } }
        ]);
        assert.strictEqual(f.starts, 2);
        assert.strictEqual(f.submits, 2);
        assert.strictEqual(f.submitOk, 1);
        assert.strictEqual(f.completionRate, 50);
    });

    it('devolve zero, sem quebrar, com entrada vazia ou invalida', () => {
        assert.strictEqual(Core.summarizeFunnel([]).starts, 0);
        assert.strictEqual(Core.summarizeFunnel(null).starts, 0);
        assert.strictEqual(Core.summarizeFunnel([null, undefined, {}]).starts, 0);
    });

    it('ignora campo fora do formulario', () => {
        const f = Core.summarizeFunnel([
            { name: 'form_field_focus', params: { field: 'website' } }
        ]);
        assert.strictEqual(f.steps.filter(s => s.focused > 0).length, 0);
    });

    it('tem um passo por campo, na ordem do formulario', () => {
        const f = Core.summarizeFunnel([]);
        assert.deepStrictEqual(f.steps.map(s => s.field), Core.FORM_FIELDS);
        assert.deepStrictEqual(f.steps.map(s => s.step), [1, 2, 3, 4]);
    });
});

describe('funnelStepOf', () => {
    it('numeracao comeca em 1', () => {
        assert.strictEqual(Core.funnelStepOf('name'), 1);
        assert.strictEqual(Core.funnelStepOf('message'), 4);
    });

    it('devolve -1 para campo desconhecido', () => {
        assert.strictEqual(Core.funnelStepOf('website'), -1);
        assert.strictEqual(Core.funnelStepOf(''), -1);
    });
});
