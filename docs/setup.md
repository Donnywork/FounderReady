# Setup and operations

## Environment

For local development, copy `.env.example` to `.env` in the repository root. Next.js, migrations, and test runners use `apps/web/env.cjs` to load the same root configuration. Explicit shell variables take precedence. On Vercel, configure variables in the project's environment settings. Never put API credentials in `NEXT_PUBLIC_` variables. Restart the local app or redeploy on Vercel after editing its configuration.

| Variable | Purpose |
| --- | --- |
| `DATABASE_URL` | PostgreSQL URL; the example uses the Compose service on localhost:54329. |
| `DATABASE_URL_UNPOOLED` | Direct PostgreSQL URL supplied by Neon's Vercel integration. The Vercel build command below passes it to the migration script as `DATABASE_URL`. Optional for local Compose development. |
| `OPENAI_API_KEY` | Server-side key with available quota and access to the configured model. |
| `OPENAI_MODEL` | Responses model supporting structured outputs; default `gpt-4.1-mini`. |
| `OPENAI_REASONING_EFFORT` | Optional supported reasoning effort. Leave unset for models without this feature. |
| `APP_URL` | Exact public origin, including scheme and port; used to reject cross-origin mutations. |
| `COOKIE_SECURE` | `false` for local HTTP; `true` for production HTTPS. |
| `TEST_DATABASE_URL` | Disposable integration/browser database whose name ends in `_test`. |

`DATABASE_URL` contains the username, password, host, port, and database name. For local development, `compose.yaml` sets the database credentials and `.env.example` provides the matching connection URL. The app reads `DATABASE_URL`, so separate username/password variables are unnecessary. Compose initialization settings apply when its database volume is first created; changing them later does not change an existing database user's password.

## Local commands

```sh
pnpm install
cp .env.example .env
# Edit .env and set OPENAI_API_KEY.
pnpm docker:up
pnpm db:migrate
pnpm dev
```

Open http://localhost:3000. `pnpm docker:ps` shows the database state; `pnpm docker:logs` follows logs. Ctrl+C stops the app. `pnpm docker:down` stops the database while retaining its named volume. `db:up` and `db:down` are aliases. Compose runs PostgreSQL; the app runs on the host to use the existing Node/pnpm development workflow.

Apply migrations before starting an upgraded app. Migrations preserve existing data and disable schema synchronization. The original follow-up endpoint was replaced by the conversations/proposals endpoints; historical follow-up messages remain accessible. Imported projects get a profile with explicit unknowns. Legacy checkpoints retain evidence and confirmations, with migration events and a domain classification marked for review.

## Deploy on Vercel (Neon)

Vercel runs the Next.js app and connects to hosted PostgreSQL. The Compose database and its `localhost:54329` URL are for local development.

1. Import the repository into Vercel. Choose the **Next.js** framework preset and set **Root Directory** to `apps/web`. Use Node.js **24.x** compatible with the repository's `package.json` engine requirement and let Vercel detect the pnpm installation.
2. Provision or connect Neon through the Vercel Marketplace. Confirm its database variables are available in the **Production** environment. Preserve the provider's TLS parameters in both URLs.
3. Under **Settings → Environment Variables**, confirm or add these production values:

| Variable | Production value |
| --- | --- |
| `DATABASE_URL` | Neon's pooled connection URL for the running app. |
| `DATABASE_URL_UNPOOLED` | Neon's direct connection URL for migrations. |
| `OPENAI_API_KEY` | Your server-side OpenAI key. |
| `OPENAI_MODEL` | `gpt-4.1-mini`, or another supported Responses model. |
| `APP_URL` | Your exact public HTTPS origin, such as `https://your-app.vercel.app` or your custom domain. |
| `COOKIE_SECURE` | `true`. |

For another PostgreSQL provider, use its recommended pooled and direct URLs under the same variable names. If one URL supports both application traffic and migrations, use it for both variables.

Under **Settings → Build and Deployment**, enable the **Build Command** override and paste this as one line:

```sh
if [ "$VERCEL_ENV" = "production" ]; then DATABASE_URL="$DATABASE_URL_UNPOOLED" pnpm db:migrate && pnpm build; else pnpm build; fi
```

