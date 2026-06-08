# investigator-be

The NestJS API behind Codebase Investigator. The [root README](../README.md) covers what the project does and how to run the whole thing; this file is for working on the API itself.

## Layout

| Folder | Responsibility |
|---|---|
| `src/repos/` | Parses GitHub URLs, streams the repository tarball into `/tmp/codebase-investigator/repos/<sessionId>` (size-capped, files and directories only), evicts old checkouts hourly |
| `src/code/` | The file tools the agent calls (`read_file`, `list_dir`, `find_files`, `grep`) with path and symlink confinement, plus BM25 ranking for `search_code` |
| `src/llm/` | The `LlmProvider` interface, the Bedrock provider, the offline provider and per-call cost accounting |
| `src/agent/` | The tool-use loop, ending in a `submit_answer` tool call that carries structured citations |
| `src/audit/` | Citation checker (does each cited range exist and hold code?) and the second-pass reviewer; the verdict is the worse of the two |
| `src/jobs/` | Postgres-backed queue (`FOR UPDATE SKIP LOCKED`), the worker, and the SSE progress stream read from the job row |
| `src/chat/` | HTTP endpoints, and the service that runs one question end to end and saves the answer, citations and verdict in one transaction |
| `src/eval/` | A scored evaluation against `test/fixtures/sample-repo`, run as part of the unit tests |

## Endpoints

All under `/api`; Swagger UI is at `/api/docs`.

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/health` | Database round-trip and the active LLM provider |
| `POST` | `/sessions` | Download a public GitHub repository and open a session |
| `GET` | `/sessions/:id` | Session metadata |
| `GET` | `/sessions/:id/messages` | The conversation, with citations and verdicts |
| `POST` | `/sessions/:id/messages` | Queue a question (202 with a job) |
| `GET` | `/jobs/:id` | Job status and recorded events |
| `GET` | `/jobs/:id/events` | Server-sent progress events; closes after `done` or `error` |

## Working on it

Node 22 (see `.nvmrc` at the repository root) and a Postgres database. `docker compose up db` from the root starts one on port 5433, which matches `.env.example`.

```bash
npm ci
cp .env.example .env
npx prisma migrate deploy
npm run start:dev          # http://localhost:4000/api
```

| Command | What it does |
|---|---|
| `npm test` | Unit tests and the evaluation; no network or database |
| `npm run test:e2e` | HTTP tests against the database in `DATABASE_URL` with the offline provider |
| `npx eslint "{src,test}/**/*.ts"` | Lint without rewriting (`npm run lint` applies fixes) |
| `npm run build` | Compile to `dist/` |

`LLM_PROVIDER` forces `fake` or `bedrock`; otherwise Bedrock is used only when all three AWS variables are set. `AWS_BEDROCK_INVESTIGATOR_MODEL_ID` and `AWS_BEDROCK_AUDITOR_MODEL_ID` override the model per role.
