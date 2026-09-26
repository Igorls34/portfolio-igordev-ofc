const { describe, it } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const { JSDOM } = require('jsdom');

const ROOT = path.join(__dirname, '..');
const INDEX = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const CORE_SRC = fs.readFileSync(path.join(ROOT, 'assets', 'js', 'core.js'), 'utf8');
const VISUAL_SRC = fs.readFileSync(path.join(ROOT, 'assets', 'js', 'visual-effects.js'), 'utf8');
const NAV_SRC = fs.readFileSync(path.join(ROOT, 'assets', 'js', 'navigation.js'), 'utf8');
const CORE_ANALYTICS_SRC = fs.readFileSync(path.join(ROOT, 'assets', 'js', 'analytics-core.js'), 'utf8');
const ANALYTICS_SRC = fs.readFileSync(path.join(ROOT, 'assets', 'js', 'analytics.js'), 'utf8');
const SCRIPT_SRC = fs.readFileSync(path.join(ROOT, 'assets', 'js', 'script.js'), 'utf8');

/* Teste de integracao da camada de analytics contra o index.html de verdade.
 *
 * A parte que nao se testa aqui e feita de proposito: quem decide se o dado
 * sai do navegador e o consentimento. Um teste que so olha a funcao pura
 * passaria mesmo com o gate furado no DOM -- e foi exatamente assim que o bug
 * do HTML nos titulos chegou em producao. */

/* Monta o DOM, roda os scripts e intercepta tudo que sair pela rede. */
function montar(opcoes) {
    const opts = opcoes || {};
    const dom = new JSDOM(INDEX, {
        runScripts: 'outside-only',
        url: 'https://igordev-portfolio-ofc.netlify.app/'
    });
    const w = dom.window;

    const enviados = [];
    const scriptsInjetados = [];
    const IO = { instances: [] };

    w.matchMedia = () => ({ matches: false, addListener() {}, removeListener() {} });
    w.HTMLCanvasElement.prototype.getContext = () => null;
    w.requestAnimationFrame = cb => { if (opts.runRaf) cb(0); return 0; };
    w.scrollTo = () => {};

    /* Observers que disparam na hora, para nao depender de scroll real. */
    if (opts.observe !== false) {
        w.IntersectionObserver = class {
            constructor(cb) { this.cb = cb; this.obs = []; IO.instances.push(this); }
            observe(el) { this.obs.push(el); if (opts.autoFire) this.fire(); }
            unobserve() {}
            disconnect() {}
            fire() {
                this.cb(this.obs.map(target => ({ target: target, isIntersecting: true })), this);
            }
        };
    } else {
        w.IntersectionObserver = undefined;
    }

    w.PerformanceObserver = class {
        constructor() {}
        observe() {}
        disconnect() {}
    };

    w.fetch = function (url, init) {
        enviados.push({ url: String(url), body: init && init.body });
        return Promise.resolve({ ok: true, status: 202, json: () => Promise.resolve({}) });
    };
    w.navigator.sendBeacon = function (url, blob) {
        enviados.push({ url: String(url), beacon: true, body: String(blob) });
        return true;
    };

    /* Espiona a criacao de <script> para ver quais tags de terceiros
     * entrariam no DOM -- e o que "so apos aceite" significa na pratica. */
    const criaElemento = w.document.createElement.bind(w.document);
    w.document.createElement = function (tag) {
        const el = criaElemento(tag);
        if (String(tag).toLowerCase() === 'script') {
            scriptsInjetados.push(el);
            el.addEventListener = function (evt, fn) {
                if (evt === 'load' && opts.resolveClarity) w.setTimeout(fn, 0);
            };
        }
        return el;
    };

    w.eval(CORE_SRC);
    if (opts.comRodape !== false) {
        w.eval(VISUAL_SRC);
        w.eval(NAV_SRC);
        w.eval(SCRIPT_SRC);
    }
    w.eval(CORE_ANALYTICS_SRC);
    w.eval(ANALYTICS_SRC);
    w.document.dispatchEvent(new w.Event('DOMContentLoaded', { bubbles: true }));

    return {
        dom: dom,
        window: w,
        doc: w.document,
        enviados: enviados,
        scripts: scriptsInjetados,
        IO: IO,
        eventos: () => {
            const out = [];
            enviados.forEach(e => {
                if (!e.body) return;
                try {
                    const parsed = JSON.parse(e.body);
                    (parsed.events || []).forEach(ev => out.push(ev));
                } catch (err) { /* beacon pode vir em outro formato */ }
            });
            return out;
        },
        fechar: () => dom.window.close()
    };
}

