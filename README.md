# Codebase Investigator

> **Live demo:** <https://codebase-investigator-eight.vercel.app>
> **API + Swagger:** <https://codebase-investigator-production.up.railway.app/api/docs>

Paste a public GitHub URL, ask questions about the code in plain English, and
get answers grounded in specific files and line ranges. **Every non-trivial
answer ships with an independent audit verdict.**

> *"Investigating shiftsync-fe — does this app actually protect routes?"
> Audit: **Partial.** "The proxy middleware is described as active but no
> middleware.ts file imports it — the protection mechanism may not be wired
> up." That's the auditor catching a real architectural gap that the
> investigator only hedged on.*

---

## Layout

```
codebase-investigator/
├── investigator-be/   NestJS API — agent loop, code tools, audit pipeline
├── investigator-fe/   Next.js App Router — chat UI
└── README.md          (this file)
```

Both apps live in one git repo for convenience but deploy independently:

- **Frontend** → Vercel (Root Directory: `investigator-fe`)
- **Backend** → Railway (Root Directory: `investigator-be`)

## Stack

| Layer | Choice | Why |
| --- | --- | --- |
| Backend | NestJS 11 + Prisma 6 | Mature DI / module system; matches my existing house style |
| Database | Supabase Postgres | Persistence for sessions, messages, citations, audit verdicts |
| LLM | AWS Bedrock — Claude Sonnet 4.5 | Same model handles investigator and auditor; different system prompts |
| Code retrieval | `ripgrep` + Node `fs` | Grep-based retrieval beats embeddings for code |
| Frontend | Next.js 16 (App Router) + React 19 | Server components by default, client only where needed |
| Data | TanStack Query 5 | Server state, optimistic updates |
| Style | Tailwind 4 | shadcn-ish utility components |

## Local setup

### 1. Backend

```bash
cd investigator-be
cp .env.example .env       # then fill DATABASE_URL, DIRECT_URL, AWS_*
npm install
npm run prisma:migrate     # first time only — creates tables in Supabase
npm run start:dev          # http://localhost:4000/api
```

Swagger UI: <http://localhost:4000/api/docs>

### 2. Frontend

```bash
cd investigator-fe
cp .env.example .env.local
npm install
npm run dev                # http://localhost:3000
```

---

## How the audit works

The brief is explicit:

> *"Self-scoring in the same prompt as the answer doesn't count.
> The audit has to come from somewhere else — a different model, a different
> prompt, a programmatic check, a separate context."*

This system uses **two independent layers**, neither of which is the same
call as the answer:

### 1. Programmatic citation check

For every `(file_path, line_start, line_end)` the agent submits, the checker:

