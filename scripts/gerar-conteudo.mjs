/* Gera o HTML das secoes de habilidades e projetos a partir do JSON, e a
 * galeria de certificados a partir dos WebP convertidos localmente.
 *
 * Por que gerar em vez de buscar no navegador: o conteudo continua no HTML
 * entregue, que e o que o Google le. Um fetch feito pelo cliente tiraria
 * habilidades e projetos do HTML e, se a requisicao falhasse, a secao ficaria
 * vazia sem aviso. Aqui o JSON e a fonte unica da verdade e o HTML e o
 * resultado da build -- sem etapa de bundle, so um arquivo gerado.
 *
 * O escapeHtml nao e opcional: o JSON e um arquivo de conteudo, e um "<" num
 * titulo passaria a valer como tag. Reaproveita a funcao que o navegador ja
 * usa, para os dois lados escaparem do mesmo jeito.
 */

import { readFile, readdir, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);

/* O core.js e um UMD: no navegador vira PortfolioCore, no Node vira
 * module.exports. Importar pelo require e o caminho que o proprio
 * node --test usa. */
const { escapeHtml } = require(path.join(RAIZ, 'assets', 'js', 'core.js'));

const JSON_PATH = path.join(RAIZ, 'data', 'portfolio.json');
const CERTS_WEBP_DIR = path.join(RAIZ, 'certificados_webp');

/* O atraso da animacao de entrada vai ate d4 no CSS. Um quinto card receberia
 * uma classe sem estilo e apareceria sem o atraso, destoando dos outros. */
const MAX_REVEAL = 4;

function revealClass(indice) {
    return 'reveal reveal-d' + Math.min(indice + 1, MAX_REVEAL);
}

function renderSkill(skill, indice) {
    return [
        `                    <div class="skill-item col-6 col-lg-3 ${revealClass(indice)}">`,
        `                        <i class="${escapeHtml(skill.icon)}"></i>`,
        `                        <h3>${escapeHtml(skill.title)}</h3>`,
        `                        <p>${escapeHtml(skill.description)}</p>`,
        '                    </div>'
    ].join('\n');
}

function renderProjectLink(link) {
    return `                            <a href="${escapeHtml(link.href)}" class="btn-link" data-track="${escapeHtml(link.track)}" data-track-kind="project_repo" target="_blank" rel="noopener">${escapeHtml(link.label)}
                                <i class="fa-solid fa-arrow-up-right-from-square"></i></a>`;
}

/* Certificacao. O card e so a imagem do certificado: o titulo, o emissor e a
 * sigla ja estao impressos no proprio certificado, e repetir os tres ao lado
 * da imagem so duplicava o que a pessoa ja le na imagem.
 *
 * O texto continua no portfolio.json e volta no atributo alt. Nao e enfeite:
 * e o que um leitor de tela anuncia e o que o Google le. Um <img> sem alt
 * some da busca e fica mudo para quem nao ve.
 *
 * O link de credencial e opcional de proposito: nem toda certificado tem URL
 * publica, e um link quebrado no meio de uma home de venda passa mais
 * profissionalismo do que a informacao que promete. */
function renderCert(cert, indice) {
    const alt = cert.issuer
        ? `Certificado de ${cert.issuer}: ${cert.name}`
        : `Certificado: ${cert.name}`;
    const linhas = [
        `                    <figure class="cert-card col-6 col-lg-4 ${revealClass(indice)}" data-track="cert_${escapeHtml(cert.id || cert.name)}" data-track-kind="certification">`,
        `                        <button class="cert-preview" type="button" aria-label="Ampliar ${escapeHtml(alt)}">`,
        `                            <img class="cert-img" src="${escapeHtml(cert.image)}" alt="${escapeHtml(alt)}" loading="lazy" decoding="async">`,
        '                        </button>'
    ];

    if (cert.url) {
        linhas.push('                        <figcaption class="cert-overlay">');
        linhas.push(`                            <a href="${escapeHtml(cert.url)}" class="cert-link" data-track="cert_link_${escapeHtml(cert.id || cert.name)}" data-track-kind="certification_link" target="_blank" rel="noopener" aria-label="Ver credencial de ${escapeHtml(cert.name)}">
                                <i class="fa-solid fa-arrow-up-right-from-square"></i></a>`);
        linhas.push('                        </figcaption>');
    }

    linhas.push('                    </figure>');
    return linhas.join('\n');
}

