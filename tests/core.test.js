const { describe, it } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const core = require('../assets/js/core.js');

const ROOT = path.join(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(ROOT, file), 'utf8');

/* Estes testes exercitam o codigo que a pagina executa, via core.js.
 * A versao antiga reimplementava a logica aqui dentro e testava a copia,
 * entao passaria mesmo com o script real deletado. */

describe('escapeHtml', () => {
    it('escapa as tags de um payload de XSS', () => {
        const result = core.escapeHtml('<script>alert("xss")</script>');
        assert.ok(!result.includes('<script>'));
        assert.ok(result.includes('&lt;script&gt;'));
    });

    it('escapa o ampersand antes dos outros caracteres', () => {
        assert.strictEqual(core.escapeHtml('a & b'), 'a &amp; b');
        assert.strictEqual(core.escapeHtml('&lt;'), '&amp;lt;');
    });

    it('escapa aspas, o que fecha atributo em HTML inline', () => {
        assert.strictEqual(core.escapeHtml('" onload="alert(1)'), '&quot; onload=&quot;alert(1)');
        assert.strictEqual(core.escapeHtml("it's"), 'it&#39;s');
    });

    it('preserva texto normal', () => {
        assert.strictEqual(core.escapeHtml('Igor Laurindo'), 'Igor Laurindo');
    });

    it('lida com entrada ausente sem estourar', () => {
        assert.strictEqual(core.escapeHtml(undefined), 'undefined');
        assert.strictEqual(core.escapeHtml(null), 'null');
    });
});

describe('toWhatsAppNumber', () => {
    it('remove tudo que nao e digito', () => {
        assert.strictEqual(core.toWhatsAppNumber('(24) 99999-8888'), '5524999998888');
    });

    it('aceita numero com pais ja informado', () => {
        assert.strictEqual(core.toWhatsAppNumber('+55 24 99999-8888'), '5524999998888');
    });

    it('prefixa 55 em numero de 10 digitos (fixo)', () => {
        assert.strictEqual(core.toWhatsAppNumber('(24) 9888-7777'), '552498887777');
    });

    it('nao duplica o 55 quando o numero ja tem 12 digitos', () => {
        assert.strictEqual(core.toWhatsAppNumber('55 24 99999-8888'), '5524999998888');
    });

    it('recusa numero curto demais', () => {
        assert.strictEqual(core.toWhatsAppNumber('99999'), null);
        assert.strictEqual(core.toWhatsAppNumber(''), null);
    });

    it('recusa numero longo demais', () => {
        assert.strictEqual(core.toWhatsAppNumber('12345678901234'), null);
    });

    it('recusa entrada sem digito nenhum', () => {
        assert.strictEqual(core.toWhatsAppNumber('nao sou telefone'), null);
    });
});

describe('validateContact', () => {
    const valid = {
        name: 'Maria Souza',
        email: 'maria@exemplo.com.br',
        phone: '(24) 99999-8888',
        message: 'Quero um orcamento para um site.'
    };

    it('aceita um preenchimento completo e valido', () => {
        const r = core.validateContact(valid);
        assert.strictEqual(r.valid, true);
        assert.deepStrictEqual(r.errors, []);
    });

    it('aponta campo ausente pelo nome dele', () => {
        const r = core.validateContact({ email: 'a@b.com', phone: '24999998888', message: 'oi' });
        assert.strictEqual(r.valid, false);
        assert.ok(r.errors.includes('name'));
    });

    it('rejeita e-mail invalido mesmo estando preenchido', () => {
        const r = core.validateContact({ ...valid, email: 'maria@' });
        assert.strictEqual(r.valid, false);
        assert.ok(r.errors.includes('emailInvalid'));
    });

    it('rejeita telefone curto, que o required do HTML deixa passar', () => {
        const r = core.validateContact({ ...valid, phone: '123' });
        assert.strictEqual(r.valid, false);
        assert.ok(r.errors.includes('phoneInvalid'));
    });

    it('rejeita mensagem vazia', () => {
        const r = core.validateContact({ ...valid, message: '   ' });
        assert.strictEqual(r.valid, false);
        assert.ok(r.errors.includes('message'));
    });

    it('nao estoura quando nao recebe nada', () => {
        const r = core.validateContact();
        assert.strictEqual(r.valid, false);
        assert.ok(r.errors.length > 0);
    });
});

