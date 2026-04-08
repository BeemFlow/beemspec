import { expect, test } from '@playwright/test';
import { E2E_STORY_MAP_ID, loginAsOwner, resetE2EState } from './helpers';

test.beforeEach(async ({ page }) => {
  await resetE2EState();
  await loginAsOwner(page);
});

test('can create and open the story map created from the dashboard', async ({ page }) => {
  await page.goto('/');

  await page.getByRole('button', { name: 'New Story Map' }).click();
  await page.getByLabel('Name').fill('Ops Transformation');
  await page.getByLabel('Description').fill('Future-state planning map');
  await page.getByRole('button', { name: 'Create' }).click();

  await expect(page.getByRole('link', { name: /Ops Transformation/i })).toBeVisible();

  await page.getByRole('link', { name: /Ops Transformation/i }).click();
  await expect(page).toHaveURL(/\/story-map\/[0-9a-f-]+$/);
  await expect(page.getByText('Ops Transformation')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Add Activity' })).toBeVisible();
});

test('can create activity, task, and story inside a story map', async ({ page }) => {
  await page.goto(`/story-map/${E2E_STORY_MAP_ID}`);

  await page
    .getByRole('button', { name: /Activity/i })
    .first()
    .click();
  await page.getByLabel('Name').fill('Approvals');
  await page.getByRole('button', { name: 'Save' }).click();
  await expect(page.getByText('Approvals')).toBeVisible();

  await page.getByRole('button', { name: /Task/i }).last().click();
  await page.getByLabel('Name').fill('Manager review');
  await page.getByRole('button', { name: 'Save' }).click();
  await expect(page.getByText('Manager review')).toBeVisible();

  await page.getByRole('button', { name: /Story/i }).last().click();
  await page.getByLabel('Title *').fill('Manager approves invoice');
  await page.getByLabel(/User Story/).fill('As a manager, I can approve an invoice for payment.');
  await page.getByLabel(/Acceptance Criteria/).fill('- [ ] Approval updates the invoice status');
  await page.getByRole('button', { name: 'Save Story' }).click();
  await expect(page.getByText('Manager approves invoice')).toBeVisible();

  await page.reload();
  await expect(page.getByText('Approvals')).toBeVisible();
  await expect(page.getByText('Manager review')).toBeVisible();
  await expect(page.getByText('Manager approves invoice')).toBeVisible();
});

test('can edit and delete an existing story in a story map', async ({ page }) => {
  await page.goto(`/story-map/${E2E_STORY_MAP_ID}`);

  await page.getByText('Customer can submit invoice').click();
  await page.getByLabel('Title *').fill('Customer submits invoice online');
  await page.getByRole('button', { name: 'Save Story' }).click();
  await expect(page.getByText('Customer submits invoice online')).toBeVisible();

  await page.getByText('Customer submits invoice online').click();
  await page.getByRole('button', { name: /^Delete$/ }).click();
  await page.getByRole('button', { name: /^Delete$/ }).click();
  await expect(page.getByText('Customer submits invoice online')).toHaveCount(0);
});

test('supports a full story-map journey from creation through persistence and deletion', async ({ page }) => {
  await page.goto('/');

  await page.getByRole('button', { name: 'New Story Map' }).click();
  await page.getByLabel('Name').fill('Claims Modernization');
  await page.getByLabel('Description').fill('Claims intake redesign');
  await page.getByRole('button', { name: 'Create' }).click();

  const mapLink = page.getByRole('link', { name: /Claims Modernization/i });
  await expect(mapLink).toBeVisible();
  await mapLink.click();
  await expect(page).toHaveURL(/\/story-map\/[0-9a-f-]+$/);

  await page.getByRole('button', { name: 'Story map settings' }).click();
  await page.getByLabel('Name').fill('Claims Modernization v2');
  await page.getByLabel('Description').fill('Claims intake redesign and escalation plan');
  await page.getByRole('button', { name: 'Save' }).click();
  await page.getByRole('button', { name: 'Close' }).click();
  await expect(page.getByText('Claims Modernization v2')).toBeVisible();

  await page.getByRole('button', { name: 'Story map context' }).click();
  await page
    .getByPlaceholder(/Use this space to capture durable product context that applies across the entire story map\./)
    .fill('Claims should be triaged within one business day.');
  await page.getByRole('button', { name: 'Save' }).click();

  await page
    .getByRole('button', { name: /Activity/i })
    .first()
    .click();
  await page.getByLabel('Name').fill('Claim Intake');
  await page.getByRole('button', { name: 'Save' }).click();
  await expect(page.getByText('Claim Intake')).toBeVisible();

  await page.getByRole('button', { name: 'Release' }).click();
  await page.getByPlaceholder('Release name').fill('MVP');
  await page.getByRole('button', { name: 'Save' }).click();
  await expect(page.getByText('MVP')).toBeVisible();

  await page.getByRole('button', { name: /Task/i }).last().click();
  await page.getByLabel('Name').fill('Validate submission');
  await page.getByRole('button', { name: 'Save' }).click();
  await expect(page.getByText('Validate submission')).toBeVisible();

  await page.getByRole('button', { name: /Story/i }).last().click();
  await page.getByLabel('Title *').fill('Claims specialist validates intake');
  await page.getByLabel(/User Story/).fill('As a claims specialist, I can validate an intake package before review.');
  await page.getByLabel(/Acceptance Criteria/).fill('- [ ] Missing documents are flagged');
  await page.getByRole('button', { name: 'Save Story' }).click();
  await expect(page.getByText('Claims specialist validates intake')).toBeVisible();

  await page.getByText('Claims specialist validates intake').click();
  await page.getByLabel('Title *').fill('Claims specialist validates intake packet');
  await page.getByRole('button', { name: 'Save Story' }).click();
  await expect(page.getByText('Claims specialist validates intake packet')).toBeVisible();

  await page.reload();
  await expect(page.getByText('Claims Modernization v2')).toBeVisible();
  await expect(page.getByText('MVP')).toBeVisible();
  await expect(page.getByText('Claim Intake')).toBeVisible();
  await expect(page.getByText('Validate submission')).toBeVisible();
  await expect(page.getByText('Claims specialist validates intake packet')).toBeVisible();

  await page.getByText('Claims specialist validates intake packet').click();
  await page.getByRole('button', { name: /^Delete$/ }).click();
  await page.getByRole('button', { name: /^Delete$/ }).click();
  await expect(page.getByText('Claims specialist validates intake packet')).toHaveCount(0);

  await page.getByRole('button', { name: 'Story map settings' }).click();
  await page.getByRole('tab', { name: 'Danger' }).click();
  await page.getByRole('button', { name: 'Delete story map' }).click();
  await page.getByLabel(/Type .* to confirm/).fill('Claims Modernization v2');
  await page.getByRole('button', { name: 'Delete' }).click();
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByRole('link', { name: /Claims Modernization v2/i })).toHaveCount(0);
});
