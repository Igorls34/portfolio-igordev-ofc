# IgorDev — Portfolio

Portfolio profissional de **Igor Laurindo (IgorDev)**, desenvolvedor freelancer
focado em sites responsivos, chatbots e automações.

Site estático, sem framework e sem build. O que você edita é o que vai para
produção.

**Produção:** <https://igordev.netlify.app>

## Stack

- HTML5, CSS3 e JavaScript (vanilla, ES6+)
- [Font Awesome 6](https://fontawesome.com) e [Inter](https://fonts.google.com/specimen/Inter) via CDN
- Netlify para hosting, GitHub Actions para deploy
- Node apenas para os testes e o lint (nada disso vai para o navegador)

## Estrutura

```
index.html              página única (hero, sobre, habilidades, projetos, contato)
404.html                página de erro, servida pela Netlify em URL inexistente
assets/
  css/style.css         estilos, design tokens em :root, responsivo
  js/core.js            funções puras, sem DOM (testáveis no Node)
  js/script.js          efeitos de interface e envio do formulário
  img/                  favicon, avatar e ilustração
  my-resume/            PDF do currículo
tests/core.test.js      testes unitários do core.js
netlify.toml            headers de cache e config de publicação
```

`core.js` carrega antes de `script.js` e é o que os testes importam. Regra da
casa: lógica que dá para escrever sem DOM vai para lá, porque só assim dá para
testar de verdade.

## Comandos

```bash
npm install       # instala eslint e stylelint
npm run dev       # sobe um servidor local
npm run lint      # eslint + stylelint
npm test          # node --test
npm run check     # lint + teste, o que roda antes de commit
```

## Formulário de contato

O formulário **não tem back-end próprio**. Ele chama duas APIs de terceiro,
servidas por proxy HTTPS atrás do Nginx:

| Canal | URL | Rota |
| --- | --- | --- |
| WhatsApp | `https://api.thessarasemijoias.com.br/wpp` | `/api/enviar-mensagem` |
| E-mail | `https://api.thessarasemijoias.com.br/email` | `/api/enviar-email` |

As URLs ficam no topo de `assets/js/script.js`, e não em variáveis de ambiente:
o projeto não tem build nem injeção de env na Netlify, então um `.env` não faria
nada. Os testes de `tests/core.test.js` travam esses hosts para avisar se um
deles mudar sem o resto do projeto acompanhar.

Cada canal é independente: se o WhatsApp cair e o e-mail responder, o visitante
vê um aviso honesto em vez de um "enviado" falso. As duas chamadas têm timeout
de 12s e há um campo honeypot contra spam.

> Essas duas URLs são o único ponto de falha do formulário e ficam num domínio
> sem relação com a marca. Se um dia der para hospedar o envio no mesmo
> domínio, o ideal é trocar por Netlify Functions (tem exemplo no histórico
> dessa branch).

## Analytics

Google Analytics (`G-0EDZHK8SL8`) e Microsoft Clarity (`w32g841pzr`) só são
carregados **depois** do aceite no banner de cookies, e o consentimento fica
guardado em `localStorage`. Sem aceite, nenhuma requisição é feita.

## Deploy

Push na `main` dispara o GitHub Actions, que publica na Netlify. Precisa dos
secrets `NETLIFY_AUTH_TOKEN` e `NETLIFY_SITE_ID` no repositório. O passo a
passo está em `DEPLOY_CHECKLIST.md`.

## Acessibilidade e desempenho

- `prefers-reduced-motion` respeitado no CSS **e** no JS (partículas, cursor,
  tilt e botão magnético não sobem)
- Heading outline correto, `skip-to-content`, `aria-expanded` no menu
- Canvas de partículas e cursor customizado pausam quando saem da tela ou a
  aba vai para segundo plano
- Se o JavaScript falhar, o site continua visível: as animações de entrada só
  ocultam elementos quando existe JS para reativá-los

## Licença

MIT — ver [LICENSE](LICENSE).