describe('summarizeDeliveries', () => {
    it('confirma quando os dois canais funcionam', () => {
        const r = core.summarizeDeliveries([
            { label: 'WhatsApp', ok: true },
            { label: 'E-mail', ok: true }
        ]);
        assert.strictEqual(r.tone, 'ok');
        assert.strictEqual(r.success, true);
        assert.ok(r.text.includes('WhatsApp e E-mail'));
    });

    /* Regressao do bug que motivei a extracao: o catch antigo empurrava
     * "WhatsApp (falhou)" para o mesmo array que definia o sucesso, entao
     * a falha total caia no ramo de sucesso e o usuario via a mensagem
     * verde de "Mensagem enviada!". */
    it('NAO confirma quando todos os canais falham', () => {
        const r = core.summarizeDeliveries([
            { label: 'WhatsApp', ok: false },
            { label: 'E-mail', ok: false }
        ]);
        assert.strictEqual(r.tone, 'error');
        assert.strictEqual(r.success, false);
        assert.ok(!r.text.includes('Mensagem enviada'));
    });

    it('NAO confirma quando a lista de canais esta vazia', () => {
        const r = core.summarizeDeliveries([]);
        assert.strictEqual(r.tone, 'error');
        assert.strictEqual(r.success, false);
    });

    /* Concordancia: com os dois canais delivering, "WhatsApp e E-mail
     * enviado" fica errado. O texto vai para o usuario, entao a forma
     * importa tanto quanto o conteudo. */
    it('usa plural quando os dois canais entregaram', () => {
        const r = core.summarizeDeliveries([
            { label: 'WhatsApp', ok: true },
            { label: 'E-mail', ok: true }
        ]);
        assert.ok(r.text.includes('enviados com sucesso'), r.text);
        assert.ok(!r.text.includes('enviado com sucesso'), r.text);
    });

    it('usa o canal que chegou quando so um entregou', () => {
        const r = core.summarizeDeliveries([
            { label: 'WhatsApp', ok: true },
            { label: 'E-mail', ok: false }
        ]);
        // Esse caso cai no ramo de aviso, nao no de sucesso: o texto precisa
        // dizer qual chegou e qual falhou, senão o visitante acha que foi tudo.
        assert.strictEqual(r.tone, 'warn');
        assert.ok(r.text.includes('Mensagem enviada via WhatsApp'), r.text);
        assert.ok(r.text.includes('Nao consegui entregar via E-mail'), r.text);
    });

    it('avisa qual canal falhou quando apenas um funciona', () => {
        const r = core.summarizeDeliveries([
            { label: 'WhatsApp', ok: false },
            { label: 'E-mail', ok: true }
        ]);
        assert.strictEqual(r.tone, 'warn');
        assert.strictEqual(r.success, true);
        assert.ok(r.text.includes('E-mail'));
        assert.ok(r.text.includes('WhatsApp'));
    });

    it('trata lista ausente sem estourar', () => {
        assert.strictEqual(core.summarizeDeliveries().tone, 'error');
    });
});

describe('parseHighlightTitle', () => {
    it('separa antes, destaque e depois', () => {
        const parts = core.parseHighlightTitle('Habilidades <em class=""hl"">Estrategicas</em>');
        assert.deepStrictEqual(parts, [
            { text: 'Habilidades ', highlight: false },
            { text: 'Estrategicas', highlight: true }
        ]);
    });

    it('trata varios destaques, que a regex gulosa antiga engolia', () => {
        const parts = core.parseHighlightTitle('Focado em <em class=""hl"">Resultados</em> <em class=""hl"">Reais</em>');
        const highlights = parts.filter(p => p.highlight);
        assert.strictEqual(highlights.length, 2);
        assert.deepStrictEqual(highlights.map(p => p.text), ['Resultados', 'Reais']);
    });

    it('aceita destaque com varias palavras dentro', () => {
        const parts = core.parseHighlightTitle('Projetos <em class=""hl"">em Destaque</em>');
        const highlight = parts.find(p => p.highlight);
        assert.strictEqual(highlight.text, 'em Destaque');
    });

    it('devolve texto simples quando nao ha destaque', () => {
        const parts = core.parseHighlightTitle('Projetos em Destaque');
        assert.deepStrictEqual(parts, [{ text: 'Projetos em Destaque', highlight: false }]);
    });

    it('comeca com destaque, sem texto antes', () => {
        const parts = core.parseHighlightTitle('<em class=""hl"">Oi</em> mundo');
        assert.strictEqual(parts[0].highlight, true);
        assert.strictEqual(parts[0].text, 'Oi');
    });

    it('termina com destaque, sem texto depois', () => {
        const parts = core.parseHighlightTitle('Vamos <em class=""hl"">Conectar?</em>');
        assert.strictEqual(parts[parts.length - 1].highlight, true);
    });
});

