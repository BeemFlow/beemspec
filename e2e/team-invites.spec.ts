import { expect, test } from '@playwright/test';
import { buildInviteAcceptPath, FIRST_E2E_INVITE_ID, openTeamMembersSettings, resetE2EState } from './helpers';

test.beforeEach(async ({ request }) => {
  await resetE2EState(request);
});

test('accepting an invite link adds the user as a member', async ({ page }) => {
  await page.goto('/');

  await openTeamMembersSettings(page);

  await page.getByPlaceholder('Email address').fill('invitee@example.com');
  await page.getByPlaceholder('Email address').press('Enter');

  await expect(page.getByText('Invitation sent')).toBeVisible();
  await expect(page.getByText('invitee@example.com')).toBeVisible();

  await page.goto(buildInviteAcceptPath(FIRST_E2E_INVITE_ID, 'invitee@example.com'));
  await expect(page).toHaveURL(/\/$/);

  await openTeamMembersSettings(page);

  await expect(page.getByText('invitee@example.com')).toBeVisible();
  await expect(page.getByText('invitee@example.com')).toHaveCount(1);
});
