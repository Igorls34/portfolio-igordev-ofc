const { describe, it } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const PRIVACIDADE = fs.readFileSync(path.join(ROOT, 'privacidade.html'), 'utf8');
const INDEX = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const ANALYTICS_SRC = fs.readFileSync(path.join(ROOT, 'assets', 'js', 'analytics.js'), 'utf8');
const CORE_SRC = fs.readFileSync(path.join(ROOT, 'assets', 'js', 'analytics-core.js'), 'utf8');
const COLLECT_SRC = fs.readFileSync(path.join(ROOT, 'netlify', 'functions', 'collect.js'), 'utf8');
const FORM_SRC = fs.readFileSync(path.join(ROOT, 'netlify', 'functions', 'form.js'), 'utf8');
const STATS_SRC = fs.readFileSync(path.join(ROOT, 'netlify', 'functions', 'stats.js'), 'utf8');
const TOML = fs.readFileSync(path.join(ROOT, 'netlify.toml'), 'utf8');

/* Texto corrido: sem acentos, minusculo, sem as tags e com a quebra de linha
 * do HTML virada em espaco.
 *
 * Sem isso o teste dependeria de onde a palavra caiu na linha: "O endereco IP
 * em" no fim de uma linha e "si nao e gravado" na seguinte nao casam com
 * 'ip em si', e o teste quebraria numa refatoracao que nao mudou o
 * conteudo. */
function textoCorrido(html) {
    return html.toLowerCase()
        .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
        .replace(/<[^>]+>/g, ' ')
        .replace(/\s+/g, ' ');
}

/* Igual, mas preservando o HTML, para inspecionar codigo. */
const minusculas = s => s.toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '');

/* Politica de privacidade e contrato.
 *
 * Uma politica que descreve um sistema diferente do que o codigo faz e pior
 * do que nao ter politica: ela cria uma garantia falsa. Estes testes amarram as
 * duas pontas -- se o codego passar a coletar algo novo, a politica tem de
 * dizer. */

describe('a politica descreve o que o codigo coleta', () => {
    it('menciona cada categoria de dado que o navegador envia', () => {
        const texto = textoCorrido(PRIVACIDADE);
        const categorias = [
            ['rolagem', ['rolagem', 'rolou']],
            ['tempo na pagina', ['tempo na pagina', 'tempo em cada secao']],
            ['secao vista', ['secao que ficou visivel']],
            ['cliques', ['cliques']],
            ['formulario sem conteudo', ['sem o conteudo']],
            ['aparelho', ['aparelho e navegador']],
            ['origem do acesso', ['origem do acesso']],
            ['performance real', ['desempenho real']]
        ];
        categorias.forEach(([nome, termos]) => {
            assert.ok(
                termos.some(t => texto.includes(minusculas(t))),
                'a politica nao fala sobre ' + nome
            );
        });
    });

    it('afirma que o IP nao e gravado', () => {
        /* A politica precisa dizer a mesma coisa que collect.js faz. */
        const texto = textoCorrido(PRIVACIDADE);
        assert.ok(texto.includes('ip em si'), 'a politica nao nega a gravacao do IP');
        assert.ok(/nao.{0,20}gravado/.test(texto), 'faltou a frase de nao gravacao');
    });

    it('afirma que o texto digitado nao vai para a medicao', () => {
        const texto = textoCorrido(PRIVACIDADE);
        assert.ok(texto.includes('texto digitado'), 'a politica nao menciona o texto digitado');
        assert.ok(/nao.{0,60}enviados?\s+para o sistema de medi/.test(texto),
            'faltou a garantia de que o conteudo nao e enviado para a medicao');
    });

    it('diz que recusar impede a coleta', () => {
        const texto = textoCorrido(PRIVACIDADE);
        assert.ok(texto.includes('recusar'), 'a politica nao fala sobre a recusa');
        assert.ok(/nenhum desses dados/.test(texto), 'faltou a garantia da recusa');
        /* E o ponto que mais importa para o visitante: recusar nao estraga o
         * formulario. */
        assert.ok(/nao impede a navegacao nem o uso do formulario/.test(texto),
            'faltou dizer que recusar nao impede o formulario');
    });

    it('informa o prazo de retencao do sistema proprio', () => {
        const texto = textoCorrido(PRIVACIDADE);
        assert.ok(/24 meses/.test(texto), 'falta o prazo de 24 meses do armazenamento proprio');
    });

    it('menciona o painel protegido por senha', () => {
        const texto = textoCorrido(PRIVACIDADE);
        assert.ok(texto.includes('protegido por senha'), 'o painel nao e mencionado');
    });
});