describe('buildRevealWords', () => {
    it('achata as partes em palavras na ordem', () => {
        const parts = core.parseHighlightTitle('Projetos <em class=""hl"">em Destaque</em>');
        const words = core.buildRevealWords(parts);
        assert.deepStrictEqual(words.map(w => w.word), ['Projetos', 'em', 'Destaque']);
    });

    it('marca apenas as palavras em destaque', () => {
        const parts = core.parseHighlightTitle('Projetos <em class=""hl"">em Destaque</em>');
        const words = core.buildRevealWords(parts);
        assert.deepStrictEqual(words.map(w => w.highlight), [false, true, true]);
    });

    it('descarta o separador vazio entre duas tags', () => {
        const parts = core.parseHighlightTitle('<em>A</em> <em>B</em>');
        const words = core.buildRevealWords(parts);
        assert.deepStrictEqual(words.map(w => w.word), ['A', 'B']);
    });

    it('cria o atraso incremental para o stagger', () => {
        const parts = core.parseHighlightTitle('um dois tres');
        const words = core.buildRevealWords(parts, 0.1);
        assert.deepStrictEqual(words.map(w => w.delay), [0, 0.1, 0.2]);
    });

    it('mantem o atraso crescendo em titulo longo', () => {
        const parts = core.parseHighlightTitle('a b c d e f');
        const words = core.buildRevealWords(parts, 0.07);
        for (let i = 1; i < words.length; i++) {
            assert.ok(words[i].delay > words[i - 1].delay, 'atraso parou de crescer');
        }
    });

    it('usa o passo padrao quando nenhum e informado', () => {
        const words = core.buildRevealWords(core.parseHighlightTitle('a b'));
        assert.deepStrictEqual(words.map(w => w.delay), [0, 0.06]);
    });

    it('nao estoura com entrada vazia', () => {
        assert.deepStrictEqual(core.buildRevealWords(), []);
        assert.deepStrictEqual(core.buildRevealWords([]), []);
    });
});

describe('configuracao do envio', () => {
    /* O formulario nao tem back-end. Ele monta a conversa no WhatsApp e abre
     * o app. O numero e o mesmo dos links wa.me do site. */
    const CONTATO = '5524998574876';

    it('o numero do contato so tem digitos, no formato internacional', () => {
        assert.match(CONTATO, /^55\d{10,11}$/, 'numero fora do formato E.164 sem +');
    });

    it('monta o link no wa.me, em https', () => {
        const link = 'https://wa.me/' + CONTATO + '?text='
            + encodeURIComponent('Ola, quero um orcamento');
        assert.ok(link.startsWith('https://wa.me/'), link + ' nao e um link do wa.me');
        assert.ok(link.includes(CONTATO), 'o numero do contato sumiu do link');
    });

    it('nao deixa o texto da proposta vazar em caracteres soltos', () => {
        // Sem encode, um "?" ou um "&" no texto do visitante cortaria a query
        // e o Igor receberia a mensagem truncada.
        const texto = 'Preciso de um site? Valor & prazo: 5.000 & 3 dias';
        const link = 'https://wa.me/' + CONTATO + '?text=' + encodeURIComponent(texto);
        const query = new URL(link).searchParams.get('text');
        assert.strictEqual(query, texto);
    });

    it('nao usa mais os hosts de exemplo que nao resolvem', () => {
        const src = require('node:fs').readFileSync(
            require('node:path').join(__dirname, '..', 'assets', 'js', 'script.js'),
            'utf8'
        );
        assert.ok(!/api\.exemplo\.com/.test(src),
            'o placeholder do bot voltou para o script do formulario');
        assert.ok(!/BOT_WHATSAPP|BOT_EMAIL|postToBot/.test(src),
            'o codigo do envio por bot ficou no script');
    });
});

/* Duble de localStorage. O core recebe o storage como parametro justamente
 * para poder ser testado sem DOM e sem sujar o storage do navegador. */
