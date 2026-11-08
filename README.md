# FounderReady

A persistent technical readiness advisor for nontechnical founders taking an AI-built demo to real users. Describe your product, answer up to five adaptive questions, approve an editable project profile, and work through 3–5 prioritized checkpoints. Conversations share project context and propose changes for your approval.

## Get started

### Run locally

Requires Node **24.21+ / 24.x**, **pnpm 11.21.0**, and Docker Compose.

```sh
pnpm install
cp .env.example .env
# Set OPENAI_API_KEY in the root .env before continuing.
pnpm docker:up
pnpm db:migrate
pnpm dev
```

Open **http://localhost:3000**. PostgreSQL runs on **54329** with a persistent named volume. Keep configuration in the root `.env`; restart the app after editing it. The normal application always calls the real OpenAI Responses API. There is no production mock mode. `OPENAI_MODEL` defaults to `gpt-4.1-mini` and must support structured outputs. Missing credentials produce a recoverable error without losing saved work.

Stop the app with Ctrl+C; `pnpm docker:down` stops PostgreSQL and retains its volume. See [setup and operations](docs/setup.md) for HTTPS, environment variables, testing, and troubleshooting.

### Deploy on Vercel

1. Import the repository into Vercel with the **Next.js** preset and **Root Directory** set to `apps/web`.
2. Connect a hosted PostgreSQL database, such as Neon. In Vercel's **Production** environment, configure `DATABASE_URL` (pooled), `DATABASE_URL_UNPOOLED` (direct), `OPENAI_API_KEY`, `OPENAI_MODEL`, `APP_URL` (your exact public HTTPS origin), and `COOKIE_SECURE=true`. Neon's Vercel integration supplies both database URLs.
3. Under **Settings → Build and Deployment**, override **Build Command** with this single line:

```sh
if [ "$VERCEL_ENV" = "production" ]; then DATABASE_URL="$DATABASE_URL_UNPOOLED" pnpm db:migrate && pnpm build; else pnpm build; fi
```

