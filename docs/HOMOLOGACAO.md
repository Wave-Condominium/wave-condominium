# Ambiente de Homologação (Staging) — Wave Condominium

Guia operacional do ambiente de **homologação** do Wave. Homologação é um
ambiente idêntico ao de produção em comportamento, mas **isolado** (banco e
segredos próprios), usado para validar mudanças antes de irem para produção.

## Arquitetura escolhida

- **Banco:** projeto **Neon** dedicado (`wave-homologacao`), separado do de produção.
- **Branch:** **`develop`** é a branch de homologação.
- **Deploy:** integração Git da Vercel no projeto `wave-condominium`. Cada push
  em `develop` gera um deploy de **Preview**.
- **Domínio:** **`homolog.wavecondominium.com.br`** (atribuído à branch `develop`).
- **CI/CD:** a **Vercel** faz o deploy automático; o **GitHub Actions**
  (`.github/workflows/ci.yml`) roda o gate de qualidade (lint + types + build)
  nos Pull Requests.

Fluxo: `feature/* → PR → develop (homolog) → PR → main (produção)`.

## 1. Banco de homologação (Neon)

Projeto Neon separado `wave-homologacao` (região São Paulo). Copie a connection
string **direta** (sem `-pooler`, com `?sslmode=require`). Nunca usar o banco de
produção.

## 2. Variáveis na Vercel (escopo Preview)

| Variável                 | Valor (homologação)                            |
|--------------------------|------------------------------------------------|
| `DATABASE_URL`           | Connection string do Neon de homologação.      |
| `WAVE_SESSION_SECRET`    | Segredo novo, forte, diferente do de produção. |
| `WAVE_STELLAR_SECRET`    | Chave Stellar (testnet).                        |

Gerar segredo: `openssl rand -base64 48`.

## 3. Migrations e seed

O build (`prisma migrate deploy`) aplica as migrations no primeiro deploy com a
`DATABASE_URL` presente. Para popular usuários de teste, rodar localmente com a
`DATABASE_URL` de homologação exportada:

\`\`\`bash
npx prisma db seed   # senha de todos: Senha@12345
\`\`\`

Usuários: `admin@wave.com`, `sindico@wave.com`, `morador@wave.com`,
`administradora@wave.com`, entre outros.

## 4. CI — gate de qualidade

`.github/workflows/ci.yml` roda em PRs para `main` e `develop`: `npm ci`,
`prisma generate`, `lint`, `tsc --noEmit`, `next build`. Recomenda-se exigir o
check `Lint • Types • Build` como required nas branches.

## 5. Checklist

- [ ] Banco Neon de homologação provisionado.
- [ ] Env vars (Preview) setadas na Vercel.
- [ ] Deploy da `develop` verde.
- [ ] Migrations aplicadas e seed executado.
- [ ] Login por papel funcionando em `homolog.wavecondominium.com.br`.
- [ ] CI verde nos PRs.

## 6. Riscos

- Nunca apontar `DATABASE_URL` de homologação para produção.
- Segredos por ambiente: não reutilizar `WAVE_SESSION_SECRET`.
- Env vars de Preview valem para todas as branches de preview por padrão.