This command runs from `apps/web`. On production deployments, it temporarily supplies the direct URL as `DATABASE_URL` to the migration script, then builds only if migrations succeed. The running app continues using the pooled `DATABASE_URL`. The normal `pnpm build` script does not apply migrations by itself.

Save the settings and trigger a new production deployment, either by pushing to the production branch or redeploying a production deployment. In its **Build Logs**, look for `Applied N migration(s).` or `Database is up to date.` before the Next.js build. TypeORM records completed migrations and applies only pending ones on later deployments.

Preview builds skip migrations with this command. To use a preview, give it a separate database or Neon branch, apply its migrations separately, and set its environment variables, including an `APP_URL` matching the preview's actual origin.

Migrations run against the production database before the new app goes live, so maintain backups and keep schema changes compatible with the app version currently serving users. A later build failure does not undo migrations that already succeeded.

## Testing

```sh
pnpm lint
pnpm typecheck
pnpm test
pnpm build
docker compose exec -T postgres psql -U founderready -d postgres -c 'CREATE DATABASE founderready_test;'
```

Set `TEST_DATABASE_URL` in the root `.env` using the development URL with database name `founderready_test`, then:

```sh
pnpm test:integration
pnpm --filter @founderready/web exec playwright install chromium
pnpm test:e2e
```

Integration tests apply migrations and truncate **only the disposable test database**. They skip if no test database is configured. The browser suite requires that database, builds a production app on **3100**, and runs a test-only OpenAI-compatible server on **4321**. Its credentials and base URL are supplied only to those test processes. Screenshots and traces go to ignored `apps/web/test-results/`. Playwright stops its servers when done. Run the suites sequentially.

The normal product always uses real OpenAI requests. To test model quality, use the [README demo](../README.md#full-demo) with a configured key. Model wording and question count can vary. Automated tests prove workflow behavior, not model quality or live provider availability.

## Production

For Vercel, follow [Deploy on Vercel (Neon)](#deploy-on-vercel-neon). For a self-hosted Node deployment:

1. Provision PostgreSQL and set `DATABASE_URL` with the TLS options required by the provider.
2. Configure `OPENAI_API_KEY`, `OPENAI_MODEL`, `APP_URL`, and `COOKIE_SECURE=true`.
3. Install with `pnpm install --frozen-lockfile`, back up the database, apply `pnpm db:migrate`, then `pnpm build`.
4. Run `pnpm start` behind HTTPS with an appropriate request timeout (at least 120 seconds). One action can use two consecutive 45-second model calls.
5. Configure database backups, ingress request limits, and provider spending limits. Per-guest limits do not stop someone creating another guest session.

The app needs a Node runtime and persistent PostgreSQL; it cannot be statically exported. Mutations acquire project leases and transactional commits check the lease token. Dead processes leave a lease that expires after three minutes. Provider failures preserve submitted interview answers, evidence, and chat messages so the UI can retry without duplicating them.

Guest cookies expire after 180 days. Records are not automatically purged. Immutable evidence/review/event triggers intentionally block ordinary SQL updates/deletes, including cascading deletion. Retention or account deletion requires an explicit administrative archival procedure; no such interface is shipped in this MVP.

## Troubleshooting

| Symptom | Action |
| --- | --- |
| Workspace unavailable | Check `pnpm docker:ps`, `DATABASE_URL`, and `pnpm db:migrate`. |
| Advisor not configured | Set `OPENAI_API_KEY` in root `.env` and restart. |
| Provider authorization or usage error | Check model access and API billing quota. |
| Guest limit reached | Resume after the one-hour AI window resets. |
| Saved answer/message followed by an error | Continue the interview, retry profile approval, or use **Retry saved message**. |
| Advisor already working | Wait for the active request; interrupted leases expire after three minutes. |
| Proposed item changed | Reject the stale proposal and request a new one using the current context. |
| Relationship cannot be approved | Approve its referenced new checkpoints first, then retry the link. |
| Cannot confirm a reopened checkpoint | Review the supplied evidence again against the current criteria. |
| Cross-origin rejection | Match the browser URL to `APP_URL`, including protocol and port. |
| Guest workspace missing locally | Use the same browser and `COOKIE_SECURE=false` for HTTP. |
| Clipboard unavailable | Expand the engineering prompt and copy its text manually. |
