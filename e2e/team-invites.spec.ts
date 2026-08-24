import { expect, test } from '@playwright/test';
import { E2E_INVITEE_EMAIL, loginAsOwner, openTeamMembersSettings, resetE2EState, waitForInviteLink } from './helpers';
import { createAdminClient, E2E_INVITEE_PASSWORD, E2E_TEAM_ID, ensureLocalAuthUser } from './local-fixtures';

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
  await expect(page.getByRole('combobox', { name: `Role for ${E2E_INVITEE_EMAIL}` })).toHaveText(/Member/i);
});

test('an owner can promote and remove another owner', async ({ page }) => {
  const admin = createAdminClient();
  const invitee = await ensureLocalAuthUser(admin, {
    email: E2E_INVITEE_EMAIL,
    password: E2E_INVITEE_PASSWORD,
    fullName: 'Invitee Example',
  });
  const memberInsert = await admin
    .from('team_members')
    .insert({ team_id: E2E_TEAM_ID, user_id: invitee.id, role: 'member' });
  expect(memberInsert.error).toBeNull();

  await openTeamMembersSettings(page);

  const roleSelect = page.getByRole('combobox', { name: `Role for ${E2E_INVITEE_EMAIL}` });
  await expect(roleSelect).toHaveText(/Member/i);
  await roleSelect.click();
  await page.getByRole('option', { name: 'Owner' }).click();
  await expect(roleSelect).toHaveText(/Owner/i);

  await page.getByRole('button', { name: `Remove ${E2E_INVITEE_EMAIL}` }).click();
  await expect(page.getByRole('alertdialog')).toContainText(`${E2E_INVITEE_EMAIL} will be removed from the team.`);
  await page.getByRole('alertdialog').getByRole('button', { name: 'Delete' }).click();

  await expect(page.getByText(E2E_INVITEE_EMAIL)).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Remove e2e-owner@example.com' })).toBeDisabled();
});