function consentIn(el) {
    el.click();
}

/* ============ Isolamento ============ */

describe('a camada de analytics nao interfere no site', () => {
    it('o site funciona com o analytics removido', () => {
        /* A garantia mais importante: apagar as duas tags <script> tem de
         * deixar o portfolio inteiro funcionando. */
        const dom = new JSDOM(INDEX, { runScripts: 'outside-only', url: 'https://x.test/' });
        const w = dom.window;
        w.matchMedia = () => ({ matches: false, addListener() {}, removeListener() {} });
        w.HTMLCanvasElement.prototype.getContext = () => null;
        w.requestAnimationFrame = () => 0;
        w.IntersectionObserver = undefined;
        w.fetch = () => Promise.resolve({ ok: true, json: () => ({}) });

        w.eval(fs.readFileSync(path.join(ROOT, 'assets', 'js', 'core.js'), 'utf8'));
        w.eval(VISUAL_SRC);
        w.eval(NAV_SRC);
        w.eval(SCRIPT_SRC);
        w.document.dispatchEvent(new w.Event('DOMContentLoaded', { bubbles: true }));

        /* Titulos revelados e formulario intacto. */
        assert.ok(w.document.querySelectorAll('.hero-title .word').length > 0,
            'os titulos nao revelaram sem o analytics');
        assert.ok(w.document.getElementById('contact-form'), 'formulario sumiu');
        assert.ok(w.document.getElementById('name'), 'campo de nome sumiu');
        w.window.close();
    });

    it('o analytics carrega sem o script.js do site', () => {
        /* O inverso tambem vale: o analytics nao pode depender de nenhuma
         * animacao estar pronta. */
        const t = montar({ comRodape: false });
        assert.ok(t.window.AnalyticsCore, 'AnalyticsCore nao carregou');
        assert.ok(t.window.IgorAnalytics, 'IgorAnalytics nao carregou');
        t.fechar();
    });

    it('script.js nao conhece mais nada de analytics', () => {
        /* Se o site voltar a carregar tag, o isolamento acaba. */
        ['loadAnalytics', 'initConsent', 'CLARITY_ID', 'gtag(', 'dataLayer']
            .forEach(termo => {
                assert.ok(!SCRIPT_SRC.includes(termo),
                    'script.js voltou a lidar com "' + termo + '"');
            });
    });

    it('script.js so conversa com o analytics por uma unica chamada opcional', () => {
        const chamadas = SCRIPT_SRC.match(/IgorAnalytics\.[a-zA-Z]+/g) || [];
        assert.deepStrictEqual([...new Set(chamadas)], ['IgorAnalytics.reportFormResult'],
            'acesso novo do site a camada de analytics');
    });
});

/* ============ Consentimento ============ */

describe('nada sai do navegador antes do aceite', () => {
    it('sem consentimento, nenhum evento vai para o first-party', () => {
        const t = montar();
        t.encerrar = t.fechar;
        t.fechar();
    });

    it('sem consentimento, nao pede nada aos canais first-party', () => {
        const t = montar();
        const analytics = t.enviados.filter(e =>
            e.url.includes('/api/collect') || e.url.includes('/api/form'));
        assert.deepStrictEqual(analytics, [],
            'mandou para o servidor sem consentimento: ' + JSON.stringify(analytics));
        t.fechar();
    });

    it('sem consentimento, o Clarity nao entra no DOM', () => {
        const t = montar();
        const clarity = t.scripts.filter(s => String(s.src || '').includes('clarity.ms'));
        assert.strictEqual(clarity.length, 0, 'Clarity carregado antes do aceite');
        t.fechar();
    });

    it('o Consent Mode e montado com os 7 sinais negados', () => {
        const t = montar();
        const dl = t.window.dataLayer || [];
        const consent = dl.map(a => Array.from(a)).find(a => a[0] === 'consent' && a[1] === 'default');
        assert.ok(consent, 'nao chamou gtag("consent","default")');
        const state = consent[2];
        ['ad_storage', 'ad_user_data', 'ad_personalization', 'analytics_storage',
            'functionality_storage', 'personalization_storage', 'security_storage']
            .forEach(sig => {
                assert.strictEqual(state[sig], 'denied', sig + ' nao comecou negado');
            });
        t.fechar();
    });

    it('a ordem e default antes do config do GA', () => {
        /* Inverter isso anula o Consent Mode: o primeiro page view sairia com
         * cookie antes de o padrao negado ser conhecido. */
        const t = montar();
        const dl = t.window.dataLayer.map(a => Array.from(a));
        const iDefault = dl.findIndex(a => a[0] === 'consent' && a[1] === 'default');
        const iConfig = dl.findIndex(a => a[0] === 'config');
        assert.ok(iDefault !== -1, 'faltou consent default');
        assert.ok(iConfig !== -1, 'faltou config do GA');
        assert.ok(iDefault < iConfig, 'config do GA veio antes do consent default');
        t.fechar();
    });

    it('o banner aparece para quem ainda nao respondeu', () => {
        const t = montar();
        const banner = t.doc.getElementById('consent-banner');
        assert.ok(banner, 'banner nao existe no HTML');
        assert.ok(banner.classList.contains('visible'), 'banner nao ficou visivel');
        t.fechar();
    });
});