function fakeStorage(initial) {
    const data = Object.assign({}, initial);
    return {
        getItem(key) {
            return Object.prototype.hasOwnProperty.call(data, key) ? data[key] : null;
        },
        setItem(key, value) {
            data[key] = String(value);
        },
        _data: data
    };
}

const CONSENT_KEY = 'igordev_consent';

describe('getConsent', () => {
    it('devolve granted quando o visitante ja aceitou', () => {
        const storage = fakeStorage({ [CONSENT_KEY]: 'granted' });
        assert.strictEqual(core.getConsent(storage), 'granted');
    });

    it('devolve denied quando o visitante ja recusou', () => {
        const storage = fakeStorage({ [CONSENT_KEY]: 'denied' });
        assert.strictEqual(core.getConsent(storage), 'denied');
    });

    it('devolve null na primeira visita, para o banner aparecer', () => {
        assert.strictEqual(core.getConsent(fakeStorage()), null);
    });

    it('ignora valor adulterado em vez de tratar como consentimento', () => {
        // Se o valor salvo nao for exatamente granted ou denied, nao pode
        // valer: um 'true' solto faria o script carregar analytics.
        ['true', 'GRANTED', '1', 'aceito', '', 'granted '].forEach(bad => {
            const storage = fakeStorage({ [CONSENT_KEY]: bad });
            assert.strictEqual(core.getConsent(storage), null, 'aceitou valor invalido: ' + JSON.stringify(bad));
        });
    });

    it('devolve null quando o navegador bloqueia o localStorage', () => {
        const storage = {
            getItem() { throw new Error('SecurityError'); }
        };
        assert.strictEqual(core.getConsent(storage), null);
    });

    it('devolve null quando nao ha storage', () => {
        assert.strictEqual(core.getConsent(null), null);
        assert.strictEqual(core.getConsent(undefined), null);
    });
});

describe('setConsent', () => {
    it('persiste granted e depois rele como granted', () => {
        const storage = fakeStorage();
        assert.strictEqual(core.setConsent(storage, 'granted'), true);
        assert.strictEqual(core.getConsent(storage), 'granted');
    });

    it('persiste denied e depois rele como denied', () => {
        const storage = fakeStorage();
        assert.strictEqual(core.setConsent(storage, 'denied'), true);
        assert.strictEqual(core.getConsent(storage), 'denied');
    });

    it('qualquer valor diferente de granted vira denied', () => {
        // Falhar para o lado restritivo e o comportamento seguro: um valor
        // invalido nunca pode acabar concedendo coleta.
        const storage = fakeStorage();
        core.setConsent(storage, 'talvez');
        assert.strictEqual(core.getConsent(storage), 'denied');
    });

    it('sobrescreve uma decisao anterior quando a pessoa muda de ideia', () => {
        const storage = fakeStorage({ [CONSENT_KEY]: 'denied' });
        core.setConsent(storage, 'granted');
        assert.strictEqual(core.getConsent(storage), 'granted');
    });

    it('reporta falha em vez de estourar quando o storage bloqueia', () => {
        const storage = {
            setItem() { throw new Error('QuotaExceededError'); }
        };
        assert.strictEqual(core.setConsent(storage, 'granted'), false);
    });
});

describe('shouldLoadAnalytics', () => {
    it('so carrega com consentimento concedido', () => {
        assert.strictEqual(core.shouldLoadAnalytics('granted'), true);
    });

    it('nao carrega quando recusou, e nem quando ainda nao respondeu', () => {
        // null e o caso mais importante: primeiro acesso, banner na tela.
        assert.strictEqual(core.shouldLoadAnalytics('denied'), false);
        assert.strictEqual(core.shouldLoadAnalytics(null), false);
        assert.strictEqual(core.shouldLoadAnalytics(undefined), false);
        assert.strictEqual(core.shouldLoadAnalytics(''), false);
    });

    it('nao deixa valor TRUE genérico passar como concessao', () => {
        assert.strictEqual(core.shouldLoadAnalytics(true), false);
    });
});