describe('o codigo faz o que a politica promete', () => {
    it('collect.js nao persiste o endereco IP', () => {
        /* A forma de checar: o IP pode ser lido (para derivar geo), mas nao
         * pode entrar no objeto que vai para o storage. */
        const objetoDeSessao = COLLECT_SRC.slice(
            COLLECT_SRC.indexOf('const session = {'),
            COLLECT_SRC.indexOf('};', COLLECT_SRC.indexOf('const session = {'))
        );
        assert.ok(!objetoDeSessao.includes('clientAddress'),
            'o IP entrou no objeto persistido');
        assert.ok(!/^\s*ip\s*:/m.test(objetoDeSessao), 'o IP entrou no objeto persistido');
    });

    it('collect.js guarda so pais e estado do geo', () => {
        assert.ok(COLLECT_SRC.includes('geo.country'), 'pais nao esta sendo guardado');
        assert.ok(COLLECT_SRC.includes('geo.subdivision'), 'estado nao esta sendo guardado');
        /* Cidade e latitude sao identificadores de geolocalizacao fina demais
         * para quem so precisa saber de onde veio o trafego. */
        assert.ok(!COLLECT_SRC.includes('geo.city'), 'cidade esta sendo guardada');
        assert.ok(!COLLECT_SRC.includes('latitude'), 'latitude esta sendo guardada');
    });

    it('form.js nao grava o conteudo por padrao', () => {
        /* O conteudo so entra se ANALYTICS_STORE_LEADS estiver ligado. */
        assert.ok(FORM_SRC.includes('ANALYTICS_STORE_LEADS'), 'sem a flag de conteudo');
        const bloco = FORM_SRC.slice(FORM_SRC.indexOf('function storeLeads'));
        assert.ok(/===\s*'true'|\s*===\s*'1'/.test(bloco),
            'a flag nao tem comparacao estrita, entao "false" poderia ligar');
    });

    it('form.js mantem o nome, e-mail e telefone atras da flag', () => {
        const i = FORM_SRC.indexOf('if (keepContent');
        assert.ok(i !== -1, 'sem guarda de conteudo');
        const bloco = FORM_SRC.slice(i, i + 400);
        assert.ok(bloco.includes('email'), 'o e-mail nao esta protegido pela flag');
        assert.ok(bloco.includes('phone'), 'o telefone nao esta protegido pela flag');
    });

    it('stats.js fica fechado quando o token nao esta definido', () => {
        /* O erro classico de esquecer a variavel de ambiente e publicar o
         * historico inteiro. Aqui o padrao e fechado.
         *
         * A busca e feita dentro do handler, e nao no arquivo todo: "if
         * (!expected)" tambem aparece dentro de tokenMatches, e comparar
         * posicoes no arquivo inteiro daria a comparacao errada. */
        const handler = STATS_SRC.slice(STATS_SRC.indexOf('export default'));
        const guarda = handler.indexOf('if (!expected)');
        const leitura = handler.indexOf('readDay');
        assert.ok(guarda !== -1, 'sem guarda de token ausente no handler');
        assert.ok(leitura !== -1, 'o handler nao le nenhum dia');
        assert.ok(guarda < leitura, 'a guarda vem depois de ler os dados');
    });

    it('stats.js compara o token sem vazar por tempo de resposta', () => {
        assert.ok(STATS_SRC.includes('tokenMatches'), 'sem comparacao protegida');
        assert.ok(!STATS_SRC.includes('=== expected'), 'comparacao direta de token');
    });

    it('o navegador nao manda o valor dos campos em nenhum evento', () => {
        ['value', 'textContent'].forEach(termo => {
            const linhaProblematica = ANALYTICS_SRC.split('\n')
                .filter(l => l.includes(termo) && l.includes('dispatch'));
            assert.deepStrictEqual(linhaProblematica, [],
                'dispatch com ' + termo + ': ' + linhaProblematica.join(' | '));
        });
    });

    it('o identificador de visita so e criado com consentimento', () => {
        /* Criar e gravar o id antes do aceite seria coletar um identifier sem
         * base legal -- e o tipo de dado que a LGPD trata com mais cuidado.
         *
         * Sao dois pontos legitimos de criacao: o clique em aceitar e a volta
         * de quem ja tinha consentido antes. O que nao pode existir e um
         * terceiro ponto sem guarda. */
        const linhas = ANALYTICS_SRC.split('\n');
        const ocorrencias = linhas
            .map((l, i) => (l.includes('Core.getOrCreateVisitor') ? i : -1))
            .filter(i => i !== -1);

        assert.ok(ocorrencias.length > 0, 'o id de visitante nao e criado em lugar nenhum');

        const semGuarda = ocorrencias.filter(i => {
            const janela = linhas.slice(Math.max(0, i - 3), i + 1).join('\n');
            return !/shouldLoadAnalytics\(\s*[a-z]+\s*\)/.test(janela);
        });

        assert.deepStrictEqual(semGuarda, [],
            'criacao do id fora de um teste de consentimento, na(s) linha(s): ' +
            semGuarda.map(i => i + 1).join(', '));
    });

    it('o identificador de visita comeca nulo e nao e lido do storage antes do aceite', () => {
        assert.ok(/vid:\s*null/.test(ANALYTICS_SRC),
            'o estado inicial nao e um id nulo, entao ja comeca identificando');
    });

    it('a URL da pagina e enviada sem query string', () => {
        assert.ok(CORE_SRC.includes('stripToPath'), 'sem stripToPath');
        assert.ok(ANALYTICS_SRC.includes('stripToPath'), 'a pagina nao passa por stripToPath');
    });

    it('as tags de terceiros sao carregadas depois do aceite', () => {
        const iClarity = ANALYTICS_SRC.indexOf("'https://www.clarity.ms/tag/'");
        const iApply = ANALYTICS_SRC.indexOf('function applyConsent');
        assert.ok(iClarity !== -1, 'a tag do Clarity sumiu');
        assert.ok(iClarity > iApply,
            'a URL do Clarity aparece antes da logica de consentimento');
    });

    it('o Consent Mode e negado por padrao no codigo e na politica', () => {
        assert.ok(CORE_SRC.includes("'denied'"), 'o padrao negado sumiu do codigo');
        assert.ok(textoCorrido(INDEX).includes('cookies de medicao'),
            'o banner nao explica o que sao os cookies de medicao');
    });
});

