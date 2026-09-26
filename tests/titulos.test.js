const fs = require('node:fs');
const path = require('node:path');
const { describe, it } = require('node:test');
const assert = require('node:assert');

const core = require('../assets/js/core.js');

const INDEX = path.join(__dirname, '..', 'index.html');
const html = fs.readFileSync(INDEX, 'utf8');

/* Os 5 titulos animados do site, com o innerHTML exato que o index.html
 * tem hoje. Reproduzidos a mao, mas conferidos contra o arquivo pelos testes
 * do fim deste bloco. */
const TITULOS = [
    { sel: 'hero-title', partes: 'Inova\u00e7\u00e3o em cada <em class="hl">Pixel.</em>', texto: 'Inova\u00e7\u00e3o em cada Pixel.', destaque: ['Pixel.'] },
    { sel: 'text-reveal', partes: 'Focado em <em class="hl">Resultados</em> <em class="hl">Reais</em>', texto: 'Focado em Resultados Reais', destaque: ['Resultados', 'Reais'] },
    { sel: 'section-title', partes: 'Habilidades <em class="hl">Estrat\u00e9gicas</em>', texto: 'Habilidades Estrat\u00e9gicas', destaque: ['Estrat\u00e9gicas'] },
    // Destaque com varias palavras vira varias palavras marcadas, uma por
    // palavra, que e o que a animacao precisa para escalar o atraso.
    { sel: 'section-title', partes: 'Projetos <em class="hl">em Destaque</em>', texto: 'Projetos em Destaque', destaque: ['em', 'Destaque'] },
    { sel: 'text-reveal', partes: 'Vamos <em class="hl">Conectar?</em>', texto: 'Vamos Conectar?', destaque: ['Conectar?'] }
];

/* Regressao do bug que foi para producao: o parser casava /<em>/ exato,
 * e o site usa <em class="hl">. Nao casando, o innerHTML inteiro virava
 * palavra e o titulo aparecia na tela escrito
 * "Inova\u00e7\u00e3o em cada <em class=""hl"">Pixel.</em>". Os testes passavam
 * porque usavam <em> sem atributo, ou seja, testavam um HTML que o site nao
 * tem. Aqui o input e o do site. */
describe('parseHighlightTitle com o HTML real do site', () => {
    it('extrai o texto e o destaque de <em class="hl">', () => {
        const parts = core.parseHighlightTitle('Inova\u00e7\u00e3o em cada <em class="hl">Pixel.</em>');
        assert.deepStrictEqual(parts.map(p => p.text), ['Inova\u00e7\u00e3o em cada ', 'Pixel.']);
        assert.deepStrictEqual(parts.map(p => p.highlight), [false, true]);
    });

    it('nunca deixa um caractere de tag escapar para o texto', () => {
        TITULOS.forEach(t => {
            const words = core.buildRevealWords(core.parseHighlightTitle(t.partes), 0.07);
            const comTag = words.filter(w => /[<>]/.test(w.word));
            assert.deepStrictEqual(
                comTag.map(w => w.word), [],
                t.partes + ' -> vazou tag: ' + comTag.map(w => w.word).join(' ')
            );
        });
    });

    it('monta exatamente o texto que o visitante deve ler', () => {
        TITULOS.forEach(t => {
            const words = core.buildRevealWords(core.parseHighlightTitle(t.partes), 0.07);
            assert.strictEqual(words.map(w => w.word).join(' '), t.texto);
        });
    });

    it('marca exatamente as palavras destacadas, na ordem', () => {
        TITULOS.forEach(t => {
            const words = core.buildRevealWords(core.parseHighlightTitle(t.partes), 0.07);
            const marcados = words.filter(w => w.highlight).map(w => w.word);
            assert.deepStrictEqual(marcados, t.destaque);
        });
    });

    it('preserva todas as palavras, sem perder nem duplicar', () => {
        TITULOS.forEach(t => {
            const words = core.buildRevealWords(core.parseHighlightTitle(t.partes), 0.07);
            assert.strictEqual(words.map(w => w.word).join(' '), t.texto,
                'contagem de palavras divergiu');
        });
    });

    it('ainda aceita <em> e <span> sem atributo, e com outros atributos', () => {
        const esperado = [{ text: 'Oi', highlight: true }];
        assert.deepStrictEqual(core.parseHighlightTitle('<em>Oi</em>'), esperado);
        assert.deepStrictEqual(core.parseHighlightTitle('<em class="hl">Oi</em>'), esperado);
        assert.deepStrictEqual(core.parseHighlightTitle('<em id="x" data-y="z">Oi</em>'), esperado);
        assert.deepStrictEqual(core.parseHighlightTitle('<em class="hl" >Oi</em>'), esperado);
        assert.deepStrictEqual(core.parseHighlightTitle('<span>Oi</span>'), esperado);
    });

    it('nao carrega estado de uma chamada para a outra', () => {
        // O regex com /g guarda lastIndex. Se fosse um objeto so, compartilhado
        // entre chamadas, a segunda leitura comecaria no meio e perderia texto.
        const a = core.parseHighlightTitle('Projetos <em class="hl">em Destaque</em>');
        const b = core.parseHighlightTitle('Projetos <em class="hl">em Destaque</em>');
        const c = core.parseHighlightTitle('Projetos <em class="hl">em Destaque</em>');
        assert.deepStrictEqual(a, b);
        assert.deepStrictEqual(b, c);
        assert.strictEqual(b[0].text, 'Projetos ');
    });

    it('ignora tag solta, sem par', () => {
        // Uma <em> nao fechada nao pode fazer o parser comer o resto.
        const parts = core.parseHighlightTitle('So <em class="hl">aberto');
        assert.ok(parts.length >= 1);
        assert.ok(!core.buildRevealWords(parts, 0.07).some(w => /[<>]/.test(w.word)));
    });
});

