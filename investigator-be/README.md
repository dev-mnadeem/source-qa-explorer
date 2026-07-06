# Codebase Investigator — Backend

NestJS API for **Codebase Investigator**. Clones a public GitHub repo, runs a tool-using Claude agent over it, and returns answers grounded in real file paths and line ranges. Every non-trivial answer is verified by an independent audit (programmatic citation check + a separate LLM auditor).

Frontend repo: [`investigator-fe`](../investigator-fe) (in this same monorepo).

## Tech stack

| Layer | Tech |
|---|---|
| Runtime | Node.js 22 |
| Framework | NestJS 11 (TypeScript, decorator-driven modules) |
| ORM | Prisma 6 (PostgreSQL) |
| Database | Supabase Postgres (sessions, messages, citations, audit verdicts) |
| LLM | AWS Bedrock — Claude Sonnet 4.5 (`@anthropic-ai/bedrock-sdk`) |
| Code retrieval | `ripgrep` (when available) + Node `fs` fallback |
| Repo cloning | `simple-git` (shallow clones into `/tmp`) |
| Validation | `class-validator` + `class-transformer` |
| API docs | `@nestjs/swagger` (OpenAPI at `/api/docs`) |
| Hosting | Railway |

## Architecture

- **Modules per concern** under `src/`:
  - `repos/` — parses GitHub URLs, shallow-clones into `/tmp/codebase-investigator/repos/<sessionId>`
  - `code/` — file-system tools the agent calls (`read_file`, `grep`, `list_dir`, `find_files`), all path-confined to the repo root
  - `database/` — Prisma + repository pattern (one repository per aggregate)
  - `sessions/` — create / fetch sessions, list messages, hydrate DTOs
  - `agent/` — Bedrock tool-use loop with a `submit_answer` terminal tool
  - `audit/` — the independent verification pipeline (see below)
  - `chat/` — public REST endpoints, orchestrates one full turn end-to-end
- **Repository layer** (`src/database/repositories/`) wraps every Prisma model so service code never speaks raw Prisma queries.
- **Multi-turn coherence** — when constructing the agent's history from prior turns, each prior assistant message is replayed with its citations annotated inline (`[Prior citations: src/auth.ts:12-40]`). Lets the model stay consistent or self-correct on pushback. Tool-call traces are *not* replayed.
- **Path-confined tools** — `CodeService.safeJoin` rejects any path that escapes the cloned repo with `..`, even if the model tries.

## How the audit works

The brief required: *"the audit has to come from somewhere else — a different model, a different prompt, a programmatic check, a separate context."* This system uses **two independent layers**, neither of which is the same call as the answer:

1. **Programmatic citation check** (`src/audit/audit.checker.ts`) — for every `(file, lineStart, lineEnd)` the agent returned: file exists? line range valid (`1 ≤ start ≤ end ≤ totalLines`)? excerpt non-whitespace? Catches hallucinated paths and off-by-large line numbers.
2. **Independent LLM auditor** (`src/audit/audit.llm.ts`) — a *second* Bedrock call with a skeptical system prompt, **no tool access**, given the question + answer + the actual cited excerpts + the programmatic result. Returns `trusted | partial | suspect` + reasons. Designed to flag hallucinated citations, claims unsupported by cited code, suggested fixes that would break callers, and logical gaps.

Final verdict = `min(programmaticImplied, llmStatus)` — if either layer downgrades, the verdict reflects that.

## Local development

Requirements: Node 22+, npm, a Supabase project, AWS credentials with Bedrock access (Claude Sonnet 4.5 enabled in your region).

```bash
git clone https://github.com/awais-aman/codebase-investigator.git
cd codebase-investigator/investigator-be
npm install

cp .env.example .env
# Fill in DATABASE_URL, DIRECT_URL, AWS_*

npx prisma migrate deploy
npm run start:dev
```

API: `http://localhost:4000/api`
Swagger: `http://localhost:4000/api/docs`

### Required env vars

