# Codebase Investigator — Frontend

Next.js chat UI for **Codebase Investigator**. Paste a public GitHub URL, ask questions, see grounded answers with **clickable citations** that link to GitHub at the exact line range, plus an **audit badge** on every assistant message showing whether the answer is `trusted | partial | suspect` and why.

Backend repo: [`investigator-be`](../investigator-be) (in this same monorepo).

## Tech stack

| Layer | Tech |
|---|---|
| Framework | Next.js 16 (App Router, React 19) |
| Language | TypeScript (strict) |
| Styling | Tailwind CSS v4 |
| Server state | TanStack Query v5 |
| Markdown | `react-markdown` + `remark-gfm` (assistant messages render as proper markdown) |
| Toasts | `sonner` |
| Hosting | Vercel |

The backend is a NestJS API hosted on Railway. There's no auth on either side — sessions are gated by their opaque UUID, not by user login.

## Architecture

- **App Router** under `src/app/` — `/` is the paste-URL landing, `/sessions/[id]` is the chat.
- **Server components by default** — only files using state, effects, or event handlers carry `"use client"`.
- **`type Props`** for every component (no `interface`). All function components.
- **Per-feature folders** for `types/`, `hooks/`, mirroring backend DTOs (`types/sessions/`, `types/chat/`).
- **`apiClientFetch`** (`src/lib/api/client.ts`) is the single fetch wrapper — adds JSON content-type, normalizes errors. Used inside every TanStack Query hook.
- **`shared/routes.ts`** centralises every backend URL + every frontend route. No string URLs scattered through the code.
- **`shared/constants.ts`** holds query-key enums.
- **Optimistic message append** — when you send a question, your message appears instantly; the persisted version replaces it (and the assistant reply lands) on success. Rollback on error.

### What you see in the chat

| Element | What it is |
|---|---|
| **Audit badge** | Green/amber/red pill on every assistant message. Click to expand: programmatic check result + LLM auditor reasons. |
| **Citations** | Clickable mono-spaced badges (`src/auth.ts:23-58`) that open the file on GitHub at the exact line range. Click "preview" to inline the actual excerpt. Unverified citations are amber-styled and labeled. |
| **Tool-call trace** | Collapsible `Tool calls (N)` showing every tool the agent ran for that turn — `read_file(...)`, `grep(...)`, etc. Builds trust: the user sees what actually happened. |

## Local development

Requirements: Node 22+, npm, the backend running locally on `:4000`.

```bash
git clone https://github.com/awais-aman/codebase-investigator.git
cd codebase-investigator/investigator-fe
npm install

cp .env.example .env.local
# Set NEXT_PUBLIC_API_BASE_URL to your local backend (default works)

npm run dev
```

Visit `http://localhost:3000`.

### Required env vars

```
NEXT_PUBLIC_API_BASE_URL=http://localhost:4000/api    # production: https://<railway-url>/api
```

The `NEXT_PUBLIC_*` prefix is required because this is read in client components.

## Deployment (Vercel)

This app is live at **<https://codebase-investigator-eight.vercel.app>** (backed by <https://codebase-investigator-production.up.railway.app/api>).

To deploy a fresh copy:

1. New project → Import GitHub repo `codebase-investigator`
2. **Configure project**:
   - **Framework Preset**: Next.js (auto-detected)
   - **Root Directory**: `investigator-fe` *(click "Edit" — this is the critical step, monorepo)*
3. **Environment Variables** (production):
   - `NEXT_PUBLIC_API_BASE_URL` = `https://codebase-investigator-production.up.railway.app/api`  *(must include `/api` suffix)*
4. Click **Deploy**, wait ~2 min
5. Note the production URL; add it to the BE's `CORS_ORIGIN` env var on Railway

If you change env vars later, redeploy — Next.js bakes `NEXT_PUBLIC_*` values at build time.

## Routes

| Route | Type | What it does |
|---|---|---|
| `/` | Server | Landing — paste-URL form. Creates a session, redirects to `/sessions/:id`. |
| `/sessions/[id]` | Server shell + client `Chat` | Chat UI. Loads session + messages, lets the user send new questions. |

## Pages, hooks, components

```
src/
├── app/
│   ├── page.tsx                       Landing (server)
│   └── sessions/[id]/
│       ├── page.tsx                   Server shell (awaits params)
│       └── Chat.tsx                   Client chat container
├── components/
│   ├── PasteUrlForm.tsx               Landing form, calls useCreateSession
│   └── chat/
│       ├── MessageList.tsx            Scrolls, shows typing indicator while pending
│       ├── MessageBubble.tsx          User vs assistant bubble; renders markdown for assistant
│       ├── Markdown.tsx               react-markdown + GFM with Tailwind styling
│       ├── CitationLink.tsx           Clickable file:line link to GitHub + excerpt preview
│       ├── AuditBadge.tsx             Verdict pill + expandable reasons panel
│       ├── ToolCallTrace.tsx          Collapsible "Tool calls (N)" trace
│       └── Composer.tsx               Textarea + submit (⌘/Ctrl + Enter to send)
├── hooks/
│   ├── sessions/
│   │   ├── useCreateSession.ts        Mutation: POST /sessions
│   │   └── useSession.ts              Query: GET /sessions/:id
│   └── chat/
│       ├── useMessages.ts             Query: GET /sessions/:id/messages
│       └── useSendMessage.ts          Mutation: POST /sessions/:id/messages, optimistic update
├── lib/
│   ├── api/client.ts                  apiClientFetch wrapper
│   ├── query/provider.tsx             TanStack Query setup
│   └── utils.ts                       cn() helper
├── shared/
│   ├── constants.ts                   QueryKeys
│   └── routes.ts                      APIS + ROUTES (single source of truth)
└── types/
    ├── sessions/                      Session, CreateSessionInput
    └── chat/                          Message, Citation, AuditVerdict, ToolCallRecord, AuditStatus
```

## Scripts

```bash
npm run dev         # Next dev server
npm run build       # production build
npm run start       # serve the production build
npm run lint
```

## Decisions worth knowing

- **No auth** — public app, sessions gated by opaque UUID. Anyone with the URL can resume the session.
- **Server components by default** — keeps client bundle small; only the chat itself ships JS.
- **No streaming** — answer + audit return atomically. The waiting state is a typing indicator with animated dots; turns take 15-45s on the first question.
- **GitHub line links use `HEAD`** (not a pinned commit) — citations are valid against the repo's current default branch. If the user investigates an old commit version of the repo, the line link drift is acceptable for the assessment scope.
- **Optimistic user message** — feels instant, even though the round-trip is slow.
