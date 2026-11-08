# FounderReady

A technical readiness advisor for nontechnical founders moving from a working demo to their first users. Describe a product, answer up to five adaptive questions, and get 3–5 prioritized checkpoints with actions, acceptance criteria, engineering prompts, ownership, and supporting evidence.

The app persists anonymous guest workspaces in PostgreSQL. Follow-up conversations identify changes that warrant another review and reopen affected completed checkpoints. Completion is a manual confirmation; the AI never claims to have audited code or independently verified evidence.

## Run locally

Prerequisites: Node **24.21.0** (see `.nvmrc`; also tested with 24.22.1), **pnpm 11.21.0**, and Docker with Compose.

```sh
pnpm install
cp .env.example .env
pnpm docker:up
pnpm db:migrate
```

Set `OPENAI_API_KEY` in the root `.env`, then:

```sh
pnpm dev
```

Open [localhost:3000](http://localhost:3000). The database listens on local port **54329**. The default model is `gpt-4.1-mini`; `OPENAI_MODEL` can select another model that supports the Responses API and structured outputs. Without an API key, project creation and persistence work, and AI requests show an actionable configuration error.

Keep all environment configuration in the repository root. The app, migrations, and test runners share the root environment loader. Restart the app after editing `.env`.

See [detailed setup and operations](docs/setup.md) for environment variables, production setup, testing, and troubleshooting.

## Start and stop

Run these commands from the repository root:

| Command | Action |
| --- | --- |
| `pnpm dev` | Start the Next.js development server on localhost:3000. Press Ctrl+C in that terminal to stop it. |
| `pnpm docker:up` | Start PostgreSQL in the background and wait until it is healthy. |
| `pnpm docker:down` | Stop the Compose services, retaining the database volume and data. |
| `pnpm docker:logs` | Follow PostgreSQL logs. Press Ctrl+C to stop following. |
| `pnpm docker:ps` | Show the database container's status. |
| `pnpm db:migrate` | Apply pending database migrations. |
| `pnpm build` | Create a production build. |
| `pnpm start` | Serve the production build. Press Ctrl+C to stop it. |

`pnpm db:up` and `pnpm db:down` also remain available as aliases for the Docker commands. Stop the app with Ctrl+C and run `pnpm docker:down` to shut down both services.

## Stack and layout

- Next.js 16.4.5 App Router, React, TypeScript, Tailwind CSS 4, and locally owned shadcn/ui components.
- Next.js Route Handlers for all backend endpoints; one application in a pnpm/Turborepo workspace.
- PostgreSQL 17, TypeORM EntitySchema, and an explicit versioned migration. Schema synchronization is disabled.
- Official OpenAI SDK, Responses API, Zod structured outputs, and organized prompt templates.

```text
apps/web/src/app/             Pages and API Route Handlers
apps/web/src/components/      Landing, interview, workspace, and UI primitives
apps/web/src/lib/             Shared schemas, types, and browser request helper
apps/web/src/server/ai/       Advisor adapter and prompt templates
apps/web/src/server/db/       Entities, connection lifecycle, and migrations
apps/web/src/server/projects.ts  Workflow and persistence rules
apps/web/src/server/http.ts      Session, origin, validation, and error handling
apps/web/tests/               Core, PostgreSQL API, and browser tests
```

## Verification

```sh
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

Database integration and browser tests need a separate disposable database; see [test setup](docs/setup.md#testing). They cover the full workflow, retry recovery, the five-question cap, session isolation, evidence and manual completion, follow-up reopening, clipboard behavior, and mobile navigation. Tests use deterministic AI fixtures. They do not establish live provider availability or the quality of a particular model’s advice.

## MVP decisions

- A cryptographically random, HTTP-only guest cookie lasts 180 days. Only its SHA-256 hash is stored. Each project and nested-resource operation checks session ownership. Clearing cookies, switching browsers, or session expiry removes access; there is no account recovery in this MVP.
- The application sends the relevant description, answers, checkpoints, and evidence to OpenAI with `store: false`. This disables Responses storage; it does not override the provider’s other data-retention policies. FounderReady persists its own conversation history in PostgreSQL.
- Answers are committed before AI generation. A failed generation can be retried without losing or resubmitting an answer. Short-lived database leases prevent concurrent assessments; transactions protect state changes.
- A checkpoint requires evidence and explicit manual confirmation to complete. Evidence distinguishes reported implementation from a review attributed to a named person. Neither is independent verification by FounderReady.
- Follow-up reviews preserve checkpoint history and evidence, reopen affected completed checkpoints, and retain new recommendations in the conversation. They do not silently replace the original plan.
- AI requests are limited to 30 per guest session per hour. Guest workspaces have limits of 20 projects, 30 follow-ups per project, and 30 evidence notes per checkpoint. These bound normal usage; a public deployment also needs an external abuse and spending limit because users can create new guest sessions.
- No code generation, file uploads, authentication, automatic verification, or security certification is included.
