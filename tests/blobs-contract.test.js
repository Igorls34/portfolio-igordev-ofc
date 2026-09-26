const { describe, it } = require('node:test');
const assert = require('node:assert');
const path = require('node:path');
const fs = require('node:fs');
const { getStore } = require('@netlify/blobs');

/* Contrato com o SDK instalado.
 *
 * Os outros testes trocam o storage por um substituto em memoria, o que os
 * torna fortes para a agregacao e cegos para a biblioteca. A primeira versao
 * do store usava `new Blobs(nome)`, `get(key, { type: 'jsonl' })`,
 * `setJSONL()` e `for await (... de blobs.list())` -- nenhuma dessas existe no
 * SDK. Tudo caia dentro de um try/catch que devolveva `stored: false`, entao o
 * painel ficaria vazio em producao e os testes de memoria continuariam
 * verdes.
 *
 * Estes testes nao executam nada: eles conferem que cada metodo e cada opcao
 * usados pelo store existe de fato na versao instalada. */

const STORE_SRC = fs.readFileSync(
    path.join(__dirname, '..', 'netlify', 'functions', '_lib', 'store.js'), 'utf8');

/* Uma instancia real, com credenciais ficticias: construir o objeto nao fala
 * com a rede, so valida a forma da chamada. */
const store = getStore('contrato', { siteID: 'ficticio', token: 'ficticio' });

describe('a API do @netlify/blobs', () => {
    it('exporta getStore, e nao um construtor', () => {
        assert.strictEqual(typeof getStore, 'function', 'getStore sumiu do SDK');
        const mod = require('@netlify/blobs');
        assert.strictEqual(mod.Blobs, undefined,
            'o SDK expoe Blobs de novo; reveja o store.js');
    });

    it('tem os metodos que o store usa', () => {
        ['get', 'set', 'delete', 'list'].forEach(metodo => {
            assert.strictEqual(typeof store[metodo], 'function',
                'store.' + metodo + '() nao existe no SDK instalado');
        });
    });

    it('nao tem os metodos inventados na primeira versao', () => {
        ['setJSONL', 'append', 'push'].forEach(metodo => {
            assert.strictEqual(store[metodo], undefined,
                'store.' + metodo + '() reapareceu no SDK; reveja o store.js');
        });
    });

    it('aceita apenas os tipos de get que o SDK declara', () => {
        /* type: 'jsonl' foi o erro original. A lista real vem das
         * sobrecargas do metodo get. */
        const dts = fs.readFileSync(
            path.join(__dirname, '..', 'node_modules', '@netlify', 'blobs', 'dist', 'main.d.ts'),
            'utf8');
        const tipos = [...dts.matchAll(/type\?:\s*'([a-zA-Z]+)'/g)].map(m => m[1]);
        assert.ok(tipos.length > 0, 'nao consegui ler os tipos de get do SDK');
        assert.ok(tipos.includes('text'), 'o SDK nao declara o tipo text');
        assert.ok(!tipos.includes('jsonl'), 'o SDK passou a aceitar jsonl');
        assert.ok(!/type:\s*'jsonl'/.test(STORE_SRC), 'o store ainda pede type jsonl');
    });

    it('list devolve um objeto, e nao um iterador', () => {
        const dts = fs.readFileSync(
            path.join(__dirname, '..', 'node_modules', '@netlify', 'blobs', 'dist', 'main.d.ts'),
            'utf8');
        /* A sobrecarga padrao de list() retorna Promise<ListResult>. */
        assert.ok(/list\(options\?[^)]*\):\s*Promise<ListResult>/.test(dts),
            'a assinatura de list() mudou; reveja o store.js');
        assert.ok(/interface ListResult\s*\{[\s\S]*?blobs:\s*ListResultBlob\[\]/.test(dts),
            'ListResult nao tem mais .blobs');
        assert.ok(!/for\s+await\s*\([^)]*blobs\.list\(/.test(STORE_SRC),
            'o store ainda faz for await em list()');
        assert.ok(!/for\s+await\s*\([^)]*\.list\(/.test(STORE_SRC),
            'o store ainda faz for await em list()');
    });

    it('o store usa o prefixo que ele mesmo escreve', () => {
        const lista = STORE_SRC.slice(STORE_SRC.indexOf('export async function listDays'));
        assert.ok(/prefix:\s*PREFIX/.test(lista),
            'listDays nao filtra pelo prefixo, entao traria chaves de outros tipos');
    });
});

describe('o armazenamento e append-only em texto', () => {
    it('parseia uma linha por evento', () => {
        /* O formato em disco tem que sobreviver a round-trip. */
        const registros = [
            { t: 1700000000000, s: 's1', e: 'page_view', p: { title: 'Portifolio' } },
            { t: 1700000000001, s: 's1', e: 'scroll_depth', p: { depth: 75 } }
        ];
        const texto = registros.map(r => JSON.stringify(r)).join('\n');
        const volta = texto.split('\n').map(l => JSON.parse(l));
        assert.strictEqual(volta.length, 2);
        assert.strictEqual(volta[1].p.depth, 75);
    });

    it('pula linha corrompida sem perder o resto do dia', () => {
        /* Um processo morto no meio da escrita deixa meia linha. Perder o dia
         * inteiro por causa de uma linha seria pior do que perder a linha. */
        const texto = [
            JSON.stringify({ e: 'page_view' }),
            '{"e":"scroll_dep',
            JSON.stringify({ e: 'copy' })
        ].join('\n');
        const saida = texto.split('\n')
            .filter(Boolean)
            .map(l => { try { return JSON.parse(l); } catch (err) { return null; } })
            .filter(Boolean);
        assert.strictEqual(saida.length, 2);
    });

    it('a retencao declarada bate com a politica', () => {
        const politica = fs.readFileSync(
            path.join(__dirname, '..', 'privacidade.html'), 'utf8');
        const dias = Number(/RETENTION_DAYS\s*=\s*(\d+)/.exec(STORE_SRC)[1]);
        assert.strictEqual(dias, 730, 'a retencao do codigo mudou');
        /* 730 dias e 24 meses. Se um mudar, o outro tem que mudar junto. */
        assert.ok(politica.includes('24 meses'),
            'a politica nao menciona mais 24 meses');
    });
});
