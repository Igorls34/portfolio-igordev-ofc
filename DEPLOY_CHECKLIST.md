# Deploy Automático - CI/CD

## Configuração Única (primeira vez)

### 1. Criar token no Netlify
Acesse https://app.netlify.com/user/applications#personal-access-tokens
Clique em "New access token", dê um nome e copie o token gerado.

### 2. Criar site no Netlify (via terminal)
```bash
npm install -g netlify-cli
netlify login
netlify sites:create --name igordev-portfolio
```
Anote o **Site ID** que aparece (ex: `abc123-def456-...`).

### 3. Adicionar secrets no GitHub
No repositório GitHub, vá em **Settings > Secrets and variables > Actions**:
- `NETLIFY_AUTH_TOKEN` = token copiado no passo 1
- `NETLIFY_SITE_ID` = Site ID do passo 2

### 4. Push para ativar
```bash
git add .
git commit -m "feat: upgrade premium + CI/CD"
git push origin main
```

O deploy acontece automaticamente a cada push na branch `main`.
O site ficará em: `https://igordev-portfolio.netlify.app`

---

## Site personalizado com domínio próprio

1. Compre um domínio (ex: igordev.com.br no Registro.br)
2. No Netlify, vá em **Site settings > Domain management > Add custom domain**
3. Configure o DNS do seu domínio apontando para os servidores do Netlify

---

## Atualizado em: Junho 2026
