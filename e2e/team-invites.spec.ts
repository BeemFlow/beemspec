import { expect, test } from '@playwright/test';
import { E2E_INVITEE_EMAIL, loginAsOwner, openTeamMembersSettings, resetE2EState, waitForInviteLink } from './helpers';

test.beforeEach(async ({ page }) => {
  await resetE2EState();
  await loginAsOwner(page);
});

test('accepting an invite link adds the user as a member', async ({ page, request }) => {
  await openTeamMembersSettings(page);

  await page.getByPlaceholder('Email address').fill(E2E_INVITEE_EMAIL);
  await page.getByPlaceholder('Email address').press('Enter');

  await expect(page.getByText('Invitation sent')).toBeVisible();
  await expect(page.getByText(E2E_INVITEE_EMAIL)).toBeVisible();

  const inviteLink = await waitForInviteLink(request, E2E_INVITEE_EMAIL);
  await page.context().clearCookies();
  await page.goto(inviteLink);
  await expect(page).toHaveURL(/\/$/);

  await loginAsOwner(page);
  await openTeamMembersSettings(page);

  await expect(page.getByText(E2E_INVITEE_EMAIL)).toBeVisible();
  await expect(page.getByText(E2E_INVITEE_EMAIL)).toHaveCount(1);
  await expect(page.getByText('Pending Invites')).toHaveCount(0);
  await expect(page.getByText('member', { exact: true })).toBeVisible();
});
