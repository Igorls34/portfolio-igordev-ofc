# IgorDev — Portfolio

Portfolio profissional de **Igor Laurindo (IgorDev)**, desenvolvedor freelancer
focado em sites responsivos, chatbots e automações.

Site estático, sem framework e sem build. O que você edita é o que vai para
produção.

**Produção:** <https://igordev-portfolio-ofc.netlify.app>

## Stack

- HTML5, CSS3 e JavaScript (vanilla, ES6+)
- [Font Awesome 6](https://fontawesome.com) e [Inter](https://fonts.google.com/specimen/Inter) via CDN
- Netlify para hosting, GitHub Actions para deploy
- Node apenas para os testes e o lint (nada disso vai para o navegador)

## Estrutura

```
index.html              página única (hero, sobre, habilidades, projetos, contato)
404.html                página de erro, servida pela Netlify em URL inexistente
privacidade.html        política de privacidade (LGPD)
assets/
  css/                  estilos divididos em base, navegação, seções e responsivo
  js/core.js            funções puras, sem DOM (testáveis no Node)
  js/visual-effects.js  efeitos visuais, canvas e animações de entrada
  js/navigation.js     comportamento do menu móvel
  js/script.js          envio e validação do formulário de contato
  img/                  favicon, avatar e ilustração
  my-resume/            PDF do currículo
tests/core.test.js      testes unitários do core.js
netlify.toml            headers de cache e config de publicação
```

As páginas carregam os módulos CSS na ordem `base`, `navigation`, `hero`,
`sections`, `contact`, `pages` e `responsive`, mantendo a cascata previsível.
Na home, o JavaScript carrega `core.js` antes dos efeitos visuais, navegação e
formulário; a camada de analytics permanece no fim e isolada.

`core.js` concentra a lógica pura que pode ser testada sem DOM. Os módulos da
interface ficam separados por responsabilidade e usam essa camada quando
precisam de validação ou formatação compartilhada.

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

## Analytics e LGPD

Google Analytics (`G-0EDZHK8SL8`) e Microsoft Clarity (`w32g841pzr`) **não** são
carregados no `<head>`. Estavam lá, e carregados ali começam a coletar antes de
qualquer aceite. Agora:

- o banner de consentimento só aparece quando não há decisão salva em
  `localStorage` (chave `igordev_consent`), então não pisca para quem já
  respondeu;
- aceitar injeta os dois scripts; recusar remove o banner e não faz nenhuma
  requisição;
- `shouldLoadAnalytics()` só retorna verdadeiro para o valor exato `granted`, e
  o `localStorage` entra como parâmetro justamente para isso ser testável
  sem DOM.

Quem recusa continua com navegação, formulário e SEO intactos — só não há
métrica. A escolha fica guardada no navegador; limpando os dados do site, ela
some e o banner volta.

> Atenção do dono: o Microsoft Clarity grava sessão e pode capturar o que é
> digitado no formulário. A política de privacidade assume o consentimento por
> aceite, então a recomendação é não aceitar durante gravação de tela de
> demonstração, ou desativar os formulários no Clarity.

A política completa está em `privacidade.html`. O canal de contato citado lá é
o WhatsApp, que é o único publicado no site — vale trocar por um e-mail próprio
se você tiver um, porque o art. 41 da LGPD pede um contato claro e exato.

## Deploy

Push na `main` dispara o GitHub Actions, que publica na Netlify. Precisa dos
secrets `NETLIFY_AUTH_TOKEN` e `NETLIFY_SITE_ID` no repositório. O passo a
passo está em `DEPLOY_CHECKLIST.md`.

### Certificados

Para adicionar um certificado, coloque o PDF em `certificados/` e rode
`python conversor.py`. A galeria percorre automaticamente os WebPs em
`certificados_webp/` na próxima geração/publicação; não é necessário editar o
HTML ou o JSON. Cada imagem mantém a proporção original do WebP.

## Acessibilidade e desempenho

- `prefers-reduced-motion` respeitado no CSS **e** no JS (partículas, cursor,
  tilt e botão magnético não sobem)
- Outline de headings correto: um `h1` na página, `h2` por seção, `h3` nos
  cards, sem pular nível
- `skip-to-content`, `aria-expanded` no menu, banner de consentimento logo após
  o skip-link para que quem navega por teclado alcance os botões no primeiro `Tab`
- Canvas de partículas e cursor customizado pausam quando saem da tela ou a
  aba vai para segundo plano
- Se o JavaScript falhar, o site continua visível: as animações de entrada só
  ocultam elementos quando existe JS para reativá-los

## Licença

MIT — ver [LICENSE](LICENSE).
