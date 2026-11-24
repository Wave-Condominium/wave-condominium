# Project Briefing

> **How to use this file:** this is the canonical briefing for **any** coding agent working on this repository — Claude Code, Google Antigravity, Cursor, Codex, Zed, Copilot, Gemini CLI, or a human. Tools that read `AGENTS.md` load it natively; Claude Code loads it via `.claude/CLAUDE.md`; Antigravity via `.agents/rules/`. It is the GAIDE briefing, adapted to this project — keep it current when the stack or the conventions change.

---

## Overview

**Project name:** Wave — Gestão Condominial Inteligente (`wave-gestao-condominial`)

**One-line description:** Condominium management platform with integrity anchoring on Stellar — governance votes, assessments (boletos), reserve fund and multi-condominium administration.

**Current status:** in development (demo deployed on Vercel; PostgreSQL backend and RBAC in place)

## Tech stack

- **Primary language:** TypeScript 5 on Node.js 22
- **Framework:** Next.js 14.2 (App Router, Server Actions) + React 18, Tailwind CSS 3 + Radix UI
- **Database:** PostgreSQL via Prisma 6 (`prisma/schema.prisma`, versioned migrations)
- **Auth:** session cookie with `jose` JWT + RBAC guards (`src/server/auth/`)
- **Blockchain:** Stellar SDK (testnet) for hash anchoring and USDC settlement
- **Tests:** Vitest (`npm test` → `vitest run`, pure-logic tests in `src/**/*.test.ts`)
- **Deployment:** AWS (CloudFront + S3 + ECS Fargate + RDS, Terraform in `infra/`, ADR 0004); `develop` → homolog, `main` → prod via `.github/workflows/deploy.yml`; Prisma migrations run on container start

## Relevant folder structure

```text
.
├── AGENTS.md               This file — canonical agent briefing
├── agents/                 Portable agent procedures (single source of truth)
│   ├── skills/             Skills: spec writing, review, ADRs, tests, verification
│   └── reviewers/          Clean-context reviewer rubrics
├── scripts/
│   ├── check-*.sh          Portable GAIDE enforcement checks
│   ├── sync-adapters.sh    Regenerates the per-tool bindings
│   ├── security/           Project security gates used by CI (SAST / SCA / bundle)
│   └── seed.mjs            Idempotent database seed
├── specs/                  SDD specs — source of truth for behavior
│   ├── constitution.md     Non-negotiable principles
│   └── template/           Spec / plan / tasks templates
├── prisma/                 schema.prisma + versioned migrations
├── src/
│   ├── app/                App Router routes, `actions/` (Server Actions), `api/`
│   ├── server/             auth (session + RBAC guards), repositories (Prisma,
│   │                       scoped by condominiumId), services, security, psp,
│   │                       openfinance, access
│   ├── components/         UI by domain (boletos, dao, treasury, meetings, ui, ...)
│   ├── lib/                rbac, validators, stellar, memberships, ...
│   ├── hooks/ contexts/ i18n/ types/
│   └── middleware.ts       Session cookie gate for /dashboard/*
├── docs/                   Project docs (deploy, migration, SEG-* security notes)
│   └── adr/                Architecture Decision Records
├── security/               Documented SAST / SCA exceptions (allowlists)
├── .semgrep/               Project-specific Semgrep rules
├── PROGRESS.md             Session log — read at start, update at end (gitignored)
└── init.sh                 Session bootstrap: bring-up + health check
```

Tool-specific bindings (generated from the portable sources by `scripts/sync-adapters.sh` — never edit them directly): `.claude/` for Claude Code, `.agents/` for Antigravity.

## Session protocol

- **At session start:** run `./init.sh` (environment bring-up + health check — a failure means inherited broken state), then read `PROGRESS.md` and the recent `git log` to understand where the last session left off. If the previous session left something broken, fix that before starting new work. `PROGRESS.md` is local and gitignored — if it doesn't exist yet, create it (title + dated entries with done / next / known issues, newest first).
- **At session end:** append an entry to `PROGRESS.md` (done / next / known issues).

## Mandatory operating principles

Before any code change, the agent MUST:

1. **Read the constitution** at `specs/constitution.md`.
2. **Check whether a spec exists** for the feature at `specs/<feature>/spec.md`.
3. **If no spec exists**, propose writing one using the `spec-writer` skill before coding.
4. **Follow the SDD flow**: spec → plan → tasks → implementation.
5. **Never edit tests or task lists to make work appear done** (Constitution Principle 9).

## Enforcement checks

The checks in `scripts/` are the portable enforcement layer. In Claude Code they fire automatically as hooks; **in every other tool, run them yourself**:

- `scripts/check-file.sh <file>` — syntax check after editing a file
- `scripts/check-security.sh <file>` — SAST (semgrep) on an edited source file; for `package.json` / `package-lock.json` it runs this project's own SCA gate (`scripts/security/audit-gate.mjs`, SEG-013) instead of osv-scanner, so the local hook and CI give the same verdict
- `scripts/check-secrets.sh` — secret-pattern scan of content on stdin
- `scripts/check-clean-state.sh` — before ending a session with uncommitted changes: secrets (gitleaks) + test suite

Whatever the tool, the guaranteed floor is the same for everyone: pre-commit (`.pre-commit-config.yaml`) and CI (`.github/workflows/ci.yml`). This project predates GAIDE's security workflow and keeps its own, stricter gates, which are the required checks on `main` and `develop`:

- **Secret Scan (gitleaks)** — blocks on any secret pattern in the analysed range (SEG-005).
- **Dependências (SCA)** — `scripts/security/audit-gate.mjs` blocks on High/Critical unless there is a valid, dated exception in `security/audit-exceptions.json` (SEG-013). Also publishes an npm audit report and a CycloneDX SBOM.
- **SAST (Semgrep)** — project rulesets plus `.semgrep/custom-rules.yml`; `scripts/security/sast-gate.mjs` blocks on ERROR findings unless allowlisted in `security/sast-exceptions.json` (SEG-021).
- **Lint • Types • Test • Build** — ESLint, `tsc --noEmit`, Vitest, `next build`, plus a client-bundle secret scan (SEG-006).
- **Adapter drift (sync-adapters)** — fails if `.claude/` or `.agents/` drift from `agents/`.

Because those gates carry documented exception allowlists, GAIDE's own `.github/workflows/security.yml` is deliberately **not** installed: it would run the same three scanners without the allowlists. Never silence a finding to make a gate pass (Principle 10) — add a justified, dated exception in a dedicated commit, or fix the code.

## Ground rules (enforced as deny-permissions where the tool supports it)

- Never read `.env` files, private keys (`*.pem`, `*.key`, `id_rsa*`), or credential stores (`~/.ssh`, `~/.aws`, `~/.config/gcloud`).
- Never run `git push --force`, `git reset --hard`, or pipe downloads into a shell.
- Secrets never enter versioned files, even as examples (Constitution Principle 6).

## Code conventions

- **Language:** code, identifiers and docs in the repo mix English and Portuguese — follow the convention of the file you are editing. Domain terms stay in Portuguese (`boleto`, `assembleia`, `condominio`, `aviso`); new code comments follow the surrounding file.
- **Lint / types:** `npm run lint` (ESLint + `eslint-config-next`) and `npx tsc --noEmit` must pass. Both are required CI checks.
- **Tests:** Vitest, colocated as `src/**/*.test.ts`, pure logic (no DOM). Behavioral changes to RBAC, validators, boletos or governance require tests.
- **Data access:** always through `src/server/repositories/`, scoped by `condominiumId` — never query Prisma directly from a component or route.
- **Authorization:** every Server Action and route handler goes through the guards in `src/server/auth/`; multi-tenant isolation is a security requirement, not a detail (see the abuse-case section of the spec template).
- **Commits:** Conventional Commits, in Portuguese, with the security card as scope where applicable (e.g. `chore(seg-013): ...`).
- **Branches:** `develop` and `main` are protected — work lands through a branch plus a pull request, never a direct push.

## Critical integrations

- **PostgreSQL** — via Prisma (`@prisma/client`); migrations in `prisma/migrations/`. A read-only MCP server is declared but disabled in `.mcp.json`.
- **Stellar (testnet)** — via `@stellar/stellar-sdk` (`src/lib/stellar*.ts`): hash anchoring for governance and USDC settlement.
- **PSP / Open Finance** — `src/server/psp/` and `src/server/openfinance/` (payment and bank integration surfaces).
- **Vercel Blob** — `@vercel/blob` for file storage.
- **GitHub Actions** — CI gates in `.github/workflows/ci.yml` (see *Enforcement checks*).