describe('o endpoint de estatisticas nao vaza', () => {
    it('nao devolve evento cru para quem nao tem o token', () => {
        /* O resumo e agregado; o evento cru nao pode sair. O painel so
         * precisa de contagens. */
        const iBuild = STATS_SRC.indexOf('function buildReport');
        const iHandler = STATS_SRC.indexOf('export default');
        const corpo = STATS_SRC.slice(iBuild, iHandler);
        assert.ok(!corpo.includes('funnelRaw: records'), 'o evento cru esta na resposta');
        /* O funil aparece, mas so como contagem por campo. */
        assert.ok(corpo.includes('funnelRaw: funnelEvents'), 'o funil sumiu do resumo');
    });

    it('o painel pede o token em vez de trazê-lo no HTML', () => {
        const painel = fs.readFileSync(path.join(ROOT, 'relatorio', 'index.html'), 'utf8');
        assert.ok(painel.includes('x-analytics-token'), 'o painel nao envia o token');
        assert.ok(painel.includes('id="token"'), 'o painel nao pede a senha');
        assert.ok(painel.includes('sessionStorage'), 'o token deveria ficar so na sessao');
        assert.ok(!/ANALYTICS_TOKEN\s*=\s*["'][^"']+["']/.test(painel),
            'parece haver um token embutido no HTML do painel');
    });

    it('o painel e marcado para nao ser indexado', () => {
        const painel = fs.readFileSync(path.join(ROOT, 'relatorio', 'index.html'), 'utf8');
        assert.ok(/name="robots"[^>]*noindex/.test(painel), 'sem noindex no painel');
    });
});