/* Le o index.html de verdade. E o teste que impede o HTML e o parser de saírem
 * de sincronia: se alguem trocar <em class="hl"> por outra coisa, ou inventar
 * um destaque que o parser nao entende, isso aqui quebra. */
describe('os titulos do index.html', () => {
    const encontrados = [...html.matchAll(
        /<h[1-6]\s+class="(hero-title|section-title|text-reveal)"[^>]*>([\s\S]*?)<\/h[1-6]>/g
    )].map(m => ({ sel: m[1], partes: m[2].replace(/\s+/g, ' ').trim() }));

    it('ha pelo menos um titulo animado', () => {
        assert.ok(encontrados.length > 0, 'nenhum .hero-title/.section-title/.text-reveal no index.html');
    });

    it('sao exatamente os cinco esperados', () => {
        assert.strictEqual(encontrados.length, TITULOS.length,
            'encontrados: ' + encontrados.map(e => e.partes).join(' | '));
    });

    encontrados.forEach((achado, i) => {
        it('titulo ' + (i + 1) + ' nao vaza HTML: ' + achado.partes, () => {
            const words = core.buildRevealWords(core.parseHighlightTitle(achado.partes), 0.07);
            const comTag = words.filter(w => /[<>]/.test(w.word));
            assert.deepStrictEqual(comTag.map(w => w.word), [],
                'o titulo apareceria na tela com o HTML escrito dentro');
        });

        it('titulo ' + (i + 1) + ' produz o texto esperado: ' + TITULOS[i].texto, () => {
            const words = core.buildRevealWords(core.parseHighlightTitle(achado.partes), 0.07);
            assert.strictEqual(words.map(w => w.word).join(' '), TITULOS[i].texto);
        });
    });

    it('todo destaque do site usa a classe que o parser entende', () => {
        // Se um titulo usar <mark> ou <strong> o parser nao marca nada e o
        // estilo .hl nao e aplicado. Aqui isso aparece como destaque vazio.
        encontrados.forEach(e => {
            const partes = core.parseHighlightTitle(e.partes);
            const temTagVisual = /<(em|span)\b/i.test(e.partes);
            const temDestaque = partes.some(p => p.highlight);
            assert.strictEqual(temDestaque, temTagVisual,
                e.partes + ' tem tag de destaque mas o parser nao marcou');
        });
    });
});