function renderProject(project, indice) {    const linhas = [
    `                    <div class="project-card col-6 col-lg-4 ${revealClass(indice)}" data-track="card_${escapeHtml(project.id)}" data-track-kind="project">`,
        `                        <div class="project-icon"><i class="${escapeHtml(project.icon)}"></i></div>`,
        `                        <h3>${escapeHtml(project.title)}</h3>`,
        `                        <p>${escapeHtml(project.description)}</p>`
    ];

    if (project.techs && project.techs.length) {
        linhas.push('                        <div class="project-techs">');
        project.techs.forEach(tech => {
            linhas.push(`                            <span>${escapeHtml(tech)}</span>`);
        });
        linhas.push('                        </div>');
    }

    if (project.links && project.links.length) {
        linhas.push('                        <div class="project-links">');
        project.links.forEach(link => linhas.push(renderProjectLink(link)));
        linhas.push('                        </div>');
    }

    linhas.push('                    </div>');
    return linhas.join('\n');
}

/* O data-track do card precisa ser unico: e o que separa um projeto do outro
 * no painel. Dois ids iguais somariam as metricas de um no outro. */
/* O id de um item precisa ser unico por lista: e o que separa as metricas de
 * um item do outro no painel. Uma lista sem o atributo e comparada por nome. */
function idsRepetidos(itens) {
    const vistos = new Set();
    const repetidos = [];
    itens.forEach(item => {
        const id = String(item.id || item.name || '');
        if (vistos.has(id)) repetidos.push(id);
        vistos.add(id);
    });
    return repetidos;
}

function conferirUnicos(itens, rotulo) {
    const repetidos = idsRepetidos(itens);
    if (repetidos.length) {
        throw new Error(`id repetido em ${rotulo}, o painel de metricas contaria em dobro: `
            + [...new Set(repetidos)].join(', '));
    }
}

/* A imagem e o card inteiro agora. Sem ela o card sai vazio, e um src
 * quebrado nao da erro nenhum no build -- a imagem sobroken fica em
 * producao ate alguem clicar nela.
 *
 * O caminho tem que ser relativo e interno. Um "https://..." aqui colocaria
 * a imagem de fora no site, o que e o oposto do que a secao promete. */
function conferirCertificacoes(certificacoes) {
    certificacoes.forEach(cert => {
        const rotulo = cert.id || cert.name || '(sem id)';
        if (!cert.name) {
            throw new Error(`certificacao "${rotulo}" sem "name": o alt da imagem depende dele`);
        }
        if (!cert.image) {
            throw new Error(`certificacao "${rotulo}" sem "image": o card e so a imagem`);
        }
        if (/^([a-z]+:)?\/\//i.test(cert.image) || cert.image.startsWith('/')) {
            throw new Error(`certificacao "${rotulo}" com image fora do site: ${cert.image}`);
        }
    });
}

export function descobrirCertificacoes(certificacoes, arquivosWebp) {
    const metadados = new Map();
    certificacoes.forEach(cert => {
        const nomeImagem = cert.image ? path.parse(cert.image).name : '';
        const id = String(cert.id || '').toLowerCase();
        if (id) metadados.set(id, cert);
        if (nomeImagem) metadados.set(nomeImagem.toLowerCase(), cert);
    });
    return arquivosWebp
        .filter(arquivo => path.posix.extname(arquivo).toLowerCase() === '.webp')
        .sort((a, b) => a.localeCompare(b, 'pt-BR', { sensitivity: 'base' }))
        .map(arquivo => {
            const nome = path.posix.parse(arquivo).name;
            const nomeCertificado = /^(.*)_pagina_\d+$/i.exec(nome)?.[1] || nome;
            const existente = metadados.get(nomeCertificado.toLowerCase())
                || metadados.get(nome.toLowerCase());
            const id = nome.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');

            return {
                ...(existente || {}),
                id,
                name: existente?.name || `Certificado ${nomeCertificado}`,
                image: `certificados_webp/${arquivo}`
            };
        });
}

async function listarWebp(diretorio, relativo = '') {
    const entradas = await readdir(path.join(diretorio, relativo), { withFileTypes: true });
    const arquivos = await Promise.all(entradas.map(entrada => {
        const caminho = path.posix.join(relativo, entrada.name);
        return entrada.isDirectory()
            ? listarWebp(diretorio, caminho)
            : path.extname(entrada.name).toLowerCase() === '.webp' ? [caminho] : [];
    }));
    return arquivos.flat();
}