describe('configuracao de deploy', () => {
    /* Um TOML invalido nao da erro visivel no build: a chave e ignorada e o
     * site sai no ar do jeito errado, silenciosamente. Por isso a lista de
     * chaves aceitas vem da documentacao, e nao da intencao. */
    const CHAVES_BUILD = ['base', 'publish', 'command', 'environment', 'processing'];
    const CHAVES_FUNCTIONS = [
        'directory', 'node_bundler', 'external_node_modules', 'included_files'
    ];

    function bloco(nome) {
        const inicio = TOML.indexOf('[' + nome + ']');
        if (inicio === -1) return null;
        /* Vai ate a proxima secao, seja [x] ou [[x]]. Sem o segundo
         * colchete no padrao, um bloco passaria por cima dos [[headers]] e
         * leria as chaves deles como se fossem do bloco anterior. */
        const resto = TOML.slice(inicio + nome.length + 3);
        const fim = resto.search(/^\[\[?[a-z]/m);
        return resto.slice(0, fim === -1 ? resto.length : fim);
    }

    it('nao usa chaves que o [build] nao aceita', () => {
        const b = bloco('build');
        assert.ok(b, 'sem bloco [build]');
        b.split('\n')
            .map(l => l.trim())
            .filter(l => l && !l.startsWith('#') && !l.startsWith('['))
            .map(l => l.split('=')[0].trim())
            .forEach(chave => {
                assert.ok(CHAVES_BUILD.includes(chave),
                    '[build] nao aceita "' + chave + '": o Netlify ignora a linha');
            });
    });

    it('declara o diretorio das functions no lugar certo', () => {
        const f = bloco('functions');
        assert.ok(f, 'sem bloco [functions]');
        assert.ok(/directory\s*=\s*"netlify\/functions"/.test(f),
            'o diretorio das functions nao esta declarado em [functions]');
    });

    it('nao usa chaves que o [functions] nao aceita', () => {
        const f = bloco('functions');
        f.split('\n')
            .map(l => l.trim())
            .filter(l => l && !l.startsWith('#') && !l.startsWith('['))
            .map(l => l.split('=')[0].trim())
            .forEach(chave => {
                assert.ok(CHAVES_FUNCTIONS.includes(chave),
                    '[functions] nao aceita "' + chave + '": o Netlify ignora a linha');
            });
    });

    it('empacota as functions com esbuild', () => {
        /* O store usa import dinamico de @netlify/blobs. Com o empacotador
         * padrao, a dependencia pode nao entrar no pacote e a gravacao falha
         * em silencio em producao. */
        const f = bloco('functions');
        assert.ok(/node_bundler\s*=\s*"esbuild"/.test(f),
            'sem esbuild, o import dinamico do @netlify/blobs pode nao ser empacotado');
    });

    it('publica a partir de dist, e nao da raiz', () => {
        const b = bloco('build');
        assert.ok(/publish\s*=\s*"dist"/.test(b),
            'publish ainda aponta para a raiz, o que publica o codigo-fonte');
        assert.ok(/command\s*=\s*"node scripts\/publish\.mjs"/.test(b),
            'sem o passo de publicacao, dist nunca e preenchido');
    });

    it('o passo de publicacao barra o que nao deve vazar', () => {
        const src = fs.readFileSync(path.join(ROOT, 'scripts', 'publish.mjs'), 'utf8');
        ['netlify', 'tests', 'node_modules', '.git']
            .forEach(dir => {
                assert.ok(src.includes("'" + dir + "'"),
                    'o passo de publicacao nao bloqueia ' + dir);
            });
    });

    it('api e painel nao entram em cache', () => {
        const blocoApi = TOML.slice(TOML.indexOf('for = "/api/*"'));
        assert.ok(/Cache-Control = "no-store"/.test(blocoApi), '/api sem no-store');
        assert.ok(/X-Robots-Tag = "noindex"/.test(blocoApi), '/api sem noindex');
    });

    it('o relatorio fica fora do indice dos buscadores', () => {
        const blocoRel = TOML.slice(TOML.indexOf('for = "/relatorio/*"'));
        assert.ok(/noindex/.test(blocoRel), '/relatorio sem noindex');
        assert.ok(/X-Frame-Options = "DENY"/.test(blocoRel), '/relatorio pode ser embutido em iframe');
    });

    it('o passo de publicacao roda antes de qualquer deploy', () => {
        /* Sem isso, o CI passa, o comando de build falha e o deploy publica o
         * diretorio velho -- ou nada. */
        const workflow = fs.readFileSync(
            path.join(ROOT, '.github', 'workflows', 'deploy.yml'), 'utf8');
        assert.ok(/npm run (build|publish)/.test(workflow),
            'o workflow nao chama o passo de publicacao');
    });
});
