import { expect, test } from '@playwright/test';
import { resetE2EState } from './helpers';

test.beforeEach(async ({ request }) => {
  await resetE2EState(request);
});

test('can create and open the story map created from the dashboard', async ({ page }) => {
  await page.goto('/');

  await page.getByRole('button', { name: 'New Story Map' }).click();
  await page.getByLabel('Name').fill('Ops Transformation');
  await page.getByLabel('Description').fill('Future-state planning map');
  await page.getByRole('button', { name: 'Create' }).click();

  await expect(page.getByRole('link', { name: /Ops Transformation/i })).toBeVisible();

  await page.getByRole('link', { name: /Ops Transformation/i }).click();
  await expect(page).toHaveURL(/\/story-map\/story-map-\d+$/);
  await expect(page.getByText('Ops Transformation')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Add Activity' })).toBeVisible();
});

test('can create activity, task, and story inside a story map', async ({ page }) => {
  await page.goto('/story-map/story-map-1');

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
  await page.goto('/story-map/story-map-1');

  await page.getByText('Customer can submit invoice').click();
  await page.getByLabel('Title *').fill('Customer submits invoice online');
  await page.getByRole('button', { name: 'Save Story' }).click();
  await expect(page.getByText('Customer submits invoice online')).toBeVisible();

  await page.getByText('Customer submits invoice online').click();
  await page.getByRole('button', { name: /^Delete$/ }).click();
  await page.getByRole('button', { name: /^Delete$/ }).click();
  await expect(page.getByText('Customer submits invoice online')).toHaveCount(0);
});