Save and trigger a new production deployment. Production builds apply pending migrations through the direct connection before building; the running app uses the pooled URL. Preview builds skip migrations. See [Vercel setup](docs/setup.md#deploy-on-vercel-neon) for environment values, migration logs, and preview database setup.

## Full demo

1. Enter: **“I built an AI customer-support chatbot using Lovable, Supabase, and OpenAI and want to invite my first 50 beta users.”**
2. Start the questions. Answer honestly, use **I don’t know**, or **Skip**. Questions adapt to the context, so wording and order vary. The server enforces the five-question maximum.
3. Review the proposed profile. Edit facts and preserve their **founder-reported**, **AI-inferred**, or **unknown** provenance. Approve to generate 3–5 checkpoints.
4. On the checklist, open a next action. Generate and copy its engineering prompt. Open **Readiness map** to expand the four domains, select risks, and inspect dependency links.
5. Paste redacted evidence and its source. **Review this evidence** produces a finding for every acceptance criterion. Try “Codex says done” to see what remains unproven. Review never automatically confirms completion; the founder must explicitly confirm or request more work.
6. Create a **New conversation** and send **“I just added Stripe subscriptions.”** Review the proposed fact, checkpoint, and reopening changes. Before approval, shared project records stay as they were. Approve individual changes; the checklist and map update from the same records.
7. Set a checkpoint review date, defer or accept a risk with a reason, and refresh. The project, evidence, threads, proposals, decisions, and history persist.

No seed command is required or provided. The normal database starts empty. Automated tests use explicitly labeled demo fixtures in `apps/web/tests/fixtures.ts`; they are never loaded by the normal product.

## Implemented

- Minimal landing page, one-question interview with animated waiting states, profile approval, checklist dashboard, hierarchical readiness map, checkpoint detail, and persistent conversation threads.
- Four stable domains: Security & Privacy, Reliability & Operations, AI-Specific Risks, Cost & Scalability. `contains` links derive from stored parent relationships; `depends_on` and `related_to` links are persisted. Unassessed domains remain unknown.
- P0/P1/P2 priorities with reasons; top three active actions; unresolved P0 count; founder-confirmed verification counts; due reviews. No safety or launch-readiness score.
- Separate work status, criterion-level evidence assessments, and founder disposition. Planning, deferral, risk acceptance, and not-applicable decisions require reasons. Accepted/deferred risks never count as verified.
- Copyable engineering tasks; original evidence with source/time; immutable reviews and events; manual confirmation; reopening without deleting past evidence or decisions.
- Free-form chats that answer questions using shared facts and current risks. Reported changes receive targeted impact reviews. Every proposed operation has a before/after view, individual approval/rejection/deferral, and an audit record. Stale proposals cannot overwrite newer work.
- Seven modular OpenAI workflows: next interview question, project profile, risk assessment, conversation response, engineering prompt, evidence review, and change impact. Server validation covers structured schemas, referenced resources, criterion coverage, and ownership.

## Stack and storage

Next.js 16.4.5 App Router, React, TypeScript, Tailwind 4, local shadcn/ui primitives, TypeORM, PostgreSQL 17, official OpenAI SDK, Zod, pnpm/Turborepo.

```text
apps/web/src/app/           Pages and API route handlers
apps/web/src/components/    Interactive product views
apps/web/src/lib/           Contracts, graph projection, priority/progress helpers
apps/web/src/server/ai/     Seven AI workflows and prompt templates
apps/web/src/server/db/     Entity schemas and versioned SQL migrations
apps/web/src/server/projects.ts       Onboarding, profile, evidence and progress
apps/web/src/server/conversations.ts  Threads, proposed operations and approval
apps/web/src/server/state.ts          Transactional checkpoint/risk updates and audit
apps/web/tests/             Unit, PostgreSQL integration and browser tests
```

Tables: `guests` (guest sessions), `projects`, `project_facts`, `conversations`, `messages`, `interview_responses`, `risks`, `risk_relations`, `checkpoints`, `evidence` (checkpoint evidence), `evidence_reviews`, `change_proposals`, `review_triggers`, `checkpoint_events`. Existing table names are retained to preserve the original repository’s data. Schema synchronization is disabled. Migrations preserve prior projects, evidence, completion dates, and conversation history; imported checkpoints have an explicit migration event and uncertain domain classification pending review.

## Verification

```sh
pnpm lint
pnpm typecheck
pnpm test
pnpm build

# Once: create a disposable test database, then set TEST_DATABASE_URL in .env.
docker compose exec -T postgres psql -U founderready -d postgres -c 'CREATE DATABASE founderready_test;'
pnpm test:integration
pnpm --filter @founderready/web exec playwright install chromium
pnpm test:e2e
```

Integration tests refuse databases without an `_test` suffix and truncate the test database. Do not run integration and browser suites simultaneously against the same database. Tests stub model output; the browser suite uses a test-only HTTP provider to exercise the actual SDK and application stack. Coverage includes ownership, five-question limits and unknown answers, persistence across connections, malformed structured output, status/priority separation, evidence without automatic confirmation, risk acceptance, approval/rejection/deferral, deduplication, stale proposals, reopening with history, and map/checklist consistency.

## Assumptions and limits

- One anonymous guest cookie owns many independent projects. It is random, HTTP-only, SameSite=Lax, valid for 180 days, and stored only as a SHA-256 hash. Clearing cookies, changing browsers, or expiry removes access; account recovery, collaboration, and login are outside this MVP.
- A checkpoint owns one focused risk in this MVP. Stable project-scoped keys and unique constraints prevent duplicate creation; explicit updates retain IDs and reopen work. Exact-title duplicates are also rejected. Semantic deduplication still depends on the advisor reusing existing keys.
- Profile approval retains unknowns and inferred provenance. Editing a fact does not automatically label it confirmed; change its provenance explicitly. Direct profile edits are founder actions; use a conversation for a targeted impact review after a material change.
- The interview uses product-specific topic anchors to keep unknown answers from consuming all five questions. For AI products these cover user data, AI permissions, and API costs. The model adapts wording to the context and may finish early; this is not a checklist across every risk domain.
- The model assigns priority using impact, exposure, stage, urgency, and dependencies. The dashboard orders by priority, then dependency blockers, then title for a stable tie-break. P0 means critical before beta unless explicitly accepted; a deferred P0 remains unresolved.
- Founder-confirmed means the founder reviewed the criteria and evidence and explicitly confirmed. It is not independent verification, and gaps remain visible. Evidence must have an advisor review against current criteria; reopened work needs a fresh review before another confirmation. A new evidence submission clears the previous completion status while retaining its history.
- Evidence is text only. URLs are stored as references; FounderReady does not fetch them, inspect repositories, run tests, or implement changes. It flags relevant legal questions without providing legal advice. PMF, marketing, business models, and fundraising are out of scope.
- Reported material changes are detected from conversation context, not external monitoring. Event triggers are reviewed when changes are reported; date triggers appear in-app. No email/push scheduler is included.
- Relevant context and evidence go to OpenAI with `store: false`. That disables Responses storage but does not override the provider’s other retention policies. The app persists its own records in PostgreSQL. Do not submit secrets or customer records.
- Each guest has 30 model calls/hour, 20 projects, 60 threads/project, 100 messages/thread, 60 checkpoints/project, 60 pending proposals/project, and 30 evidence notes/checkpoint. Calls have a 45-second timeout. Project leases serialize mutations; interrupted leases expire in three minutes. Public deployment still needs ingress abuse protection and provider spending limits because a user can start another guest session.
- Original evidence, evidence reviews, and events are protected against SQL update/delete. No retention/deletion interface is included; an operator must design an explicit archival/deletion process. Later migrations are forward-only; back up before upgrades.
