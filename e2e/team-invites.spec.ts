import { expect, test } from '@playwright/test';

const TEAM_ID = '00000000-0000-4000-8000-000000000001';

test.beforeEach(async ({ request }) => {
  const response = await request.post('/api/e2e/reset');
  expect(response.ok()).toBeTruthy();
});

test('team invite acceptance adds the user as a member', async ({ page, request }) => {
  await page.goto('/');

  await page.getByRole('button', { name: /E2E Team/i }).click();
  await page.getByRole('menuitem', { name: /Team settings/i }).click();
  await page.getByRole('tab', { name: 'Members' }).click();

  await page.getByPlaceholder('Email address').fill('invitee@example.com');
  await page.getByPlaceholder('Email address').press('Enter');

  await expect(page.getByText('Invitation sent')).toBeVisible();
  await expect(page.getByText('invitee@example.com')).toBeVisible();

  const invitesResponse = await request.get(`/api/teams/${TEAM_ID}/invites`);
  expect(invitesResponse.ok()).toBeTruthy();
  const invites = (await invitesResponse.json()) as Array<{ id: string; email: string }>;
  const invite = invites.find((entry) => entry.email === 'invitee@example.com');
  expect(invite).toBeTruthy();

  await page.goto(`/invite/accept?invite_id=${invite?.id}&email=invitee@example.com`);
  await expect(page).toHaveURL(/\/$/);

  await page.getByRole('button', { name: /E2E Team/i }).click();
  await page.getByRole('menuitem', { name: /Team settings/i }).click();
  await page.getByRole('tab', { name: 'Members' }).click();

  await expect(page.getByText('invitee@example.com')).toBeVisible();
  await expect(page.getByText('invitee@example.com')).toHaveCount(1);
});
