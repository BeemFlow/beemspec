# DigitalOcean deployment

`.do/app.yaml` is the production App Platform source of truth. The
`Deploy to DigitalOcean` GitHub Actions workflow applies it on every push to
`main`; native App Platform `deploy_on_push` is disabled so there is only one
deployment controller.

The GitHub `Production` environment must define these secrets before the
workflow is enabled on `main`:

- `DIGITALOCEAN_ACCESS_TOKEN`
- `INTEGRATION_SYNC_SECRET`
- `LINEAR_CLIENT_ID`
- `LINEAR_CLIENT_SECRET`
- `LINEAR_OAUTH_REDIRECT_URI`
- `LINEAR_WEBHOOK_SECRET`
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
- `NEXT_PUBLIC_SUPABASE_URL`
- `SHARE_LINK_SECRET`
- `SUPABASE_SECRET_KEY`

The workflow substitutes those values into the App Spec. DigitalOcean stores
variables marked `SECRET` encrypted; no secret values belong in the repository.
The DigitalOcean token should use custom scopes limited to `app:read` and
`app:update` plus the read scopes DigitalOcean requires for those permissions.

`INTEGRATION_SYNC_SECRET` is app-level because the web service authenticates
the internal drain endpoint and the scheduled job calls it. Other credentials
remain web-service-only. `SYNC_DRAIN_URL` is job-only and resolves from
DigitalOcean's `${APP_URL}` binding.

The `linear-sync-drain` job runs `npm run sync:drain` every 15 minutes as a
durable recovery path. Story saves from the web app still make an immediate
post-response attempt, so normal sync latency does not wait for the schedule.

## Cutover

1. Populate all secrets in the GitHub `Production` environment.
2. Merge the deployment workflow and App Spec to `main`.
3. Confirm the GitHub deployment succeeds and both components are healthy.
4. Confirm a scheduled invocation appears in DigitalOcean's job activity.

Do not edit production settings in the DigitalOcean dashboard after cutover.
If an emergency dashboard edit is unavoidable, immediately port it back to
`.do/app.yaml`; the next GitHub deployment otherwise replaces it.

## Recovery

If GitHub deployment is unavailable, download the current App Spec from
DigitalOcean before making an emergency change. Once recovered, reconcile the
live spec back into `.do/app.yaml` before re-enabling the workflow.