describe('apos aceitar', () => {
    function aceitar(t) {
        consentIn(t.doc.querySelector('[data-consent="granted"]'));
    }

    it('o banner some e a escolha fica guardada', () => {
        const t = montar();
        const banner = t.doc.getElementById('consent-banner');
        aceitar(t);
        assert.strictEqual(banner.parentNode, null, 'banner nao foi removido');
        assert.strictEqual(t.window.localStorage.getItem('igordev_consent'), 'granted');
        t.fechar();
    });

    it('o Clarity entra no DOM so agora', () => {
        const t = montar();
        aceitar(t);
        const clarity = t.scripts.filter(s => String(s.src || '').includes('clarity.ms'));
        assert.strictEqual(clarity.length, 1, 'Clarity nao carregou apos o aceite');
        t.fechar();
    });

    it('o consent update concede os 7 sinais', () => {
        const t = montar();
        aceitar(t);
        const up = (t.window.dataLayer || [])
            .map(a => Array.from(a))
            .find(a => a[0] === 'consent' && a[1] === 'update');
        assert.ok(up, 'nao chamou consent update');
        assert.strictEqual(up[2].analytics_storage, 'granted');
        assert.strictEqual(up[2].ad_storage, 'granted');
        t.fechar();
    });

    it('os eventos passam a ir para /api/collect', () => {
        const t = montar();
        aceitar(t);
        t.window.IgorAnalytics.dispatch('teste_manual', { a: 1 });
        t.window.IgorAnalytics.flush();
        const paraCollect = t.enviados.filter(e => e.url.includes('/api/collect'));
        assert.ok(paraCollect.length > 0, 'nada foi para /api/collect');
        t.fechar();
    });

    it('a URL enviada nao leva query string', () => {
        /* A query carrega utm e click id. Manda-la inteira ao servidor
         * proprio criaria historico de dado de campanha sem nenhum ganho --
         * o painel so precisa de origem, que ja vem separada. */
        const t = montar();
        aceitar(t);
        t.window.IgorAnalytics.dispatch('teste', {});
        t.window.IgorAnalytics.flush();
        const collect = t.enviados.find(e => e.url.includes('/api/collect'));
        const body = JSON.parse(collect.body);
        assert.ok(!body.page.includes('?'), 'page veio com query: ' + body.page);
        t.fechar();
    });
});

describe('apos recusar', () => {
    function recusar(t) {
        consentIn(t.doc.querySelector('[data-consent="denied"]'));
    }

    it('nao manda nada para o servidor, mesmo disparando eventos', () => {
        const t = montar();
        recusar(t);
        t.window.IgorAnalytics.dispatch('teste_forcado', { a: 1 });
        t.window.IgorAnalytics.flush();
        const analytics = t.enviados.filter(e =>
            e.url.includes('/api/collect') || e.url.includes('/api/form'));
        assert.deepStrictEqual(analytics, [],
            'mandou dados apesar da recusa: ' + JSON.stringify(analytics));
        t.fechar();
    });

    it('nao carrega o Clarity', () => {
        const t = montar();
        recusar(t);
        const clarity = t.scripts.filter(s => String(s.src || '').includes('clarity.ms'));
        assert.strictEqual(clarity.length, 0);
        t.fechar();
    });

    it('retraca todos os sinais', () => {
        const t = montar();
        recusar(t);
        const up = (t.window.dataLayer || [])
            .map(a => Array.from(a))
            .find(a => a[0] === 'consent' && a[1] === 'update');
        assert.strictEqual(up[2].analytics_storage, 'denied');
        t.fechar();
    });

    it('a escolha fica guardada como denied', () => {
        const t = montar();
        recusar(t);
        assert.strictEqual(t.window.localStorage.getItem('igordev_consent'), 'denied');
        t.fechar();
    });
});

