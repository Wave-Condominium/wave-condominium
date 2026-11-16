# Documentação do projeto

```
docs/
├── getting-started.md       Primeira feature com o fluxo GAIDE, passo a passo
├── mcp-setup.md             Como conectar os servidores MCP em cada ferramenta
├── adr/                     Architecture Decision Records (use o skill adr-writer)
├── DEPLOY.md                Deploy em produção e variáveis de ambiente
├── POSTGRES_MIGRATION.md    Migração localStorage → PostgreSQL
├── DESIGN_SYSTEM.md         Design system e tokens (design-tokens.json)
├── HOMOLOGACAO.md           Roteiro de homologação
├── ROTEIRO_DEMO.md/.pdf     Roteiro do vídeo de demonstração
├── DEMO_EVIDENCIAS.md       Evidências da demo
├── PACOTE_EVIDENCIAS.md     Pacote de evidências (SOW Instaward, seção 6)
├── FLUXOGRAMA_AUTH_PERMISSOES.png/.pdf   Fluxo de autenticação e matriz RBAC
└── SEG-*.md                 Notas de segurança por card (cofre de segredos,
                             custódia de chave, SCA, eventos, CI/CD DevSecOps)
```

## ADRs

Os ADRs ficam em `adr/` como `NNNN-titulo-em-kebab-case.md` e são imutáveis depois de aceitos. Para criar um, use o skill `adr-writer` (`/adr-writer` no Claude Code e no Antigravity; fonte em `agents/skills/adr-writer.md`).

ADRs herdados do GAIDE, que descrevem por que a camada de governança existe:

- [`0001-adopt-harness-engineering-practices.md`](adr/0001-adopt-harness-engineering-practices.md) — adoção das práticas de harness engineering
- [`0002-adopt-security-harness.md`](adr/0002-adopt-security-harness.md) — harness de segurança
- [`0003-agent-agnostic-layout.md`](adr/0003-agent-agnostic-layout.md) — layout agnóstico de ferramenta

Decisões anteriores à adoção do GAIDE estão registradas nos documentos `SEG-*.md` e nos PRs correspondentes.

## Convenções

- Markdown padrão, sem extensões proprietárias.
- Documentos do projeto em português; os textos herdados do GAIDE (`getting-started.md`, `mcp-setup.md`, ADRs 0001–0003, `specs/`, `agents/`) ficam em inglês, como no template.
