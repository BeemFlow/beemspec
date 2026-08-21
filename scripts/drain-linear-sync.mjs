const baseUrl = process.env.SYNC_DRAIN_URL?.trim() || process.env.APP_URL?.trim();
const secret = process.env.INTEGRATION_SYNC_SECRET?.trim();

if (!baseUrl || !secret) {
  throw new Error('Set SYNC_DRAIN_URL (or APP_URL) and INTEGRATION_SYNC_SECRET');
}

const endpoint = baseUrl.endsWith('/api/internal/integrations/linear/drain')
  ? baseUrl
  : `${baseUrl.replace(/\/$/, '')}/api/internal/integrations/linear/drain`;

const response = await fetch(endpoint, {
  method: 'POST',
  headers: { authorization: `Bearer ${secret}` },
});

const body = await response.text();
if (!response.ok) {
  throw new Error(`Linear sync drain failed (${response.status}): ${body}`);
}

process.stdout.write(`${body}\n`);
