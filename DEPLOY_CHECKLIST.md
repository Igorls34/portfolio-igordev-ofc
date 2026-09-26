# Deploy Automático - CI/CD

## Configuração Única (primeira vez)

### 1. Criar token no Netlify
Acesse https://app.netlify.com/user/applications#personal-access-tokens
Clique em "New access token", dê um nome e copie o token gerado.

### 2. Criar site no Netlify (via terminal)
```bash
npm install -g netlify-cli
netlify login
netlify sites:create
```
Anote o **Site ID** que aparece (ex: `abc123-def456-...`).

O domínio de produção é `https://igordev-portfolio-ofc.netlify.app`, e é o que
está no `canonical`, no Open Graph, no `robots.txt` e no `sitemap.xml`.

> **Atenção:** existe um `igordev.netlify.app` que responde 200, mas é **outro
> site** — não é este portfolio. Ele já foi confundido com o de produção porque
> todo mundo só olhava o status 200 e não o conteúdo. Confira sempre o título da
> página, não só se ela abre. A URL real sai no log do deploy:
> `Published on https://... as production`.
>
> Se você trocar de site, atualize os quatro arquivos acima. O teste
> `dominio de producao` em `tests/core.test.js` falha se algum deles ficar
> fora de sincronia, então o CI avisa antes de publicar.

### 3. Adicionar secrets no GitHub
No repositório GitHub, vá em **Settings > Secrets and variables > Actions**:
- `NETLIFY_AUTH_TOKEN` = token copiado no passo 1
- `NETLIFY_SITE_ID` = Site ID do passo 2

### 4. Push para ativar
```bash
git add .
git commit -m "chore: ajusta deploy"
git push origin main
```

O deploy acontece automaticamente a cada push na `main`.

---

## Rodar a verificação antes de dar push

```bash
npm install
npm run check
```

`npm run check` roda o lint e os 53 testes. Vale rodar sempre: a branch de
correções que consolidou o formulário foi montada com essa verificação.

---

## Deploy manual (quando o Actions falhar)

```bash
npm install -g netlify-cli
netlify deploy --prod --dir .
```

---

## O que a Netlify serve

- `netlify.toml` publica a raiz do repositório
- `404.html` é a página de erro para URL inexistente
- `assets/img/*` fica em cache por 7 dias
- `assets/css/*`, `assets/js/*` e `index.html` revalidam sempre, porque não
  têm hash no nome — com `immutable` o cliente nunca receberia uma atualização

Não existe mais o redirecionamento `/*` para `/index.html`: ele devolvia 200
com a home em qualquer URL errada, o que confunde buscadores (soft 404).

---

## Depois do deploy, confira

```bash
curl -I https://igordev-portfolio-ofc.netlify.app/                  # esperado: 200
curl -I https://igordev-portfolio-ofc.netlify.app/privacidade.html  # esperado: 200
curl -I https://igordev-portfolio-ofc.netlify.app/rota-que-nao-existe  # esperado: 404
```

O último é o que garante que o `404.html` está de pé e que a URL inválida não
volta a devolver 200.

E confira o **conteúdo**, não só o status:

```bash
curl -s https://igordev-portfolio-ofc.netlify.app/ | grep -c "consent-banner"
```

Tem que vir `1`. Se vier `0`, você está olhando outro site — foi assim que o
domínio errado entrou no `canonical` uma vez.

Confira também, no navegador: aba **Network** recarregando a home com o
`localStorage` limpo, e confirme que **nenhuma** requisição para
`googletagmanager.com` ou `clarity.ms` aparece antes de clicar em *Aceitar* no
banner.

---

## Site personalizado com domínio próprio

1. Compre um domínio (ex: igordev.com.br no Registro.br)
2. No Netlify, vá em **Site settings > Domain management > Add custom domain**
3. Configure o DNS do seu domínio apontando para os servidores do Netlify
4. Atualize o `canonical`, as tags `og:url`, o `robots.txt` e o `sitemap.xml`
   para o novo domínio

---

## Atualizado em: Setembro 2026
