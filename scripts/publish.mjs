/* Prepara o diretorio de publicacao.
 *
 * O site nao tem build de verdade: os scripts sao arquivos comuns e nao são
 * processados. Este passo nao compila nem renomeia nada -- ele apenas copia
 * para dist/ o que o navegador deve enxergar.
 *
 * A excecao e o conteudo: skills e projetos vem de data/portfolio.json e sao
 * escritos no index.html antes da copia. O conteudo continua no HTML entregue
 * (e o que o Google le), mas editar o portfolio passa a ser editar um JSON em
 * vez de mexer em markup.
 *
 * A razao de existir: com publish = "." a Netlify publicava a raiz inteira,
 * o que punha o codigo-fonte das functions, os testes e o package.json em
 * URLs publicas. Nao ha segredo ali dentro, mas expor a implementacao de um
 * endpoint que aceita escrita e um convite desnecessario. Com dist/, so o
 * que o visitante precisa chega a producao.
 *
 * Roda com node puro, sem dependencia: e uma copia com uma lista de exclusao.
 */

import { cp, mkdir, rm, readdir, stat } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { execFile } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DESTINO = path.join(RAIZ, 'dist');

/* O que vai para o site. Tudo que nao esta aqui fica de fora, e o padrao e
 * negar: um arquivo novo no repositorio nao entra no deploy sem passar por
 * esta lista. */
const PUBLICADOS = [
    'index.html',
    '404.html',
    'privacidade.html',
    'robots.txt',
    'sitemap.xml',
    'assets',
    'relatorio'
];

/* O que nunca entra, mesmo que alguém adicione na lista acima. */
const NUNCA = new Set(['node_modules', '.git', '.github', 'netlify', 'tests', 'dist']);

/* O gerador de conteudo escreve skills e projetos no index.html. Roda aqui
 * como processo separado porque usa createRequire: o core.js e um UMD comum ao
 * navegador e ao Node, e o require e o caminho que o proprio node --test usa. */
function gerarConteudo() {
    return new Promise((resolve, reject) => {
        execFile(process.execPath, [path.join(RAIZ, 'scripts', 'gerar-conteudo.mjs')],
            { stdio: 'inherit' }, (err) => (err ? reject(err) : resolve()));
    });
}

async function copiar(origem, destino) {
    const info = await stat(origem);
    if (info.isDirectory()) {
        if (NUNCA.has(path.basename(origem))) return 0;
        await mkdir(destino, { recursive: true });
        let total = 0;
        for (const entrada of await readdir(origem, { withFileTypes: true })) {
            if (NUNCA.has(entrada.name)) continue;
            total += await copiar(path.join(origem, entrada.name), path.join(destino, entrada.name));
        }
        return total;
    }
    await cp(origem, destino);
    return 1;
}

async function main() {
    /* O conteudo primeiro: a copia vem depois, para que dist/index.html ja
     * saia com as secoes geradas a partir do JSON. */
    await gerarConteudo();

    if (!existsSync(DESTINO)) {
        /* Falhar cedo e melhor do que um deploy com metade do site: o
         * diretorio de um build anterior nao pode sobreviver e se misturar
         * com o novo. */
        await mkdir(DESTINO, { recursive: true });
    } else {
        await rm(DESTINO, { recursive: true, force: true });
        await mkdir(DESTINO, { recursive: true });
    }

    let total = 0;
    const faltando = [];
    for (const item of PUBLICADOS) {
        const origem = path.join(RAIZ, item);
        if (!existsSync(origem)) {
            faltando.push(item);
            continue;
        }
        total += await copiar(origem, path.join(DESTINO, item));
    }

    if (faltando.length) {
        /* Um item da lista que sumiu do repositorio costuma ser renomeacao
         * esquecida, e o resultado seria um 404 em producao. */
        console.error('[publish] nao encontrado:', faltando.join(', '));
        process.exit(1);
    }

    console.log('[publish] dist/ pronto com', total, 'arquivo(s)');
}

main().catch(err => {
    console.error('[publish] falhou:', err && err.message);
    process.exit(1);
});
