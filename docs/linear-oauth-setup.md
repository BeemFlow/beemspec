# Linear OAuth setup

This app uses one shared Linear OAuth application to connect many users and teams. End users do **not** need to create their own OAuth app.

## 1) Create one Linear OAuth app

1. Open Linear app settings for OAuth applications.
2. Create a new OAuth2 application.
3. Add your callback URL:
   - Local: `http://localhost:3000/api/integrations/linear/oauth/callback`
   - Production: `https://<your-domain>/api/integrations/linear/oauth/callback`
4. Keep the generated client ID and client secret.

Recommended: create and manage this OAuth app from a dedicated Linear workspace used for integrations.

## 2) Configure BeemSpec env vars

Set the following environment variables in your app runtime:

- `LINEAR_CLIENT_ID`
- `LINEAR_CLIENT_SECRET`
- `LINEAR_OAUTH_REDIRECT_URI`

Optional but recommended for webhook writeback verification:

- `LINEAR_WEBHOOK_SECRET`

## 3) Connect from Team Settings

1. Open Team Settings -> Integrations.
2. Click **Connect Linear**.
3. Complete Linear consent.

After callback:

- Workspace is saved automatically.
- Team/project/state defaults are auto-applied when they can be inferred safely.
- If multiple Linear teams are available, choose one from the dropdown and save.

## 4) How multi-workspace auth works

- One OAuth app can authorize users from many external Linear workspaces.
- Access is always based on what the authorizing user can access in their Linear workspace.
- Team owners in BeemSpec control connection for their team.

## 5) Troubleshooting

- `Linear OAuth failed while exchanging the code.`
  - Check `LINEAR_CLIENT_ID`, `LINEAR_CLIENT_SECRET`, and exact callback URL match.
- Connected but no team options appear:
  - Confirm the authorizing user has team access in Linear.
  - Reconnect and re-consent if scopes changed.