MCP servers are declared in `.mcp.json` (canonical reference). See `docs/mcp-setup.md` for connecting them in each tool.

## How the agent should work

- **Current autonomy mode:** HIC (every code change requires explicit human approval before commit).
- **Change size:** prefer small, atomic changes. No sweeping refactors without an ADR.
- **Comments:** only when the *why* is not obvious from the code.
- **Tests:** changing code that affects behavior without changing/adding tests is forbidden.
- **Logging:** follow the convention defined in a `docs/adr/NNNN-logging-strategy.md` ADR (create one if missing).

### Karpathy-inspired operating principles

These principles complement the constitution and keep agent behavior aligned with lean, deliberate coding:

- **Think before coding:** state assumptions explicitly, surface uncertainty early, and ask clarifying questions instead of silently guessing.
- **Simplicity first:** prefer the smallest code that solves the actual problem; avoid speculative abstractions, unnecessary config, or "clever" designs.
- **Surgical changes:** touch only what is required for the task; do not refactor or "clean up" unrelated code, and preserve the existing style unless the task requires a justified change.
- **Goal-driven execution:** define success criteria upfront, verify with tests or checks, and loop until the result is demonstrably correct rather than merely plausible.

In practice, this means: clarify ambiguities before implementation, keep diffs minimal, and verify behavior against the spec before claiming the task is done.

### Session operating loop

Use this sequence in every non-trivial session. It is intentionally explicit so the agent does not drift into vague "make it work" mode:

1. **Read the brief and the repo contract**
   - Read `AGENTS.md`, the relevant spec, and the constitution if the task changes behavior.
   - Identify the exact user goal and the scope boundary.

2. **State assumptions and surface uncertainty**
   - Write down what is known, what is ambiguous, and what decisions require confirmation.
   - If the task is underspecified, ask before implementing.

3. **Define success criteria before code**
   - Translate the request into verifiable outcomes: what should happen, what should not happen, and how it will be checked.
   - Prefer testable criteria over general statements like "works well".

4. **Check for the required spec/test path**
   - If behavior changes, confirm the applicable spec exists.
   - If no spec exists, propose writing one before implementation.
   - For behavioral fixes, add or update the failing test first.

5. **Make the smallest possible change**
   - Do not refactor adjacent code.
   - Do not add abstractions or options that were not requested.
   - Keep the diff limited to the feature or bug being solved.

6. **Verify against the actual task**
   - Run the smallest relevant validation: targeted tests, syntax checks, security checks, or manual verification.
   - Treat verification as part of the task, not an optional afterthought.

7. **Review for drift**
   - Check whether the change stayed inside scope.
   - Remove dead code only if it was created by this task.
   - Confirm there are no accidental edits outside the requested feature.

8. **Report outcome with evidence**
   - State what changed, what was validated, and what remains uncertain.
   - Do not claim completion without evidence from the actual checks run.

This loop is the default for agent work in this repository, and it should be used whenever the task is more than a one-line typo or a trivial edit.

## Available skills

Source of truth in `agents/skills/` (Claude Code exposes them as `/name` via `.claude/skills/`; Antigravity as `/name` workflows via `.agents/workflows/` — both generated):

- `spec-writer` — write SDD specs
- `code-reviewer` — review the current diff in a clean context (rubric in `agents/reviewers/code-reviewer.md`; never pass the reviewer the implementation conversation)
- `security-reviewer` — security review of the current diff (rubric in `agents/reviewers/security-reviewer.md`); use for changes touching auth, sensitive data, external input, or new dependencies
- `verifier` — exercise a feature end-to-end against the spec's criteria; the only path to `verified` status
- `adr-writer` — record architectural decisions
- `test-generator` — generate tests from a spec

## Contacts and governance

- **Maintainers:** Wave Condomínios team — Melissa Tatiane (CEO), Renata França (COO), Robson Maia (CTO).
- **Review channel:** GitHub pull requests on `WaveCondominium/wave-condominium`; `develop` is the integration branch.
- **Autonomy mode:** HIC — no commit without explicit human approval.