export function gerarHtml(dados) {
    const skills = Array.isArray(dados.skills) ? dados.skills : [];
    const projetos = Array.isArray(dados.projects) ? dados.projects : [];
    /* Certificacao e opcional: quem nao tem nenhuma nao deve ver um titulo de
     * certificacoes e um retangulo vazio. Com a lista vazia, quem decide o
     * que aparece e quem main() escreve o atributo hidden. */
    const certificacoes = Array.isArray(dados.certifications) ? dados.certifications : [];

    if (!skills.length) throw new Error('portfolio.json sem "skills"');
    if (!projetos.length) throw new Error('portfolio.json sem "projects"');

    conferirUnicos(projetos, 'projetos');
    conferirUnicos(certificacoes, 'certificacoes');
    conferirCertificacoes(certificacoes);

    return {
        skills: skills.map(renderSkill).join('\n'),
        projects: projetos.map(renderProject).join('\n'),
        certifications: certificacoes.map(renderCert).join('\n'),
        /* Sinaliza para o main: o bloco fica vazio e os dois lugares que o
         * cercam precisam do hidden. */
        temCertificacoes: certificacoes.length > 0
    };
}

/* Troca o conteudo entre as tags de comentario, preservando a indentacao do
 * arquivo. Substituir por regex sobre o HTML inteiro arriscaria comer markup
 * vizinho; o ancorador do comentario diz exatamente onde comeca e onde
 * termina o trecho gerado. */
function substituirBloco(html, marcador, conteudo) {
    /* O marcador entra num padrao, e "projects:inicio" com o ':' do espaco de
     * nome faria a regex interpretar ":inicio" como Lookbehind. E um valor
     * fixo do codigo, mas escapar deixa a intencao explicita.
     *
     * A tag de inicio aceita um texto depois do nome: e onde fica a nota de
     * qual arquivo alimenta o bloco. O ancorador do fim e exato. */
    const id = marcador.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const re = new RegExp(
        `(<!-- ${id}:inicio[^>]*-->)[\\s\\S]*?(<!-- ${id}:fim -->)`);
    if (!re.test(html)) {
        throw new Error(`marcador "${marcador}" nao encontrado no index.html`);
    }
    return html.replace(re, `$1\n${conteudo}\n                    $2`);
}

/* A secao de certificacoes e o item do menu sao os dois lugares que somem
 * quando nao ha certificado. O atributo hidden e preferido a remover o
 * elemento: o index.html continua legivel e o diff mostra o que o build
 * fez, em vez de um bloco inteiro aparecendo e sumindo do arquivo.
 *
 * Casa a tag inteira em vez de "data-cert-nav hidden": a posicao do hidden
 * dentro da tag nao e a mesma nos dois lugares, e o da section vem depois de
 * varios atributos. */
function alternarVisibilidadeCerts(html, visivel) {
    return html.replace(/<[^>]*data-cert-(?:section|nav)[^>]*>/g, tag => {
        const semHidden = tag.replace(/\s+hidden(?=[\s>])/, '');
        if (visivel) return semHidden;
        /* Antes do ">": a tag precisa continuar valida. */
        return semHidden.replace(/\s*>$/, ' hidden>');
    });
}

async function main() {
    if (!existsSync(JSON_PATH)) {
        console.error('[conteudo] nao encontrado:', JSON_PATH);
        process.exit(1);
    }

    const dados = JSON.parse(await readFile(JSON_PATH, 'utf8'));
    const certificacoes = descobrirCertificacoes(
        Array.isArray(dados.certifications) ? dados.certifications : [],
        await listarWebp(CERTS_WEBP_DIR)
    );
    const { skills, projects, certifications, temCertificacoes } = gerarHtml({
        ...dados,
        certifications: certificacoes
    });

    const indexPath = path.join(RAIZ, 'index.html');
    const original = await readFile(indexPath, 'utf8');
    let final = substituirBloco(original, 'skills', skills);
    final = substituirBloco(final, 'projects', projects);
    final = substituirBloco(final, 'certs', certifications);
    final = alternarVisibilidadeCerts(final, temCertificacoes);

    /* So escreve quando mudou: um build identico nao toca o arquivo, e o
     * mtime preservado evita rebuild em cache. */
    if (final === original) {
        console.log('[conteudo] index.html ja esta em dia com o JSON');
        return;
    }

    await writeFile(indexPath, final, 'utf8');
    console.log(`[conteudo] index.html atualizado: ${dados.skills.length} habilidade(s), `
        + `${dados.projects.length} projeto(s), `
        + `${certificacoes.length} certificacao(oes)`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
    main().catch(err => {
        console.error('[conteudo] falhou:', err && err.message);
        process.exit(1);
    });
}