```
DATABASE_URL=postgresql://postgres.<ref>:<password>@aws-...pooler.supabase.com:6543/postgres?pgbouncer=true
DIRECT_URL=postgresql://postgres.<ref>:<password>@aws-...pooler.supabase.com:5432/postgres
AWS_ACCESS_KEY_ID=AKIA...
AWS_SECRET_ACCESS_KEY=...
AWS_REGION=eu-north-1
AWS_BEDROCK_MODEL_ID=global.anthropic.claude-sonnet-4-5-20250929-v1:0
PORT=4000                          # optional; Railway injects its own
CORS_ORIGIN=http://localhost:3000  # comma-separated list for production
```

`AWS_BEDROCK_INVESTIGATOR_MODEL_ID` and `AWS_BEDROCK_AUDITOR_MODEL_ID` can be set separately if you want different models per role; otherwise both fall back to `AWS_BEDROCK_MODEL_ID`.

## Deployment (Railway)

This service is deployed at **<https://codebase-investigator-production.up.railway.app>** (Swagger: <https://codebase-investigator-production.up.railway.app/api/docs>).

To deploy a fresh copy:

1. New project → Deploy from GitHub repo
2. **Settings → Source → Root Directory**: `investigator-be`
3. **Settings → Build → Custom Build Command**:
   `npm install && npx prisma generate && npx prisma migrate deploy && npm run build`
4. **Settings → Deploy → Custom Start Command**: `node dist/main`
5. **Variables**: paste every var from `.env` (Railway injects its own `PORT`)
6. **Settings → Networking → Generate Domain** — copy the URL
7. Hit `https://codebase-investigator-production.up.railway.app/api/health` — should return `{"status":"ok"}`
8. Update `CORS_ORIGIN` to your Vercel URL once the FE is deployed

## API contract

OpenAPI spec is exposed at `GET /api/docs-json`. Endpoints are unauthenticated (sessions are gated by their opaque UUID, not by user login):

| Method | Path | Purpose |
|---|---|---|
| `POST` | `/api/sessions` | Start a session by cloning a public GitHub URL |
| `GET` | `/api/sessions/:id` | Fetch session metadata |
| `GET` | `/api/sessions/:id/messages` | List the conversation (with citations + audit verdicts) |
| `POST` | `/api/sessions/:id/messages` | Send a user question; returns the assistant message |
| `GET` | `/api/health` | Liveness probe |

## Tools the agent has

Schemas in `src/agent/agent.tools.ts`:

| Tool | What it does |
|---|---|
| `list_dir(path)` | Explore project structure |
| `read_file(path, line_start?, line_end?)` | Inspect actual code with line numbers |
| `grep(pattern, glob?, case_insensitive?)` | Search across the repo (ripgrep + Node fallback) |
| `find_files(pattern)` | Locate files by name substring |
| `submit_answer({answer, citations[]})` | **Terminal** — ends the loop with structured output |

`submit_answer` being a *tool* (not free-form text the server parses) means citations always arrive as structured objects — no fragile regex, no markdown escapes.

## Tests

```
21 unit tests, 4 suites:
  - repos.service.spec.ts   URL parsing, edge cases
  - code.service.spec.ts    file reads, listings, grep, traversal guard
  - audit.checker.spec.ts   citation verification — every failure mode
```

LLM-touching code (agent loop, LLM auditor) is exercised end-to-end in manual demo testing rather than via mocked unit tests — mocking the model defeats the point.

## Scripts

```bash
npm run start:dev       # watch mode, hot reload
npm run start:prod      # production: node dist/main
npm run build           # nest build → dist/
npm run test            # jest
npm run lint
npm run format
npm run prisma:migrate  # apply migrations
npm run prisma:studio   # open Prisma Studio at :5555
```

## Decisions worth knowing

- **Bedrock over direct Anthropic API** — uses my existing AWS access; same Claude model.
- **Lazy LLM client** — provider doesn't crash at boot if `AWS_*` vars are missing; calls fail at request time only. Lets `/api/health` and session-creation endpoints stay usable even with a misconfigured key.
- **No streaming** — answer + audit return atomically. Adds clarity at the cost of waiting 15-45s with a typing indicator.
- **No automated `/tmp` cleanup** — repos re-clone if the cache is wiped between requests; OS handles cleanup.
- **One repo per session** — switching repos means a new session. Simpler than mid-conversation repo swaps.
