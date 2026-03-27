import { type APIRequestContext, expect, type Locator, type Page } from '@playwright/test';

export const E2E_TEAM_ID = '00000000-0000-4000-8000-000000000001';
export const FIRST_E2E_INVITE_ID = 'invite-1';

export async function resetE2EState(request: APIRequestContext, scenario: 'default' | 'malformed' = 'default') {
  const search = scenario === 'malformed' ? '?scenario=malformed' : '';
  const response = await request.post(`/api/e2e/reset${search}`);
  expect(response.ok()).toBeTruthy();
}

export async function connectNodes(page: Page, sourceHandle: Locator, targetHandle: Locator) {
  const sourceBox = await sourceHandle.boundingBox();
  const targetBox = await targetHandle.boundingBox();

  if (!sourceBox || !targetBox) {
    throw new Error('Unable to connect process flow nodes because a handle is missing');
  }

  await page.mouse.move(sourceBox.x + sourceBox.width / 2, sourceBox.y + sourceBox.height / 2);
  await page.mouse.down();
  await page.mouse.move(targetBox.x + targetBox.width / 2, targetBox.y + targetBox.height / 2, { steps: 16 });
  await page.mouse.up();
}

export async function openTeamMembersSettings(page: Page) {
  await page.getByRole('button', { name: /E2E Team/i }).click();
  await page.getByRole('menuitem', { name: /Team settings/i }).click();
  await page.getByRole('tab', { name: 'Members' }).click();
}

export function buildInviteAcceptPath(inviteId: string, email: string) {
  return `/invite/accept?invite_id=${inviteId}&email=${encodeURIComponent(email)}`;
}

export async function expectProcessFlowWarningCount(page: Page, count: number) {
  await expect(page.getByTestId('processflow-warning-count')).toHaveText(String(count));
}
