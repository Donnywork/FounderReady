# Setup and operations

## Environment

Copy `.env.example` to `.env` in the repository root. The app, migration script, and test runners share a loader that reads environment files from this root directory. Keep all keys here; no environment file is needed in `apps/web`. The file is ignored by Git. Keep the API key on the server; no secret uses a `NEXT_PUBLIC_` variable. Restart the app after changing root environment files.

Explicit shell variables take precedence. Root `.env.local` and mode-specific root files also follow Next.js environment precedence; test mode skips `.env.local`. The shared `.env` is loaded in every mode, and Turborepo includes root environment files in its cache inputs.

| Variable | Purpose |
| --- | --- |
| `DATABASE_URL` | PostgreSQL connection URL. The example connects to the Compose service on localhost:54329. |
| `OPENAI_API_KEY` | A server-side OpenAI API key with model access and available billing quota. |
| `OPENAI_MODEL` | Responses-compatible model with structured outputs; defaults to `gpt-4.1-mini`. |
| `OPENAI_REASONING_EFFORT` | Optional effort for all advisor calls. Set `none` to disable reasoning on compatible models such as `gpt-6-luna`. Leave unset for non-reasoning models such as `gpt-4.1-mini`. Other supported values depend on the chosen model. |
| `APP_URL` | Exact public origin, including protocol and port. Used to reject cross-origin mutations. |
| `COOKIE_SECURE` | Set `false` only for local HTTP. Use `true` with production HTTPS. Defaults to true in production if omitted. |
| `TEST_DATABASE_URL` | Optional disposable test database. Its name must end in `_test`. |

## First start

1. Install Node 24.21.0 using your preferred version manager; `.nvmrc` pins the requested version. Enable/install pnpm 11.21.0; the root `packageManager` field pins it. Validation during implementation also ran on Node 24.22.1.
2. Run `pnpm install` at the repository root. `pnpm-workspace.yaml` explicitly allows the required dependency build scripts using pnpm 11’s `allowBuilds` configuration.
3. Copy `.env.example` to the root `.env`, then set `OPENAI_API_KEY`.
4. Run `pnpm db:up`. Compose starts PostgreSQL 17 and waits for its health check.
5. Run `pnpm db:migrate`. The migration creates guests, projects, conversations, messages, interview responses, checkpoints, and evidence, with ownership foreign keys and indexes.
6. Run `pnpm dev` and visit `http://localhost:3000`.

The database uses a named Docker volume. `pnpm docker:up` and `pnpm docker:down` are aliases for `pnpm db:up` and `pnpm db:down`. The down commands stop the database and retain that volume. Press Ctrl+C in the `pnpm dev` terminal to stop the application. Use `pnpm docker:ps` to check the database status and `pnpm docker:logs` to follow its logs. Do not remove the volume unless you intend to delete the stored workspaces. The Compose credentials are for local development and the port is bound only to `127.0.0.1`.

## Workflow

1. Describe a product on the landing page or choose an example.
2. Start the guided interview. Answer, choose “I don’t know,” or skip. The server caps it at five questions, and an early-finish control can generate checkpoints with missing details explicitly treated as unknown.
3. Expand a checkpoint to read its risk, priority reasoning, recommended action, acceptance criteria, engineering prompt, and review triggers.
4. Copy the engineering prompt. Add evidence with a reported/reviewed designation; reviewed notes require a person’s name.
5. Assign an owner and update the status. Completion requires at least one evidence note and a manual confirmation of the criteria and evidence.
6. Use “Revisit your risks” after a change. Answer the follow-up question; affected completed checkpoints return to “Needs review.”
7. Return using the same browser. Projects appear on the landing page; conversations remain accessible at the bottom of the workspace sidebar.

## Testing

The core tests need no database or API credentials:

