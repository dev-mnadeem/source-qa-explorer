# investigator-fe

The Next.js client for Codebase Investigator. See the [root README](../README.md) for the project as a whole.

Two routes: `/` takes a repository URL and creates a session; `/sessions/[id]` is the conversation. Questions are posted to the API, which answers 202 with a job; the page then follows `/jobs/:id/events` with `EventSource` and shows each tool call as it happens. When the job finishes, the message list is refetched and the answer appears with its audit badge, citations (linked to GitHub at the cited lines, with an inline excerpt) and the tool calls behind it.

## Working on it

Node 22 and the API running on port 4000.

```bash
npm ci
cp .env.example .env.local
npm run dev                # http://localhost:3000
```

`NEXT_PUBLIC_API_BASE_URL` is read in the browser and baked in at build time, so changing it needs a rebuild. The API's `CORS_ORIGIN` must include the origin the client is served from.

| Command | What it does |
|---|---|
| `npm test` | Vitest tests for the API client, citation links and trace formatting |
| `npm run lint` | ESLint with the Next.js rules |
| `npm run build` | Production build (`output: "standalone"`, used by the Dockerfile) |

Server state goes through TanStack Query hooks in `src/hooks/`, all API paths live in `src/shared/routes.ts`, and the colours are CSS variables in `src/app/globals.css`, with the three verdict colours kept for verdicts only.