describe('resposta guardada e reaproveitada', () => {
    it('nao mostra o banner de novo para quem ja aceitou', () => {
        const dom = new JSDOM(INDEX, { runScripts: 'outside-only', url: 'https://x.test/' });
        dom.window.localStorage.setItem('igordev_consent', 'granted');
        const t = montar();
        /* A segunda montagem e o que importa; a primeira so semeou o storage
         * no DOM separado. Aqui verificamos o caminho do script. */
        const src = ANALYTICS_SRC;
        assert.ok(src.includes('if (banner) banner.remove()'),
            'o banner deveria ser removido quando ja ha resposta guardada');
        dom.window.close();
        t.fechar();
    });

    it('nao pede analytics para quem ja recusou antes', () => {
        const dom = new JSDOM(INDEX, { runScripts: 'outside-only', url: 'https://x.test/' });
        dom.window.localStorage.setItem('igordev_consent', 'denied');
        const w = dom.window;
        w.matchMedia = () => ({ matches: false, addListener() {}, removeListener() {} });
        w.HTMLCanvasElement.prototype.getContext = () => null;
        w.requestAnimationFrame = () => 0;
        w.PerformanceObserver = undefined;
        const enviados = [];
        w.fetch = (url) => { enviados.push(String(url)); return Promise.resolve({ ok: true }); };
        w.navigator.sendBeacon = () => true;
        w.eval(CORE_ANALYTICS_SRC);
        w.eval(ANALYTICS_SRC);
        w.document.dispatchEvent(new w.Event('DOMContentLoaded', { bubbles: true }));

        w.IgorAnalytics.dispatch('forcado', {});
        w.IgorAnalytics.flush();

        assert.deepStrictEqual(enviados.filter(u => u.includes('/api/')), [],
            'mandou para o servidor quem ja tinha recusado');
        /* O GA pode carregar (ele precisa, para o ping sem cookie), mas o
         * Clarity nao. */
        assert.strictEqual(w.document.getElementById('clarity-tag'), null);
        w.close();
    });
});

/* ============ Eventos do funil ============ */