```sh
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

Create a **separate disposable** PostgreSQL database for integration and browser tests:

```sh
docker compose exec -T postgres psql -U founderready -d postgres -c 'CREATE DATABASE founderready_test;'
```

Uncomment `TEST_DATABASE_URL` in the root `.env`, or export it in your shell. Use the same development credentials and port with database name `founderready_test`.

```sh
pnpm test:integration
pnpm --filter @founderready/web exec playwright install chromium
pnpm test:e2e
```

The integration suite applies migrations and **truncates data in the test database** between cases. Never point it at your application database. It calls real Route Handlers against PostgreSQL and substitutes deterministic advisor responses. Without `TEST_DATABASE_URL`, the integration suite is skipped.

The browser suite requires `TEST_DATABASE_URL`, builds and starts a separate Next.js production server on **3100**, and starts a test-only OpenAI-compatible HTTP server on **4321**. It exercises the actual official SDK, JSON parsing, API endpoints, database, guest cookies, and UI. The test provider exists only under `tests/e2e/`; there is no production demo mode. Its temporary API key and base URL are supplied only to the test process. Screenshots and failure traces go to the ignored `apps/web/test-results/` directory.

Do not run the integration and browser suites simultaneously against the same test database. The browser server and provider are stopped by Playwright when the run finishes.

To check the actual provider, configure a real key and run the normal app through an interview. Live API calls incur provider usage. Automated tests use a local provider fixture; live latency depends on the selected model, reasoning effort, and output length.

## Production

1. Provision PostgreSQL and configure a production `DATABASE_URL` with the TLS settings required by that provider. The local Compose database is a development service.
2. Set `OPENAI_API_KEY`, `OPENAI_MODEL`, `APP_URL` to the public HTTPS origin, and `COOKIE_SECURE=true` in the server environment.
3. Install with `pnpm install --frozen-lockfile`, run `pnpm db:migrate` once as a release step, and run `pnpm build`.
4. Start the Node application with `pnpm start`, behind your HTTPS reverse proxy or Node-compatible hosting platform.
5. Give AI endpoints up to 120 seconds. Each provider request has a 45-second timeout with no automatic SDK retries; one interview action can involve a question decision followed by an assessment. Interrupted operations become retryable after the two-minute lease expires.

The app requires the Node.js runtime and a persistent PostgreSQL database. It is not a static export or Edge-runtime application. Configure database backups and a tested restore procedure, external request limits and provider spending limits before making anonymous AI generation publicly available. Session-based limits alone can be bypassed by creating new sessions.

Expired guest sessions are rejected. The MVP does not automatically purge their stored data. Choose a retention policy and schedule deletion of expired `guests` rows if appropriate; database foreign keys cascade to their projects and dependent records. A guest cookie is the access credential, so keep server traffic on HTTPS. This MVP has no account migration or guest-session recovery.

## Troubleshooting

| Symptom | Action |
| --- | --- |
| Workspace unavailable | Run `pnpm db:up`, verify `DATABASE_URL`, then run `pnpm db:migrate`. |
| AI advisor is not configured | Set `OPENAI_API_KEY` in the root `.env` and restart the app. |
| Provider authorization error | Check the key and access to `OPENAI_MODEL`. |
| Provider usage limit | Check the provider’s billing quota/rate limits; retry when available. |
| Guest hourly limit | The database tracks 30 AI requests in a one-hour window. Resume after the window resets. |
| Saved answer followed by an error | Retry with “Continue assessment” or “Continue follow-up.” The answer has already been saved. |
| Advisor already working | Wait for the active request. After an interrupted server process, the lease expires after two minutes. |
| Cross-origin request rejected | Make the browser URL and `APP_URL` match exactly, including protocol and port. |
| Guest workspace disappears locally | Confirm `COOKIE_SECURE=false` for local HTTP and use the same browser. Clearing cookies removes access. |
| Clipboard unavailable | Expand “Read engineering prompt” and select the text. Browser clipboard access needs HTTPS or localhost. |
| Test database guard fails | Set `TEST_DATABASE_URL` to a disposable database ending in `_test`. |
