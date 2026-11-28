# Epic: built-in AI agent (company-paid Claude)

Status: Phase 1 implemented (steps 1–4) · Builds on PR 199 (`patolord/takeoff-agente-ia-v0`, the agent over local MCP)

### Implementation notes (Phase 1)

- **Shared (`@rlpapp/shared`)**: `takeoff.agente` permission (`packages/shared/src/auth/permissions.ts`)
  and model/effort/pricing catalog + micro-USD integer cost math + BRT month keys
  (`packages/shared/src/takeoff/agentModels.ts`).
- **Backend (`@rlpapp/backend`)**:
  - `takeoffSettings` (`kind: "agent"`), `takeoffAgentRuns` (with `inFlightCalls`, `promptVersion`,
    and `reviewStats`), and `takeoffAgentCalls` (with `toolsCalled`, `imageCount`, `requestBytes`,
    `durationMs`, `stopReason`).
  - Streaming proxy `POST /takeoff/agent/messages` (`gateway/takeoffAgentProxy.ts`, `model/procurement/takeoffAgentPolicy.ts`)
    verifying desktop JWT via `ctx.auth`, enforcing `takeoff.agente`, kill switch, company/user
    monthly USD budgets (with US$ 0.25 in-flight reservation buffer and max 2 concurrent turns/run),
    10 MB request cap, forced model/effort & `max_tokens`, and committing SSE usage before closing
    or cancelling the stream.
- **Desktop (`apps/takeoff`)**:
  - WebP encoding (quality 0.85, automatic PNG fallback) in `renderPageView` to cut image payload
    size 5–8× before hitting the Convex 64 MiB HTTP isolate.
  - AI SDK v7 (`ai@7`, `@ai-sdk/anthropic@4`) loop in `src/lib/agent/llm/` (`tools.ts`,
    `images.ts`, `transcript.ts`, `run.ts`) with batch rolling image window (keep 6, trim when >10
    to preserve Anthropic prompt cache), per-takeoff local transcripts, and `AgentPanel.tsx`.
  - Human review outcomes (`aiStats`) synced back to `takeoffAgent.reportReviewStats` on run finish
    and whenever suggestions are accepted/rejected.
- **Dashboard (`apps/web`)**: `App Takeoff → IA` (`/takeoff/ia`) with live policy/budget/prompt
  controls (kill switch, model, effort, company & user USD budgets, turn/token caps, prompt version
  and extra company instructions) plus monthly usage, per-user breakdown, recent runs, and
  human acceptance rate.
- **Remaining (Step 5)**: configure `ANTHROPIC_API_KEY` in Convex env (from Doppler) + Anthropic
  console hard spend limit, run live eval on sample sheets to compare Opus 5.5 vs Sonnet 5.5, and
  release minor desktop version.

Today the takeoff agent is driven by the user's own AI client: Claude Code or Claude Desktop
connects to the app's local MCP server, and the user's own subscription pays. This epic puts the
agent inside the app: a chat panel in RLP Takeoff, Claude paid by the company's Anthropic API
credits, usage and budgets per user in the dashboard. The tools, the instructions, the memory and
the review of suggestions from PR 199 stay as they are; only who drives them changes. The MCP
server stays as a second door (power users, the eval, agents testing the app).

Research behind the decisions (November 2026): Vercel AI SDK 7, Vercel AI Gateway, Vercel
Workflow 5 (`@ai-sdk/workflow`), Convex limits and components (`@convex-dev/agent`,
`@convex-dev/workflow`), Vercel Hobby limits. Numbers below come from their docs and are
repeated here only where they drive a decision; check them again before relying on them.

---

## Decision in one paragraph

**The agent loop runs in the desktop app, on the AI SDK; the model calls go through a thin
streaming proxy in Convex, which holds the Anthropic key, checks permission and budget and
writes the usage ledger.** No AI Gateway, no Vercel Workflow and no Convex Agent/Workflow
components in this epic. The tools must run where the open PDF and the takeoff state are (the
desktop), so durability on a server protects the side that rarely fails and not the one that
does: if the app closes, a durable run on the server just waits for a tool result nobody can
produce. Convex is where the user, the permissions, the takeoff settings and the dashboard
already live, and the desktop is already signed in to it.

## Who does what