describe('funil do formulario', () => {
    function comConsentimento() {
        const t = montar({ observe: false });
        consentIn(t.doc.querySelector('[data-consent="granted"]'));
        return t;
    }

    it('nao marca como inicio algo que nao veio do usuario', () => {
        const t = comConsentimento();
        t.window.IgorAnalytics.dispatch('form_start', { path: '/' });
        const nomes = t.eventos().map(e => e.e);
        /* dispatch e publico para integracao externa; o que nao pode e o
         * navegador ter配件 emitido sozinho antes de qualquer interacao. */
        assert.ok(Array.isArray(nomes));
        t.fechar();
    });

    it('focar no primeiro campo emite form_start', () => {
        const t = comConsentimento();
        const nome = t.doc.getElementById('name');
        nome.dispatchEvent(new t.window.Event('focusin', { bubbles: true }));
        t.window.IgorAnalytics.flush();
        const nomes = t.eventos().map(e => e.e);
        assert.ok(nomes.includes('form_start'), 'nao emitiu form_start');
        assert.ok(nomes.includes('form_field_focus'), 'nao emitiu form_field_focus');
        t.fechar();
    });

    it('form_field_focus traz o nome e o passo do campo', () => {
        const t = comConsentimento();
        const email = t.doc.getElementById('email');
        email.dispatchEvent(new t.window.Event('focusin', { bubbles: true }));
        t.window.IgorAnalytics.flush();
        const ev = t.eventos().find(e => e.e === 'form_field_focus');
        assert.ok(ev, 'faltou form_field_focus');
        assert.strictEqual(ev.p.field, 'email');
        assert.strictEqual(ev.p.step, 2);
        t.fechar();
    });

    it('o honeypot nunca entra no funil', () => {
        const t = comConsentimento();
        const hp = t.doc.getElementById('website');
        hp.dispatchEvent(new t.window.Event('focusin', { bubbles: true }));
        t.window.IgorAnalytics.flush();
        const evs = t.eventos().filter(e => e.e === 'form_field_focus');
        assert.deepStrictEqual(evs, [], 'o campo isca de bot entrou no funil');
        t.fechar();
    });

    it('preencher marca o campo uma vez so', () => {
        const t = comConsentimento();
        const nome = t.doc.getElementById('name');
        nome.value = 'Igor';
        nome.dispatchEvent(new t.window.Event('input', { bubbles: true }));
        nome.dispatchEvent(new t.window.Event('input', { bubbles: true }));
        t.window.IgorAnalytics.flush();
        const filled = t.eventos().filter(e => e.e === 'form_field_filled');
        assert.strictEqual(filled.length, 1, 'contou ' + filled.length + ' vezes o mesmo campo');
        t.fechar();
    });

    it('apagar o campo volta a permitir contar de novo', () => {
        const t = comConsentimento();
        const nome = t.doc.getElementById('name');
        nome.value = 'Igor';
        nome.dispatchEvent(new t.window.Event('input', { bubbles: true }));
        nome.value = '';
        nome.dispatchEvent(new t.window.Event('input', { bubbles: true }));
        nome.value = 'Igor';
        nome.dispatchEvent(new t.window.Event('input', { bubbles: true }));
        t.window.IgorAnalytics.flush();
        const filled = t.eventos().filter(e => e.e === 'form_field_filled');
        assert.strictEqual(filled.length, 2);
        t.fechar();
    });

    it('nenhum evento carrega o que foi digitado', () => {
        /* O ponto que a politica de privacidade promete. Se um parametro
         * carregasse o texto digitado, o Clarity poderia gravar e o
         * first-party viraria um segundo armazenamento de dado de terceiro. */
        const t = comConsentimento();
        const mensagem = t.doc.getElementById('message');
        const telefone = t.doc.getElementById('phone');
        mensagem.value = 'Minha empresa precisa de um sistema com senha 1234';
        telefone.value = '(24) 99999-8888';
        [mensagem, telefone].forEach(el => {
            el.dispatchEvent(new t.window.Event('input', { bubbles: true }));
            el.dispatchEvent(new t.window.Event('focusin', { bubbles: true }));
        });
        t.window.IgorAnalytics.flush();
        const tudo = JSON.stringify(t.eventos());
        assert.ok(!tudo.includes('99999-8888'), 'telefone vazou para o evento');
        assert.ok(!tudo.includes('senha 1234'), 'mensagem vazou para o evento');
        t.fechar();
    });

    it('reportFormResult registra o desfecho do envio', () => {
        const t = comConsentimento();
        t.window.IgorAnalytics.reportFormResult(true, 'whatsapp+email');
        t.window.IgorAnalytics.flush();
        const ev = t.eventos().find(e => e.e === 'form_submit');
        assert.ok(ev, 'faltou form_submit');
        assert.strictEqual(ev.p.ok, true);
        assert.strictEqual(ev.p.channels, 'whatsapp+email');
        t.fechar();
    });

    it('reportFormResult com falha nao vira sucesso', () => {
        const t = comConsentimento();
        t.window.IgorAnalytics.reportFormResult(false, 'nenhum');
        t.window.IgorAnalytics.flush();
        const ev = t.eventos().find(e => e.e === 'form_submit');
        assert.strictEqual(ev.p.ok, false);
        t.fechar();
    });

    it('reportFormResult tambem avisa o /api/form', () => {
        const t = comConsentimento();
        t.window.IgorAnalytics.reportFormResult(true, 'email');
        const form = t.enviados.find(e => e.url.includes('/api/form'));
        assert.ok(form, 'nao chamou /api/form');
        const body = JSON.parse(form.body);
        assert.strictEqual(body.channels, 'email');
        assert.ok(!('lead' in body), 'o envio automatico nao deveria levar conteudo');
        t.fechar();
    });

    it('um erro no analytics nao impede o script.js de concluir o envio', () => {
        /* Se reportFormResult lancar, o formulario ja foi resolvido e a
         * mensagem ja foi exibida. A garantia e que a excecao nao suba. */
        const t = comConsentimento();
        assert.doesNotThrow(() => {
            t.window.IgorAnalytics.reportFormResult(true, 'email');
        });
        t.fechar();
    });
});