- Verifies the file exists in the cloned repo
- Confirms the line range is valid (`start ≥ 1`, `end ≥ start`, `end ≤ totalLines`)
- Reads the actual file content and stores it as the citation excerpt
- Rejects whitespace-only ranges (you can't cite a blank block)

This catches the most common hallucinations: invented file paths, off-by-large
line numbers, citing files the agent never opened.

The result is a `pass: boolean` plus per-citation annotations
(`verified: true/false`).

### 2. Independent LLM auditor

A **second** Bedrock call, with:

- A **different system prompt** that tells the model it is a skeptical reviewer,
  not the answerer ([investigator-be/src/audit/audit.prompt.ts](investigator-be/src/audit/audit.prompt.ts))
- **No tool access** — it cannot navigate the code on its own
- The user question, the assistant answer, the programmatic check result, and
  the **actual cited excerpts** as context
- A strict JSON output contract (`status` + `reasons`)

The auditor is told to look for: hallucinated citations, claims not supported
by the cited code, suggested fixes that would break callers, logical gaps.

### Combined verdict

`status = min(programmaticImplied, llmStatus)`. If either layer downgrades the
answer, the final verdict reflects that. The user sees the verdict as a colored
badge next to the answer; clicking it reveals both layers' reasoning.

### Real example from testing

When I tested on my own `shiftsync-fe` repo with *"How does authentication
work here?"*, the audit returned **Partial** with this reason:

> *"The assistant correctly identifies that the proxy middleware includes a
> Next.js config export but cannot find evidence it's actually imported in a
> middleware.ts file… this is a significant architectural gap that affects
> the core claim about how route protection works."*

The audit was right. There is no `middleware.ts` in my own app — the proxy
middleware is genuinely orphaned. The codebase investigator caught a real
issue I hadn't noticed.

When I followed up with *"so what actually protects routes today?"*, the
agent did fresh investigation, sharpened its answer, and the audit returned
**Trusted** — because the new claims were airtight. The audit is calibrated:
it gives Partial when there's a real concern and Trusted when it's earned.

---

## How multi-turn coherence works

The brief calls out the failure modes:

> *"...not repeat itself, not lose earlier claims, not silently drop context."*

Each user message goes through `ChatService.sendMessage`, which:

1. Loads the prior persisted messages for the session
2. Builds an Anthropic-shaped history where each prior assistant turn carries
   its citations inline (e.g. `[Prior citations: src/auth.ts:12-40]`)
3. Sends `(history, new user message)` to the agent

Citations are replayed inline so the model has its own prior factual claims
visible — that's what lets it stay consistent or correct itself when pushed
back. Tool-call traces are *not* replayed (would bloat context with no
benefit).

End-to-end test confirmed: when I pushed back on a hedged claim from turn 1,
the agent acknowledged the earlier statement, did fresh investigation, and
upgraded the answer rather than contradicting itself.

---

## Architecture

```
HTTP (Next.js client)
  │
  └─→ POST /api/sessions/:id/messages
        │
        └─→ ChatService.sendMessage()
              ├─→ load prior messages → build agent history
              ├─→ AgentService.investigate()              ← Bedrock call #1
              │     loop until submit_answer or max_turns:
              │       model decides → tool dispatch (read_file/grep/list_dir/
              │       find_files) → tool_result → model decides...
              │
              ├─→ AuditService.run()
              │     ├─→ AuditChecker.check()              ← programmatic
              │     │     verify each citation against the source
              │     └─→ AuditLlm.audit()                  ← Bedrock call #2
              │           skeptical reviewer, no tools
              │
              └─→ persist Message + Citations + AuditVerdict → return DTO
```

### Backend modules

```
src/
├── repos/             clone GitHub URLs into /tmp, manage repo lifecycle
├── code/              read_file, grep, list_dir, find_files (path-confined)
├── database/          Prisma + repository pattern
│   └── repositories/  one repository per aggregate
├── sessions/          create/get session, list messages
├── agent/             Bedrock tool-use loop, system prompt, 5 tools
├── audit/             programmatic checker + LLM auditor + service
├── chat/              REST endpoints, orchestration, multi-turn history
├── common/            shared providers (Bedrock client)
└── shared/            constants
```

### Tools the agent has

- `list_dir(path)` — explore project structure
- `read_file(path, line_start?, line_end?)` — inspect actual code
- `grep(pattern, glob?, case_insensitive?)` — find symbols/strings (uses
  `ripgrep` if available, falls back to a Node walker)
- `find_files(pattern)` — locate files by name substring
- `submit_answer({answer, citations[]})` — terminal tool; calling it ends the
  loop with a structured payload

`submit_answer` being a tool (not free-form text the server parses) means
citations arrive as `{file_path, line_start, line_end}` objects every time —
no fragile regex, no markdown escapes, no missed brackets.

### Frontend conventions

- `type Props = {...}` everywhere
- Server components by default; `"use client"` only where state/handlers exist
- TanStack Query owns server state (4 hooks: `useCreateSession`, `useSession`,
  `useMessages`, `useSendMessage` with optimistic update)
- Markdown rendering for assistant messages (`react-markdown` + GFM)

---

## What I cut and why (one-day budget)

The brief said *"we're watching how you scope, what you cut, and what you keep."*

| Cut | Reason |
| --- | --- |
| Auth, accounts, sharing | Sessions are opaque-id-gated; nobody else needs to see them |
| Streaming responses | Adds SSE complexity for ~10% UX gain. Answer + audit return atomically |
| Embeddings / vector search | Grep is faster and more accurate for code questions |
| Per-tenant Bedrock model splits | Shipped one model for both investigator and auditor; brief allows it |
| Polished design system | Plain Tailwind, no shadcn pipeline. UI is functional, not beautiful |
| Unit tests for the LLM auditor | Tested the *programmatic* checker (deterministic) — auditor is exercised end-to-end via real demo |
| Mid-conversation repo switching | One repo per session. Want a different repo? Start a new session |
| Persistent /tmp clones | Repos re-clone on demand if the cache is wiped |

## What I kept sharp

- **Citations are real and clickable.** Each one links to GitHub at the exact
  line range (`/blob/HEAD/path#L23-L58`)
- **Tool-call trace is visible to the user.** A collapsible `Tool calls (N)`
  section lists everything the agent ran. Builds trust — they see what
  actually happened
- **The audit is calibrated, not noise.** Verdicts are Partial / Trusted /
  Suspect with substantive reasons, not hand-waving confidence numbers
- **Multi-turn coherence actually works.** Verified end-to-end with pushback
  in testing
- **Path-confinement on tool calls.** Agent can't escape the cloned repo with
  `..` even if the model tries

## Test status

```
21 unit tests passing across 4 suites:
  - repos.service.spec.ts   (URL parsing, edge cases)
  - code.service.spec.ts    (read_file, listDir, findFiles, grep, traversal guard)
  - audit.checker.spec.ts   (citation verification, all failure modes)
```

The LLM-touching code (agent loop, LLM auditor) is exercised end-to-end in
manual testing rather than via mocked unit tests — mocking the model defeats
the point.

---

## API contract (summary)

```
POST   /api/sessions               { githubUrl }      → Session
GET    /api/sessions/:id                              → Session
GET    /api/sessions/:id/messages                     → Message[]
POST   /api/sessions/:id/messages  { content }        → Message (assistant reply
                                                        with citations + audit)
GET    /api/health                                    → { status: "ok" }
```

Full schema: <http://localhost:4000/api/docs> (Swagger UI).

---

## Known limitations

- **Cold-start clone time.** First question on a new repo waits for `git
  clone --depth 1`. ~3-15s depending on repo size
- **No retry on Bedrock 429.** If you hit rate limits during a tool-use loop,
  the request fails. Production would add exponential backoff
- **Tool-call budget is fixed at 12 per turn.** Some questions could legitimately
  need more on a large repo; agent will return a "ran out of turns" message
- **`/tmp` cleanup not automated.** Cloned repos accumulate; rely on OS to
  clean
- **No streaming.** Users wait 15-45s on the first turn with no incremental
  output. They see "investigating…" with animated dots
