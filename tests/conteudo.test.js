const fs = require('node:fs');
const { existsSync } = require('node:fs');
const path = require('node:path');
const url = require('node:url');
const { describe, it, before } = require('node:test');
const assert = require('node:assert');

const ROOT = path.join(__dirname, '..');

const JSON_PATH = path.join(ROOT, 'data', 'portfolio.json');
const INDEX = path.join(ROOT, 'index.html');

const dados = JSON.parse(fs.readFileSync(JSON_PATH, 'utf8'));
const html = fs.readFileSync(INDEX, 'utf8');

/* O gerador e .mjs e o package.json nao declara "type": "module" -- os testes
 * de browser sao CommonJS de proposito. Importar por URL resolve os dois.
 *
 * Importar o modulo executa o arquivo inteiro, entao o guard de main() importa:
 * ele so roda a escrita quando o processo e o proprio script. Sem esse guard,
 * o simples import reescreveria o index.html no meio da suite. */
let gerarHtml;
before(async () => {
    const mod = await import(
        url.pathToFileURL(path.join(ROOT, 'scripts', 'gerar-conteudo.mjs')).href);
    gerarHtml = mod.gerarHtml;
});

/* ---------- O JSON e uma fonte valida ---------- */

describe('data/portfolio.json', () => {
    it('e um JSON valido com as duas chaves que o site consome', () => {
        assert.ok(Array.isArray(dados.skills), '"skills" ausente ou nao e lista');
        assert.ok(Array.isArray(dados.projects), '"projects" ausente ou nao e lista');
    });

    it('cada habilidade tem icone, titulo e descricao', () => {
        dados.skills.forEach(s => {
            assert.ok(s.icon, 'habilidade sem icone');
            assert.ok(s.title, 'habilidade sem titulo');
            assert.ok(s.description, 'habilidade sem descricao');
        });
    });

    it('cada projeto tem id, titulo, descricao e ao menos um link', () => {
        dados.projects.forEach(p => {
            assert.ok(p.id, 'projeto sem id');
            assert.ok(p.title, p.id + ' sem titulo');
            assert.ok(p.description, p.id + ' sem descricao');
            assert.ok(Array.isArray(p.links) && p.links.length, p.id + ' sem link');
            p.links.forEach(l => {
                assert.ok(l.href && l.href.startsWith('https://'),
                    p.id + ' com link que nao e https: ' + l.href);
                assert.ok(l.label, p.id + ' com link sem texto');
                assert.ok(l.track, p.id + ' com link sem data-track');
            });
        });
    });

    it('nao repete id de projeto, que o painel de metricas somaria em dobro', () => {
        const ids = dados.projects.map(p => p.id);
        assert.strictEqual(new Set(ids).size, ids.length, 'id repetido: ' + ids.join(', '));
    });

    it('nao repete data-track, que separaria um projeto do outro', () => {
        const tracks = dados.projects.flatMap(p => p.links.map(l => l.track));
        assert.strictEqual(new Set(tracks).size, tracks.length,
            'track repetido: ' + tracks.join(', '));
    });

    it('nao usa icone de Font Awesome desconhecido', () => {
        /* O site carrega Font Awesome por CDN. Um "fa-brands fa-inventado"
         * renderiza um quadrado vazio, e nada no build falha. */
        dados.skills.forEach(s => {
            assert.ok(/^fa-(solid|brands|regular) fa-[a-z0-9-]+$/.test(s.icon),
                'icone fora do padrao: ' + s.icon);
        });
        dados.projects.forEach(p => {
            assert.ok(/^fa-(solid|brands|regular) fa-[a-z0-9-]+$/.test(p.icon),
                p.id + ' com icone fora do padrao: ' + p.icon);
        });
    });
});

/* ---------- O HTML gerado ---------- */

