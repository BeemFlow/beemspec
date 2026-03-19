import { expect, test } from '@playwright/test';

test.beforeEach(async ({ request }) => {
  const response = await request.post('/api/e2e/reset');
  expect(response.ok()).toBeTruthy();
});

test('dashboard shows story maps and process flows', async ({ page }) => {
  await page.goto('/');

  await expect(page.getByRole('heading', { name: 'Story Maps' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Process Flows' })).toBeVisible();
  await expect(page.getByRole('link', { name: /Platform Core/i })).toBeVisible();
  await expect(page.getByRole('link', { name: /Accounts Payable/i })).toBeVisible();
});

test('can create and edit a process flow through the UI', async ({ page }) => {
  await page.goto('/');

  await page.getByRole('button', { name: 'New Process Flow' }).click();
  await page.getByLabel('Name').fill('Vendor Intake');
  await page.getByLabel('Description').fill('Vendor onboarding flow');
  await page.getByRole('button', { name: 'Create' }).click();

  await expect(page.getByRole('link', { name: /Vendor Intake/i })).toBeVisible();

  await page.getByRole('link', { name: /Accounts Payable/i }).click();
  await expect(page).toHaveURL(/\/process-flows\/flow-1$/);
  await expect(page.getByText('Accounts Payable')).toBeVisible();

  await page.getByLabel('Name').fill('Accounts Payable Ops');
  await page.getByRole('button', { name: 'Save Flow Details' }).click();
  await expect(page.getByText('Accounts Payable Ops')).toBeVisible();

  await page.getByRole('button', { name: 'Step' }).click();
  const newStepNode = page.getByTestId('processflow-node-step').filter({ hasText: 'New step' }).first();
  await expect(newStepNode).toBeVisible();
  await expect(page.getByText('Node "New step" is disconnected from the process flow.')).toBeVisible();

  await page.getByRole('button', { name: 'Auto-layout' }).click();
  await page.getByRole('button', { name: 'Reload' }).click();

  await expect(page.getByText('Accounts Payable Ops')).toBeVisible();
  await expect(page.getByTestId('processflow-node-step').filter({ hasText: 'New step' }).first()).toBeVisible();
});

test('shows connected state after adding a new edge', async ({ page, request }) => {
  await page.goto('/process-flows/flow-1');

  await page.getByRole('button', { name: 'Step' }).click();
  const newStepNode = page.getByTestId('processflow-node-step').filter({ hasText: 'New step' }).first();
  await expect(newStepNode).toBeVisible();
  await expect(page.getByText('Node "New step" is disconnected from the process flow.')).toBeVisible();

  const response = await request.post('/api/process-flows/flow-1/edges', {
    data: {
      type: 'flow',
      source_node_id: 'node-2',
      target_node_id: 'node-3',
      data: { label: 'Approved' },
    },
  });
  expect(response.ok()).toBeTruthy();

  await page.getByRole('button', { name: 'Validate' }).click();
  await expect(page.getByText('Node "New step" is disconnected from the process flow.')).toHaveCount(0);
});

test('can create and open a story map from the dashboard', async ({ page }) => {
  await page.goto('/');

  await page.getByRole('button', { name: 'New Story Map' }).click();
  await page.getByLabel('Name').fill('Ops Transformation');
  await page.getByLabel('Description').fill('Future-state planning map');
  await page.getByRole('button', { name: 'Create' }).click();

  await expect(page.getByRole('link', { name: /Ops Transformation/i })).toBeVisible();

  await page.getByRole('link', { name: /Platform Core/i }).click();
  await expect(page).toHaveURL(/\/story-map\/story-map-1$/);
  await expect(page.getByText('Platform Core')).toBeVisible();
  await expect(page.getByText('Finance intake')).toBeVisible();
  await expect(page.getByText('Invoice submission')).toBeVisible();
  await expect(page.getByText('Customer can submit invoice')).toBeVisible();
});

test('malformed persisted flow data does not crash the process flow page', async ({ page, request }) => {
  const response = await request.post('/api/e2e/reset?scenario=malformed');
  expect(response.ok()).toBeTruthy();

  await page.goto('/process-flows/flow-1');

  await expect(page.getByText('Accounts Payable')).toBeVisible();
  await expect(page.getByText('Untitled')).toBeVisible();
});