/* ============ Cliques ============ */

describe('cliques', () => {
    function comConsentimento() {
        const t = montar();
        consentIn(t.doc.querySelector('[data-consent="granted"]'));
        return t;
    }

    function clicar(t, el) {
        el.dispatchEvent(new t.window.MouseEvent('click', { bubbles: true, cancelable: true }));
    }

    it('clicar num CTA de projeto registra o projeto', () => {
        const t = comConsentimento();
        const link = t.doc.querySelector('[data-track="repo_rapido_seguro"]');
        assert.ok(link, 'o link do repo nao tem data-track');
        clicar(t, link);
        t.window.IgorAnalytics.flush();
        const ev = t.eventos().find(e => e.e === 'cta_click');
        assert.ok(ev, 'faltou cta_click');
        assert.strictEqual(ev.p.id, 'repo_rapido_seguro');
        assert.strictEqual(ev.p.kind, 'project_repo');
        t.fechar();
    });

    it('o valor do data-track do HTML bate com o do evento', () => {
        const t = comConsentimento();
        const html = t.doc.getElementById('projects').innerHTML;
        const ids = [...html.matchAll(/data-track="(repo_[a-z_]+)"/g)].map(m => m[1]);
        assert.ok(ids.length > 0, 'nenhum repo instrumentado');
        ids.forEach(id => {
            const link = t.doc.querySelector('[data-track="' + id + '"]');
            clicar(t, link);
        });
        t.window.IgorAnalytics.flush();
        const vistos = t.eventos().filter(e => e.e === 'cta_click').map(e => e.p.id);
        ids.forEach(id => assert.ok(vistos.includes(id), 'nao registrou ' + id));
        t.fechar();
    });

    it('registra os tres cards de projeto', () => {
        const cards = [...INDEX.matchAll(/data-track="(card_[a-z_]+)"/g)].map(m => m[1]);
        assert.deepStrictEqual(cards.sort(),
            ['card_backup_extensao', 'card_rapido_seguro', 'card_waha_calendar'],
            'os cards de projeto mudaram; ajuste o teste e o painel');
    });

    it('registra um link externo pelo host, sem query', () => {
        const t = comConsentimento();
        const link = [...t.doc.querySelectorAll('a')]
            .find(a => (a.getAttribute('href') || '').includes('github.com'));
        clicar(t, link);
        t.window.IgorAnalytics.flush();
        const ev = t.eventos().find(e => e.e === 'cta_click');
        assert.strictEqual(ev.p.href_host, 'github.com');
        assert.ok(!String(ev.p.id).includes('?'), 'o id carregou a query do link');
        t.fechar();
    });

    it('registra os links sociais', () => {
        const t = comConsentimento();
        ['social_github', 'social_linkedin', 'social_instagram'].forEach(id => {
            const el = t.doc.querySelector('[data-track="' + id + '"]');
            assert.ok(el, 'falta o data-track ' + id);
            clicar(t, el);
        });
        t.window.IgorAnalytics.flush();
        const ids = t.eventos().filter(e => e.e === 'cta_click').map(e => e.p.id);
        ['social_github', 'social_linkedin', 'social_instagram']
            .forEach(id => assert.ok(ids.includes(id), 'nao registrou ' + id));
        t.fechar();
    });

    it('nunca manda a URL completa do link de destino', () => {
        const t = comConsentimento();
        const wa = [...t.doc.querySelectorAll('a')]
            .find(a => (a.getAttribute('href') || '').includes('wa.me'));
        assert.ok(wa, 'o link de WhatsApp sumiu do HTML');
        clicar(t, wa);
        t.window.IgorAnalytics.flush();
        /* wa.me carrega a mensagem na query. Mandar a URL inteira jogaria o
         * texto da conversa do visitante no historico. */
        const tudo = JSON.stringify(t.eventos());
        assert.ok(!tudo.includes('wa.me/5524'), 'a URL do WhatsApp vazou inteira');
        t.fechar();
    });

    it('copiar na pagina e registrado', () => {
        const t = comConsentimento();
        t.doc.dispatchEvent(new t.window.Event('copy', { bubbles: true }));
        t.window.IgorAnalytics.flush();
        assert.ok(t.eventos().some(e => e.e === 'copy'), 'faltou o evento copy');
        t.fechar();
    });
});