describe('HTML gerado a partir do JSON', () => {
    it('o index.html tem um card por habilidade do JSON', () => {
        /* Este e o teste que amarra as duas pontas: se o JSON ganhar uma
         * habilidade e o HTML nao ganhar o card, o site mente sobre o que
         * sabe fazer. */
        const cards = html.match(/<div class="skill-item[^"]*">/g) || [];
        assert.strictEqual(cards.length, dados.skills.length,
            'JSON tem ' + dados.skills.length + ' habilidade(s) e o HTML tem ' + cards.length);
    });

    it('o index.html tem um card por projeto do JSON', () => {
        const cards = html.match(/<div class="project-card[^"]*"/g) || [];
        assert.strictEqual(cards.length, dados.projects.length,
            'JSON tem ' + dados.projects.length + ' projeto(s) e o HTML tem ' + cards.length);
    });

    it('o texto de cada habilidade do JSON aparece no HTML', () => {
        dados.skills.forEach(s => {
            /* O "&" e escapado no HTML: "APIs & Cloud" vira "APIs &amp; Cloud". */
            const titulo = s.title.replace(/&/g, '&amp;');
            assert.ok(html.includes('>' + titulo + '<'),
                'titulo ausente no HTML: ' + s.title);
            assert.ok(html.includes(s.description),
                'descricao ausente no HTML: ' + s.title);
        });
    });

    it('o texto de cada projeto do JSON aparece no HTML', () => {
        dados.projects.forEach(p => {
            assert.ok(html.includes('>' + p.title.replace(/&/g, '&amp;') + '<'),
                'titulo ausente no HTML: ' + p.title);
            assert.ok(html.includes(p.description),
                'descricao ausente no HTML: ' + p.title);
            p.techs.forEach(t => {
                assert.ok(html.includes('<span>' + t + '</span>'),
                    'tecnologia ausente no HTML: ' + t);
            });
        });
    });

    it('cada card de projeto leva o data-track derivado do id', () => {
        dados.projects.forEach(p => {
            assert.ok(html.includes('data-track="card_' + p.id + '"'),
                'card sem data-track: ' + p.id);
        });
    });

    it('os marcadores do bloco gerado estao no arquivo', () => {
        /* Sem os marcadores, o gerador falha em vez de apagar a secao. */
        ['skills', 'projects', 'certs'].forEach(m => {
            assert.ok(html.includes('<!-- ' + m + ':inicio'), 'sem marcador de ' + m);
            assert.ok(html.includes('<!-- ' + m + ':fim -->'), 'sem marcador final de ' + m);
        });
    });

    it('cada certificacao do JSON vira um card no HTML', () => {
        const cards = html.match(/<figure class="cert-card[^"]*"/g) || [];
        assert.strictEqual(cards.length, dados.certifications.length,
            'JSON tem ' + dados.certifications.length + ' e o HTML tem ' + cards.length);
    });

    it('o card da certificacao e so a imagem, sem texto repetido', () => {
        /* Titulo, emissor e sigla ja estao impressos no certificado. Se o card
         * volta a ter <h3> ou <p>, o mesmo texto aparece duas vezes na tela. */
        const cards = html.split('<figure class="cert-card').slice(1);
        assert.strictEqual(cards.length, dados.certifications.length);
        cards.forEach(card => {
            const corpo = card.split('</figure>')[0];
            assert.ok(!/<h[1-6]/.test(corpo), 'card de certificacao com titulo visivel');
            assert.ok(!/<p[\s>]/.test(corpo), 'card de certificacao com paragrafo visivel');
            assert.strictEqual((corpo.match(/<img /g) || []).length, 1,
                'card de certificacao sem exatamente uma imagem');
        });
    });

    it('cada imagem de certificacao aponta para o arquivo do projeto', () => {
        dados.certifications.forEach(c => {
            assert.ok(c.image, 'certificacao sem image: ' + c.id);
            assert.ok(!/^([a-z]+:)?\/\//i.test(c.image) && !c.image.startsWith('/'),
                c.id + ' com image fora do site: ' + c.image);
            const existe = existsSync(path.join(ROOT, c.image));
            assert.ok(existe, 'imagem inexistente: ' + c.image);
        });
    });

    it('toda imagem tem alt, que e o texto que sobra do certificado', () => {
        /* A imagem e o card inteiro, entao o alt nao e enfeite: e o unico texto
         * que um leitor de tela anuncia e o que o Google le. */
        const semAlt = dados.certifications.filter(c => !c.name);
        assert.strictEqual(semAlt.length, 0,
            'certificacao sem nome para montar o alt: ' + semAlt.map(c => c.id).join(', '));
        const alts = html.match(/<img [^>]*class="cert-img"[^>]*>/g) || [];
        assert.strictEqual(alts.length, dados.certifications.length,
            'JSON tem ' + dados.certifications.length + ' e o HTML tem ' + alts.length);
        alts.forEach(tag => {
            const alt = /alt="([^"]*)"/.exec(tag);
            assert.ok(alt, 'img de certificacao sem alt: ' + tag);
            assert.ok(alt[1].trim().length > 0, 'alt vazio: ' + tag);
        });
    });

    it('as 49 imagens nao sao carregadas de uma vez', () => {
        /* Sem loading="lazy" o navegador abre as 49 conexoes assim que a pagina
         * carrega, mesmo com a secao bem abaixo da dobra. */
        const imgs = html.match(/<img [^>]*cert[^>]*>/g) || [];
        imgs.forEach(tag => {
            assert.ok(/loading="lazy"/.test(tag), 'imagem sem loading lazy: ' + tag);
        });
    });

    it('esconde a secao e o item do menu quando nao ha certificacao', () => {
        /* Um retangulo vazio no meio da home passa ideia de conteudo faltando,
         * e um link de menu que nao leva a lugar nenhum e pior ainda. Com a
         * lista vazia os dois ficam ocultos. */
        const semCert = dados.certifications.length === 0;
        const secao = /<section[^>]*data-cert-section[^>]*>/.exec(html);
        const menu = /<li[^>]*data-cert-nav[^>]*>/.exec(html);
        assert.ok(secao, 'a secao de certificacoes sumiu do index.html');
        assert.ok(menu, 'o item de menu de certificacoes sumiu do index.html');
        if (semCert) {
            assert.ok(/\shidden/.test(secao[0]), 'secao visivel sem certificado nenhum');
            assert.ok(/\shidden/.test(menu[0]), 'item de menu visivel sem certificado');
        } else {
            assert.ok(!/\shidden/.test(secao[0]), 'secao oculta mesmo com certificado');
            assert.ok(!/\shidden/.test(menu[0]), 'item de menu oculto mesmo com certificado');
        }
    });

    it('nao deixa o link de credencial com alvo inseguro', () => {
        dados.certifications.forEach(c => {
            if (!c.url) return;
            assert.ok(c.url.startsWith('https://'),
                c.name + ' com url que nao e https: ' + c.url);
        });
    });

    it('o gerador escapa o HTML em vez de injeta-lo', () => {
        /* O JSON e conteudo. Um "<" num titulo passaria a valer como tag, e o
         * site mostraria o HTML escrito -- a mesma classe de bug que ja
         * aconteceu com <em class="hl"> nos titulos. */
        const comHtml = {
            skills: [{ icon: 'fa-solid fa-x', title: 'A <b>negrito</b>', description: 'd' }],
            projects: [{
                id: 'x', icon: 'fa-solid fa-x', title: 'T', description: 'd',
                links: [{ label: 'Ver', href: 'https://exemplo.test', track: 'repo_x' }]
            }]
        };
        const saida = gerarHtml(comHtml);
        assert.ok(saida.skills.includes('&lt;b&gt;negrito&lt;/b&gt;'),
            'o titulo com tag passou cru: ' + saida.skills);
        assert.ok(!/<b>negrito<\/b>/.test(saida.skills), 'a tag entrou crua no HTML');
    });

    it('escapa o "&" do nome da certificacao, que hoje vem do portfolio', () => {
        /* O bootcamp da Bradesco traz "GenAI, Dados & Cyber" no titulo. Sem
         * escape, o "&" entra cru no HTML. Navegador toleraria, mas o arquivo
         * gerado nao seria XML valido e a checagem de SEO pode recusar. */
        const comAmp = {
            skills: [{ icon: 'i', title: 't', description: 'd' }],
            projects: [{ id: 'p', icon: 'i', title: 'T', description: 'd', links: [] }],
            certifications: [{ id: 'bradesco', name: 'GenAI, Dados & Cyber', image: 'assets/certs/b.webp' }]
        };
        const saida = gerarHtml(comAmp);
        assert.ok(saida.certifications.includes('GenAI, Dados &amp; Cyber'),
            'o "&" passou cru: ' + saida.certifications);
        assert.ok(!/Dados & Cyber/.test(saida.certifications), 'o "&" entrou cru no HTML');
    });

    it('rejeita id repetido em vez de gerar HTML que conta em dobro', () => {
        assert.throws(() => gerarHtml({
            skills: [{ icon: 'i', title: 't', description: 'd' }],
            projects: [
                { id: 'dup', icon: 'i', title: 't', description: 'd', links: [] },
                { id: 'dup', icon: 'i', title: 't', description: 'd', links: [] }
            ]
        }), /repetido/i, 'aceitou dois projetos com o mesmo id');
    });

    it('rejeita JSON sem as listas, em vez de gerar secao vazia', () => {
        assert.throws(() => gerarHtml({ skills: [], projects: [] }), /skills/i);
        assert.throws(() => gerarHtml({ skills: [{ icon: 'i', title: 't', description: 'd' }] }),
            /projects/i);
    });

    it('trata certificacao como lista opcional, nao obrigatoria', () => {
        /* Sem a chave, o gerador nao pode falhar: a home de quem nao tem
         * certificado continua de pe, so sem a secao. */
        const saida = gerarHtml({
            skills: [{ icon: 'i', title: 't', description: 'd' }],
            projects: [{ id: 'p', icon: 'i', title: 't', description: 'd', links: [] }]
        });
        assert.strictEqual(saida.certifications, '');
        assert.strictEqual(saida.temCertificacoes, false);
    });

    it('rejeita duas certificacoes com o mesmo id', () => {
        assert.throws(() => gerarHtml({
            skills: [{ icon: 'i', title: 't', description: 'd' }],
            projects: [{ id: 'p', icon: 'i', title: 't', description: 'd', links: [] }],
            certifications: [
                { id: 'aws', name: 'A', image: 'assets/certs/a.webp' },
                { id: 'aws', name: 'B', image: 'assets/certs/b.webp' }
            ]
        }), /repetido/i);
    });

    it('a certificacao sem url nao gera link quebrado', () => {
        const saida = gerarHtml({
            skills: [{ icon: 'i', title: 't', description: 'd' }],
            projects: [{ id: 'p', icon: 'i', title: 't', description: 'd', links: [] }],
            certifications: [{ id: 's', name: 'Sem link', image: 'assets/certs/s.webp' }]
        });
        assert.ok(!/cert-link/.test(saida.certifications),
            'gerou link para uma certificacao que nao tem url');
        assert.ok(!/cert-overlay/.test(saida.certifications),
            'gerou overlay de link para uma certificacao que nao tem url');
        /* O nome nao aparece mais como texto, mas precisa continuar no alt. */
        assert.ok(saida.certifications.includes('alt="Certificado: Sem link"'),
            'perdeu o alt: ' + saida.certifications);
    });

    it('rejeita certificacao sem imagem, que viraria card vazio', () => {
        /* Sem imagem o card sai com altura zero e a secao fica com um buraco.
         * Um src quebrado tambem nao quebraria o build: a imagem sobroken so
         * apareceria em producao. */
        const base = {
            skills: [{ icon: 'i', title: 't', description: 'd' }],
            projects: [{ id: 'p', icon: 'i', title: 't', description: 'd', links: [] }]
        };
        assert.throws(() => gerarHtml({
            ...base, certifications: [{ id: 'a', name: 'Sem imagem' }]
        }), /image/i);
        assert.throws(() => gerarHtml({
            ...base, certifications: [{ id: 'a', image: 'assets/certs/a.webp' }]
        }), /name|alt/i);
    });

    it('rejeita imagem de certificacao que venha de fora do site', () => {
        const base = {
            skills: [{ icon: 'i', title: 't', description: 'd' }],
            projects: [{ id: 'p', icon: 'i', title: 't', description: 'd', links: [] }]
        };
        ['https://exemplo.test/c.webp', '//exemplo.test/c.webp', '/assets/certs/c.webp']
            .forEach(image => {
                assert.throws(() => gerarHtml({
                    ...base, certifications: [{ id: 'a', name: 'A', image }]
                }), /image fora do site/i, 'aceitou image externo: ' + image);
            });
    });
});