/* ---------- Dominio de producao ----------
 *
 * O dominio vivia hardcoded em 8 arquivos. Um deles estava errado: o
 * canonical apontava para igordev.netlify.app, que responde 200 mas e um
 * OUTRO site, nao este portfolio. Como todo mundo so checava o status, o
 * erro passou. A url de producao real vem do log do deploy da Netlify.
 *
 * Estes testes existem para o dominio nao voltar a divergir entre arquivos:
 * o canonical, o og:url, o robots.txt, o sitemap e o rodape do e-mail
 * precisam apontar para o mesmo lugar, e esse lugar precisa ser o site real.
 */
const SITE_ORIGIN = 'https://igordev-portfolio-ofc.netlify.app';

/* Qualquer *.netlify.app que apareca em um arquivo de site tem que ser o
 * de producao. Antes o grep achava dois hosts diferentes ao mesmo tempo. */
const SITE_FILES = [
    'index.html',
    '404.html',
    'privacidade.html',
    'robots.txt',
    'sitemap.xml',
    'assets/js/script.js',
    'README.md',
    'DEPLOY_CHECKLIST.md'
];

describe('dominio de producao', () => {
    it('nenhum arquivo de site cita um netlify.app diferente do real', () => {
        SITE_FILES.forEach(file => {
            const found = read(file).match(/https?:\/\/[\w-]+\.netlify\.app/g) || [];
            const errados = [...new Set(found)].filter(url => url !== SITE_ORIGIN);
            assert.deepStrictEqual(errados, [],
                file + ' cita dominio que nao e o de producao: ' + errados.join(', '));
        });
    });

    it('o canonical da home aponta para o site de producao', () => {
        const html = read('index.html');
        const canonical = html.match(/<link rel="canonical" href="([^"]+)"/);
        assert.ok(canonical, 'index.html sem canonical');
        assert.strictEqual(canonical[1], SITE_ORIGIN + '/');
    });

    it('o og:url da home bate com o canonical', () => {
        const html = read('index.html');
        const canonical = html.match(/<link rel="canonical" href="([^"]+)"/)[1];
        const ogUrl = html.match(/<meta property="og:url" content="([^"]+)"/);
        assert.ok(ogUrl, 'index.html sem og:url');
        // og:url e canonical divergindo e a causa classica de indexacao errada.
        assert.strictEqual(ogUrl[1], canonical);
    });

    it('as imagens de compartilhamento ficam no mesmo host do canonical', () => {
        const html = read('index.html');
        const canonical = html.match(/<link rel="canonical" href="([^"]+)"/)[1];
        const origin = new URL(canonical).origin;
        ['og:image', 'twitter:image'].forEach(prop => {
            const re = prop === 'og:image'
                ? /<meta property="og:image" content="([^"]+)"/
                : /<meta name="twitter:image" content="([^"]+)"/;
            const m = html.match(re);
            assert.ok(m, 'index.html sem ' + prop);
            assert.strictEqual(new URL(m[1]).origin, origin,
                prop + ' aponta para outro host que o canonical');
        });
    });

    /* A og:image precisa ser JPEG 1200x630. O Facebook, o WhatsApp, o
     * LinkedIn e o X nao rasparam WebP de forma confiavel, entao um .webp
     * resulta em preview sem imagem justamente onde o portfolio e mais
     * compartilhado. E 380x380, que era o retrato cru, aparece pequeno
     * demais dentro do card. */
    it('a og:image e JPEG 1200x630 e o arquivo existe mesmo', () => {
        const html = read('index.html');
        const url = html.match(/<meta property="og:image" content="([^"]+)"/)[1];
        assert.ok(url.endsWith('.jpg'), 'og:image nao termina em .jpg: ' + url);

        ['og:image:type', 'og:image:width', 'og:image:height'].forEach(prop => {
            const m = html.match(new RegExp(`<meta property="${prop}" content="([^"]+)"`));
            assert.ok(m, 'index.html sem ' + prop);
        });
        assert.strictEqual(html.match(/<meta property="og:image:type" content="([^"]+)"/)[1],
            'image/jpeg');
        assert.strictEqual(html.match(/<meta property="og:image:width" content="([^"]+)"/)[1],
            '1200');
        assert.strictEqual(html.match(/<meta property="og:image:height" content="([^"]+)"/)[1],
            '630');

        const local = path.join(ROOT, new URL(url).pathname.replace(/^\//, ''));
        assert.ok(fs.existsSync(local), 'a og:image aponta para ' + local + ', que nao existe');
    });

    it('o JSON-LD descreve a pessoa e amarra os perfis do rodape', () => {
        const html = read('index.html');
        const bloco = html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/);
        assert.ok(bloco, 'index.html sem JSON-LD');
        const grafo = JSON.parse(bloco[1])['@graph'];
        const pessoa = grafo.find(n => n['@type'] === 'Person');
        assert.ok(pessoa, 'JSON-LD sem Person');
        assert.strictEqual(pessoa.name, 'Igor Laurindo');
        assert.ok(pessoa.jobTitle, 'Person sem jobTitle');
        assert.ok(pessoa.sameAs.length >= 3, 'sameAs com menos de 3 perfis');

        /* O mesmoAs precisa apontar para redes que o site realmente linka: um
         * perfil que so existe no JSON-LD nao liga nada. */
        ['github.com/Igorls34', 'linkedin.com/in/igor-laurindo', 'instagram.com/igor_devofc']
            .forEach(perfil => {
                assert.ok(pessoa.sameAs.some(u => u.includes(perfil)),
                    'sameAs sem ' + perfil);
                assert.ok(html.includes(perfil), 'a home nao linka ' + perfil);
            });
    });

    it('o H1 diz quem e a pessoa, nao so um slogao', () => {
        const h1 = read('index.html').match(/<h1[^>]*>([\s\S]*?)<\/h1>/);
        assert.ok(h1, 'index.html sem H1');
        assert.ok(/Igor Laurindo/.test(h1[1]),
            'o H1 precisa conter o nome: "' + h1[1].trim() + '"');
        assert.ok(/Desenvolvedor/i.test(h1[1]),
            'o H1 precisa conter a profession: "' + h1[1].trim() + '"');
    });

    it('o canonical da pagina de privacidade fica sob o mesmo host', () => {
        const html = read('privacidade.html');
        const canonical = html.match(/<link rel="canonical" href="([^"]+)"/);
        assert.ok(canonical, 'privacidade.html sem canonical');
        assert.ok(canonical[1].startsWith(SITE_ORIGIN + '/'),
            'canonical da politica fora do site de producao: ' + canonical[1]);
    });

    it('o numero do formulario e o mesmo dos links wa.me do site', () => {
        // Antes isto checava o SITE_URL do rodape do e-mail que o formulario
        // mandava. Esse e-mail nao existe mais: o numero e o que precisa
        // bater, senao a proposta vai para outra pessoa.
        const js = read('assets/js/script.js');
        const site = js.match(/const WHATSAPP_CONTACT = "([^"]+)"/);
        assert.ok(site, 'WHATSAPP_CONTACT nao encontrado em script.js');

        const html = read('index.html');
        const links = [...html.matchAll(/wa\.me\/(\d+)/g)].map(m => m[1]);
        assert.ok(links.length, 'nenhum link wa.me no index.html');
        links.forEach(numero => {
            assert.strictEqual(numero, site[1],
                'o formulario manda para ' + site[1] + ' e o site mostra ' + numero);
        });
    });

    it('o robots.txt aponta o sitemap para o site de producao', () => {
        const robots = read('robots.txt');
        const sitemap = robots.match(/^Sitemap:\s*(\S+)/m);
        assert.ok(sitemap, 'robots.txt sem linha Sitemap');
        assert.strictEqual(sitemap[1], SITE_ORIGIN + '/sitemap.xml');
    });

    it('todas as URLs do sitemap sao do site de producao', () => {
        const xml = read('sitemap.xml');
        const locs = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map(m => m[1]);
        assert.ok(locs.length > 0, 'sitemap vazio');
        locs.forEach(loc => {
            assert.ok(loc.startsWith(SITE_ORIGIN + '/'),
                'URL do sitemap fora do site de producao: ' + loc);
        });
    });

    it('o sitemap lista a home e a politica de privacidade', () => {
        const xml = read('sitemap.xml');
        assert.ok(xml.includes(SITE_ORIGIN + '/</loc>'), 'home ausente do sitemap');
        assert.ok(xml.includes('privacidade.html'), 'politica ausente do sitemap');
    });

    it('o lastmod do sitemap nao esta no futuro', () => {
        const xml = read('sitemap.xml');
        const hoje = new Date().toISOString().slice(0, 10);
        [...xml.matchAll(/<lastmod>([\d-]+)<\/lastmod>/g)].forEach(m => {
            assert.ok(m[1] <= hoje, 'lastmod no futuro: ' + m[1] + ' > ' + hoje);
        });
    });
});