| Concern | Desktop loop (chosen) | Convex | Vercel (AI SDK / Gateway / Workflow) |
| --- | --- | --- | --- |
| Run the ~19 tools (PDF, state) | **Yes**, they live here | No | No |
| Agent loop (steps, stop, abort) | **AI SDK `ToolLoopAgent`/`streamText`** in the webview | Possible: Agent component with "client tools" (undocumented, no image results) | Possible: `WorkflowAgent` + a hook per tool call |
| Hold the API key | Never | **Proxy HTTP action** (env var) | Gateway key on a Vercel function |
| Auth of the desktop | Has the server JWT already | **Verifies it today** (`gateway/callerAuth.ts`) | Would need to verify our JWT in `apps/web` |
| Permission (`takeoff.agente`) | `can()` hides the panel | **RBAC wrappers** enforce it | — |
| Usage ledger, budgets, kill switch | Shows the meter | **Tables + checks in the proxy** | Gateway budgets do not cap BYOK spend |
| Streaming the reply | Reads SSE with `fetch` | HTTP action streams the body | Function streams (300 s cap on Hobby) |
| Durability across restarts | Transcript saved locally per takeoff | Not needed for v1 | Not needed for v1 |
| Observability | DevTools in dev | Ledger rows, dashboard page | Gateway logs / Workflow dashboard |

### Why not each alternative

- **Vercel AI Gateway.** Paying with our Anthropic credits means BYOK, and BYOK on the Gateway
  still requires bought Gateway credits with a positive balance (402 otherwise); Gateway
  budgets do not count BYOK tokens, so they cannot cap the Anthropic bill; spend reporting is
  Pro-only; Vercel's Hobby plan terms are for non-commercial use. What the Gateway would add
  (provider failover to Bedrock/Vertex, one bill for many providers, Jev decisions) is not
  needed yet. The AI SDK makes the switch a one-line provider change later, so this is
  reversible.
- **A proxy on Vercel (`apps/web`).** Hobby caps a function at 300 s and its request body at
  4.5 MB. A tool loop resends the whole history each turn, page images included, so a body
  passes 4.5 MB well before a long session ends. Convex has no such small request cap and its
  actions run up to 10–30 min (verify for HTTP actions in step 0).
- **Vercel Workflow (`WorkflowAgent`).** It supports the desktop-executes-tool pattern (a hook
  per tool call, resumed by an authenticated route), but: every model step stores the whole
  conversation as step input, so with images "Workflow Data Written" grows with the square of
  the session length and one session can pass Hobby's 1 GB a month; ~0.5–1 s more per tool call;
  50K events a month on Hobby is about 40 sessions; payloads kept 1 day; Nitro beta in
  `apps/web`. Its strengths are real for a different product (below).
- **Convex Agent component (loop on the server, "client tools").** Threads, streaming deltas
  over the websocket and a usage handler are attractive, but: it needs Convex ≥ 1.46 (we pin
  1.42.1); client tools exist only in the source (`addToolOutput`), not in the docs; a client
  tool's output can be text or JSON only, not an image; images inside a message count against
  the 1 MiB document limit; each streamed delta is a mutation against the function-call quota.
  Revisit only if sessions must outlive the app or be watched live from the web.

### Where Vercel Workflow (or the Convex workflow) does fit, later

- A headless "run the takeoff on the server" mode, once the PDF tools run in Node (pdf.js and
  the detectors are already plain TS): then nothing depends on the desktop and durability,
  retries and per-step observability pay off.
- Batches of evals over the sample set: one child run per case, totals at the end.
- Jev decisions inside the tools (catalog equivalence, equipment vs accessory) go through the
  Gateway's decisions API: that is the natural moment to open a Gateway account with credits.

---

## Architecture

```
RLP Takeoff (webview)                          Convex (packages/backend)            Anthropic
┌───────────────────────────────┐   HTTPS/SSE  ┌────────────────────────────┐  SSE  ┌──────────┐
│ AgentPanel (chat, stop, cost) │──────────────▶ POST /takeoff/agent/messages │──────▶ /v1/messages│
│ lib/agent/llm/run.ts          │  JWT bearer  │  verify JWT, takeoff.agente │◀──────│          │
│  ToolLoopAgent + AGENT_TOOLS  │◀─────────────│  budget check, body policy  │       └──────────┘
│  tools run on AgentContext    │  streamed    │  tee stream → usage ledger  │
└───────────────────────────────┘              └────────────────────────────┘
          │ same tools                                   │ reactive
          ▼                                              ▼
   MCP server (PR 199, kept)                  Dashboard: App Takeoff → IA (usage, budgets)
```

- The proxy is **Anthropic Messages-shaped**: the desktop's provider points its `baseURL` at it,
  so either `@ai-sdk/anthropic` or the official `@anthropic-ai/sdk` works unchanged against it.
- The proxy decides, not the client: the model and effort come from the company settings, the
  `max_tokens` is capped, unknown top-level fields are dropped. The client cannot pick a pricier
  model or turn a budget off.
