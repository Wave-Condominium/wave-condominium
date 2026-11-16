# Wave — Intelligent Condominium Management on Stellar

> **Live Demo:** [wave-condominium.vercel.app](https://wave-condominium.vercel.app)
> **Repository:** [github.com/WaveCondominium/wave-condominium](https://github.com/WaveCondominium/wave-condominium)
> **Network:** Stellar Testnet · **Stage:** MVP Phase 1 (Instaward Stellar)

Wave is a condominium-management platform where every critical event — an approved
minute, a closed vote, a paid fee — generates a **SHA-256 hash anchored on the
Stellar blockchain** (`memo_hash`). The document never goes on-chain (LGPD/privacy
friendly); only its cryptographic fingerprint does. The blockchain layer is
**invisible to end users**: residents log in with e-mail and password — no wallets,
no crypto jargon.

---

## The Problem

Brazil has over **500,000 condominiums**, and the Instituto Pró-Síndico estimates
that **86%** show some form of financial mismanagement or deviation. The sector is
largely analog and opaque:

- **No financial transparency** — residents pay fees into budgets they cannot verify; receipts and reports are editable PDFs.
- **Governance without proof** — assembly votes and minutes live in editable documents that can be backdated or lost.
- **Payments disconnected from decisions** — no cryptographic link between a payment and the deliberation that authorized it.

Existing tools offer operational management, but **none anchor governance documents
on a public blockchain** with proof of integrity accessible to ordinary residents.

---

## The Solution

Every governance/payment event is fingerprinted server-side and anchored on Stellar
Testnet via `memo_hash`. Any resident can independently verify a payment or a
document on a public block explorer, without trusting the manager.

```
Vote closed / Minute approved / Payment settled
        ↓
SHA-256 hash generated server-side (Next.js Server Action)
        ↓
Hash anchored on Stellar Testnet via a memo_hash transaction
        ↓
Stellar tx hash stored — verifiable by anyone, anytime, at stellar.expert
```

**Key technical choices**
- **No smart contracts required** — `memo_hash` on simple transactions is enough for timestamping and proof-of-integrity at this stage.
- **Custodial by design** — only Wave's operator account signs Stellar transactions; residents never need wallets.
- **USDC-ready on-ramp** — the BRL → USDC → Stellar architecture is designed to plug into a real provider; the demo uses a mock conversion.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | Next.js 14 (App Router), React 18, TypeScript |
| Styling | Tailwind CSS, Radix UI, Lucide Icons |
| Backend | Next.js **Server Actions** ("use server"), layered architecture (repositories + services) |
| Database | **PostgreSQL** via **Prisma ORM** (migrations + seed) |
| Auth | **JWT sessions** (`jose`, HS256, httpOnly cookie) + **bcrypt** password hashing; **RBAC** with server-side guards |
| Blockchain | `@stellar/stellar-sdk` — Stellar Testnet (`memo_hash` anchoring) |
| Deploy | Vercel (managed PostgreSQL, e.g. Neon) |

> The previous prototype used `localStorage` with simulated auth. **This has been
> fully replaced** by PostgreSQL with secure, role-based sessions (see
> `docs/POSTGRES_MIGRATION.md`).

---

## Roles & Access Control (RBAC)

Three product profiles, with permissions enforced **on the server** (not just hidden
in the UI):

| Capability | Morador | Síndico | Administradora |
|---|:--:|:--:|:--:|
| View notices/boletos · vote on proposals | ✅ | ✅ | ✅ |
| Create notices · issue boletos · approve proposals | — | ✅ | ✅ |
| Create user accounts · management approvals | — | ✅ | ✅ |
| Multi-condominium panel · switch active condominium | — | — | ✅ |
| Data isolated per condominium (multi-tenant) | ✅ | ✅ | ✅* |

<sub>✅* Administradora: only the condominiums under its management.</sub>

Hierarchy: **Administradora ⊃ Síndico ⊃ Morador**. Every domain action is scoped by
`condominiumId` on the server; an Administradora selects an active condominium (the
session is re-issued) and `requireCondominioScope` confirms ownership.

📄 Full diagram: [`docs/FLUXOGRAMA_AUTH_PERMISSOES.pdf`](docs/FLUXOGRAMA_AUTH_PERMISSOES.pdf)

---

## Project Structure

```
prisma/
├── schema.prisma            # Domain models + enums (Condominium, User, Aviso,
│                            #   Reserva, Boleto, Proposta, Voto, Administradora)
└── migrations/              # Versioned SQL migrations
scripts/
└── seed.mjs                 # Idempotent seed (condos, users, demo data)
src/
├── app/
│   ├── actions/             # Server Actions (avisos, governanca, reservas,
│   │                        #   boletos, administradora, payment, ...)
│   └── dashboard/           # App routes (incl. /dashboard/administradora)
├── server/
│   ├── auth/                # session (jose JWT) + guards (RBAC)
│   ├── repositories/        # Prisma data access, scoped by condominiumId
│   └── services/            # authService, etc.
├── components/              # UI (Boletos, dao/, communication/, administradora/, ...)
├── hooks/                   # useAuth, useMenuBadges, ...
├── lib/                     # rbac, stellar, stellar-payment, ...
└── middleware.ts            # Session cookie gate for /dashboard/*
docs/                        # Migration, deploy, evidence, demo script, RBAC diagram
```

---

## Running Locally

### 1. Clone & install
```bash
git clone https://github.com/WaveCondominium/wave-condominium.git
cd wave-condominium
npm install
```

### 2. Configure environment
Copy the example and fill the values:
```bash
cp .env.example .env
```

| Variable | Description |
|---|---|
| `DATABASE_URL` | PostgreSQL connection string (local or managed, e.g. Neon) |
| `WAVE_SESSION_SECRET` | Strong random secret used to sign JWT sessions |
| `WAVE_STELLAR_SECRET` | Stellar **Testnet** secret key (starts with `S...`) — [generate one](https://laboratory.stellar.org/#account-creator?network=test) and fund via Friendbot |

### 3. Set up the database
```bash
npx prisma migrate dev     # applies migrations
npx prisma db seed         # loads demo condominiums, users and data
```

### 4. Run
```bash
npm run dev
```
Open [http://localhost:3000](http://localhost:3000).

### Demo credentials
Password for all demo accounts: **`Senha@12345`**

| Role | Email |
|---|---|
| Síndico | `sindico@wave.com` |
| Morador | `morador@wave.com` |
| Administradora | `administradora@wave.com` |

---

## Deployment

Production runs on Vercel with a managed PostgreSQL (Neon). The build runs
`prisma generate && next build`; migrations are applied with `prisma migrate deploy`
against the production database. Full steps and environment variables:
[`docs/DEPLOY.md`](docs/DEPLOY.md).

---

## Documentation

| Document | Contents |
|---|---|
| [`docs/POSTGRES_MIGRATION.md`](docs/POSTGRES_MIGRATION.md) | localStorage → PostgreSQL migration |
| [`docs/DEPLOY.md`](docs/DEPLOY.md) | Production deploy & environment variables |
| [`docs/FLUXOGRAMA_AUTH_PERMISSOES.pdf`](docs/FLUXOGRAMA_AUTH_PERMISSOES.pdf) | Authentication flow & RBAC matrix |
| [`docs/PACOTE_EVIDENCIAS.md`](docs/PACOTE_EVIDENCIAS.md) | Evidence package (Instaward SOW, section 6) |
| [`docs/ROTEIRO_DEMO.pdf`](docs/ROTEIRO_DEMO.pdf) | Demo video script |

### AI-assisted development (GAIDE)

This repository runs the [GAIDE](https://github.com/Ecoa-PUC-Rio/GAIDE) harness: spec-driven development with human approval at each step, portable agent procedures, and enforcement checks wired as hooks.

| Where | What |
|---|---|
| [`AGENTS.md`](AGENTS.md) | Canonical briefing read by every coding agent (Claude Code, Antigravity, Cursor, Codex, ...) |
| [`specs/constitution.md`](specs/constitution.md) | Ten non-negotiable principles; changeable only through an ADR |
| [`agents/skills/`](agents/skills/) | Procedures — `spec-writer`, `test-generator`, `code-reviewer`, `security-reviewer`, `verifier`, `adr-writer` (exposed as `/name`) |
| [`scripts/check-*.sh`](scripts/) | Enforcement checks: secrets, per-file syntax, SAST/SCA, safe-to-stop state |
| [`init.sh`](init.sh) | Session bootstrap: deps, Prisma client, tests, typecheck, health check |
| [`docs/getting-started.md`](docs/getting-started.md) | The flow, step by step |

The flow for a new feature: `/spec-writer` → approve the spec, plan and tasks → `/test-generator` → implement → `/code-reviewer` (clean context) → `/verifier` against the running app → commit. Edit procedures in `agents/skills/` and run `scripts/sync-adapters.sh`; CI fails if the generated bindings drift.

---

## Roadmap

| Milestone | Status |
|---|---|
| Stellar hash anchoring (governance) | ✅ Done |
| USDC payment settlement (testnet, mock on-ramp) | ✅ Done |
| PostgreSQL backend + role-based sessions | ✅ Done |
| Administradora module (multi-condominium) | ✅ Done |
| Real BRL → USDC on-ramp integration | 🔜 Next |
| Mainnet with paying condominiums | 🔮 Future |
| Soroban smart contracts (on-chain quorum) | 🔮 Future |

---

## Team

Built by the **Wave Condomínios** team (Rio de Janeiro / São Paulo, Brazil):

- **Melissa Tatiane** — CEO · Architect, Real Estate Operations
- **Renata França** — COO · Cartographer Engineer, Real Estate Broker, MBA (FGV)
- **Robson Maia** — CTO · Blockchain Developer

---

## Links

- 🌐 **Live Demo:** [wave-condominium.vercel.app](https://wave-condominium.vercel.app)
- 📦 **Repository:** [github.com/WaveCondominium/wave-condominium](https://github.com/WaveCondominium/wave-condominium)
- 🔭 **Stellar Testnet Explorer:** [stellar.expert/explorer/testnet](https://stellar.expert/explorer/testnet)

Ambiente de homologação - branch develop.