- Webview `fetch` straight to `<deployment>.convex.site` with CORS allowed for the Tauri origins
  (`tauri://localhost`, `http://tauri.localhost`) and `http://localhost:1420` in dev. The Rust
  `http_request` command buffers the whole body and times out at 20 s, so it cannot carry a
  stream; it stays for the other calls.

---

## Steps

Each step is its own PR (on top of PR 199 once it merges) and leaves the app releasable. The
built-in agent stays behind the new permission until step 5.

| # | Step | Size |
| - | ---- | ---- |
| 0 | Spikes: Convex streaming proxy, AI SDK in the webview, cost of one takeoff | S |
| 1 | Backend: permission, settings, ledger, proxy route | M |
| 2 | Desktop: the loop over the existing tools | M |
| 3 | Desktop: chat panel and the agent dialog | M |
| 4 | Dashboard: IA settings and usage | S–M |
| 5 | Eval with the built-in agent, model and effort choice, release | S–M |

### 0. Spikes (throwaway code, findings written back into this document)

Answer before building:

1. **Convex HTTP action as a streaming proxy.** A 3-minute SSE response from Anthropic piped
   through `httpAction` to the Tauri webview: does it stream chunk by chunk, what is the
   execution limit of an HTTP action, what is the largest request body it accepts (try 8 and
   16 MB), and does outbound traffic to Anthropic count as Convex egress (1 GB a month on the
   free plan, ~0.13 $/GB after). If any answer is bad, the fallback is a Node action invoked
   from the client with the reply streamed through a Convex table, or a small dedicated
   function host.
2. **AI SDK in the webview.** `ai` 7 (latest) + `@ai-sdk/anthropic` with `baseURL` at the spike
   proxy: a tool returning an image through `toModelOutput` (`{ type: "content", value: [text,
   { type: "file", mediaType: "image/png", data: { type: "data", data: base64 } }] }`) reaches
   Claude; prompt caching with `providerOptions.anthropic.cacheControl` shows cache reads; send
   base64 strings, never `Uint8Array` (some provider code calls `Buffer`, absent in a browser).
3. **What one takeoff costs.** Run the built-in loop on one sample drawing set (Lorena) and log
   per turn: input, cache-read, cache-write and output tokens, request bytes, number of images
   kept. Gives the real cost per takeoff, the bytes per session (for item 1) and the image
   policy below.
4. **AI SDK or Anthropic SDK.** The AI SDK wins on the loop (`ToolLoopAgent`, `prepareStep`,
   stop conditions, a provider swap to the Gateway later). The Anthropic SDK wins if we need
   API features the AI SDK does not expose: message threads (the API keeps the conversation
   and each request sends only the new messages, which would shrink request bytes), the Files
   API for images, task budgets, context editing. Default to the AI SDK unless the byte count
   from item 3 forces threads or files.

### 1. Backend (`packages/backend`, `packages/shared`)

- **Permission** `takeoff.agente` ("Usar a IA integrada do App Takeoff") in
  `packages/shared/src/auth/permissions.ts`, with group, label, description and prerequisite
  `takeoff.use`; granted to the `takeoff` access; a named wrapper in `convex/lib/rbac.ts`.
- **Settings** in the existing takeoff settings (edited by `takeoff.config`): model (default
  `claude-opus-5-5`), effort (default `high`), on/off switch, monthly budget for the company
  and per user (BRL or USD, decide in review), max turns per run.
- **Ledger** (`schema/takeoff`): `takeoffAgentRuns` (user, installation, takeoff external id,
  model, started/ended, status, totals) and `takeoffAgentCalls` (run, tokens by kind, cost at
  the model's price, duration, stop reason). Prices kept in `packages/shared` next to the model
  list so the dashboard and the proxy agree.
- **Proxy route** `POST /takeoff/agent/messages` in `convex/gateway/` (registered in
  `http.ts`, CORS + `OPTIONS`):
  1. bearer JWT via `readBearer` / the existing API-token verification; 401/403 in Portuguese;
  2. `takeoff.agente`, switch on, budget left (company and user, month to date), turn cap;
  3. body policy: force model/effort from settings, cap `max_tokens`, drop unknown fields,
     reject a body over the size limit found in step 0;
  4. forward to `https://api.anthropic.com/v1/messages` with `ANTHROPIC_API_KEY` (Convex env,
     copied from Doppler; added to `convex.config.ts` `env`), stream the reply back unchanged;
  5. tee the stream: read `message_start` / `message_delta` usage and write one
     `takeoffAgentCalls` row when it ends (also on abort and on error);
  6. refusals and overloads pass through as they are; the client shows them.
- A hard monthly spend limit is also set in the Anthropic console, so a bug in the ledger can
  never run up the bill.
- Tests in `packages/backend/tests`: auth, permission, budget exhausted, body policy, ledger row
  from a recorded SSE fixture (no live calls in CI).

### 2. Desktop loop (`apps/takeoff/src/lib/agent/llm/`)

- `tools.ts`: `AgentTool` → AI SDK `tool({ description, inputSchema: jsonSchema(t.inputSchema),
  execute: (args) => t.run(args, ctx), toModelOutput })`, where `toModelOutput` turns
  `ToolContent` images into file parts and keeps `isError` results as errors the model reads.
  One registry (`AGENT_TOOLS`) feeds both the MCP server and the built-in loop; a tool added
  later appears in both.
- `run.ts`: one run per user message: system prompt = `AGENT_INSTRUCTIONS` (unchanged, cached),
  history, `stopWhen` from the settings' turn cap, `AbortController` for the stop button,
  provider `createAnthropic({ baseURL: <convex site>/takeoff/agent, authToken: () => session
  JWT })`.
- **Image policy** (from step 0): keep only the last N `view_page` images in the history and
  replace older ones with a short text stub ("imagem da página 2, região x… removida do
  contexto; peça de novo se precisar"). Trim in batches (when N + k accumulate) so most turns
  keep the prompt cache. This bounds request bytes, cost and context at once.
- **Transcript** per takeoff in the app data folder (text and tool calls; images as stubs), so a
  reload or a crash can resume the conversation; a takeoff file never embeds it.
- The background rendering of `lib/agent/background.ts` already keeps tools working while the
  window is hidden; nothing to add.
- Tests: tool adapter (schemas, image output, errors), image trimming, a fake model that scripts
  tool calls against `testContext.ts`.

### 3. Chat panel and dialog (`apps/takeoff/src/components/`)

- `AgentPanel.tsx`: side panel with the conversation in Portuguese, streamed text, one compact
  line per tool call ("Lendo a página 2…", "3 locais sugeridos"), stop button, cost of this run
  and month-to-date budget, and the existing review bar for the suggestions it makes.
- Opens from the tool rail; shown only signed in with `takeoff.agente`. Offline or signed out:
  says why and points to **Entrar**.
- `AgentDialog.tsx` keeps the memory tab and moves the MCP connection under an "Avançado:
  conectar outro cliente de IA" section; the status bar shows "IA trabalhando" during a run.

### 4. Dashboard (`apps/web`, App Takeoff area)

- Page "IA": the settings of step 1 (model, effort, switch, budgets) and a reactive usage table
  per user and per month, with each run's takeoff, turns, tokens and cost.
- No transcripts on the server in this epic (drawings are confidential; see open questions).

### 5. Eval, choice of model and effort, release

- The eval runner (`scripts/eval.ts` and `src/lib/eval/`) drives the built-in loop in browser dev
  mode over the sample set and records accuracy **and cost per takeoff**.
- Compare Opus 5.5 at `high` with Opus 5.5 at `medium` and with Sonnet 5.5 at `medium`; the
  model and effort in the settings follow the numbers, decided by the user.
- Release as a minor version; the README "Agente de IA" section rewritten around the built-in
  agent, MCP described as the advanced option.

---

## Costs and limits to watch

- **Tokens.** Prompt caching makes re-reading the history cheap (cache reads at a small
  fraction of the input price); images and output are the real cost. Estimate before step 0:
  single-digit to low-double-digit USD per drawing set on Opus 5.5, about half on Sonnet 5.5.
  Step 0 replaces this with a measurement.
- **Bytes.** Each turn resends the whole history: with the image policy, a request should stay
  around a few MB. Bytes matter for the proxy's limits and possibly for Convex egress, not for
  the Anthropic bill.
- **Convex quotas** (free/starter): 1M function calls, 1 GB egress, 20 GB-hours of action
  compute a month. A proxied turn is one HTTP action plus one mutation; 200 turns per session is
  cheap in calls, the open question is egress (step 0).
- **Anthropic.** Rate limits of the company's tier (a heavy session sends many large requests in
  a row); a console spend limit as the last line of defence.

## Open questions for review

1. Budget unit and defaults (per user per month, company per month), and who may raise them.
2. Should transcripts (without images) go to the server for support and audit? Useful, but
   they quote client drawings; default here is no.
3. Client confidentiality: drawings go to Anthropic under the company account (30-day
   retention by default for current models). Tell clients? Add it to the terms of the quote?
4. Vercel Hobby is for non-commercial use; this epic does not depend on Vercel, but `apps/web`
   already runs a commercial product there. Worth deciding separately.
5. When a Gateway account with credits makes sense (Jev, failover), switch the provider in
   step 2's `run.ts` and keep the Convex ledger as the source of truth for usage.
