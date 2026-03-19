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

  await page.getByRole('button', { name: 'Process flow settings' }).click();
  await page.getByLabel('Name').fill('Accounts Payable Ops');
  await page.getByRole('button', { name: 'Save' }).click();
  await expect(page.getByText('Accounts Payable Ops')).toBeVisible();

  await page.getByRole('button', { name: 'Step' }).click();
  const newStepNode = page.getByTestId('processflow-node-step').filter({ hasText: 'New step' }).first();
  await expect(newStepNode).toBeVisible();
  await page.getByRole('button', { name: 'Validate' }).click();
  await expect(page.getByText(/^2$/)).toBeVisible();

  await page.getByRole('button', { name: 'Auto-layout' }).click();
  await page.reload();

  await expect(page.getByText('Accounts Payable Ops')).toBeVisible();
  await expect(page.getByTestId('processflow-node-step').filter({ hasText: 'New step' }).first()).toBeVisible();
});

test('shows connected state after adding a new edge', async ({ page, request }) => {
  await page.goto('/process-flows/flow-1');

  await page.getByRole('button', { name: 'Step' }).click();
  const newStepNode = page.getByTestId('processflow-node-step').filter({ hasText: 'New step' }).first();
  await expect(newStepNode).toBeVisible();
  await page.getByRole('button', { name: 'Validate' }).click();
  await expect(page.getByText(/^2$/)).toBeVisible();

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
  await page.getByRole('button', { name: 'Validate' }).click();
  await expect(page.getByText(/^1$/)).toBeVisible();
});

test('can edit and persist operational metadata for nodes and edges', async ({ page }) => {
  await page.goto('/process-flows/flow-1');

  await page.getByTestId('processflow-node-step').filter({ hasText: 'Receive invoice' }).first().click();
  await page.getByLabel('Frequency').fill('~200/day');
  await page.getByLabel('Est. Duration').fill('5-10 min');
  await page.getByLabel('Time Constraint').fill('must complete within 48h');
  await Promise.all([
    page.waitForResponse(
      (response) => response.url().includes('/api/process-flows/flow-1/nodes') && response.request().method() === 'PUT',
    ),
    page.getByRole('button', { name: 'Save Node' }).click(),
  ]);

  await page.reload();
  await page.getByTestId('processflow-node-step').filter({ hasText: 'Receive invoice' }).first().click();
  await expect(page.getByLabel('Frequency')).toHaveValue('~200/day');
  await expect(page.getByLabel('Est. Duration')).toHaveValue('5-10 min');
  await expect(page.getByLabel('Time Constraint')).toHaveValue('must complete within 48h');

  await page.getByText('Review').click({ force: true });
  await expect(page.getByText('Edge Details')).toBeVisible();
  await page.getByLabel('Condition').fill('invoice total > $10,000');
  await Promise.all([
    page.waitForResponse(
      (response) => response.url().includes('/api/process-flows/flow-1/edges') && response.request().method() === 'PUT',
    ),
    page.getByRole('button', { name: 'Save Edge' }).click(),
  ]);

  await page.reload();
  await page.getByText('Review').click({ force: true });
  await expect(page.getByLabel('Condition')).toHaveValue('invoice total > $10,000');
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

test('malformed persisted flow data does not crash the process flow page', async ({ page, request }) => {
  const response = await request.post('/api/e2e/reset?scenario=malformed');
  expect(response.ok()).toBeTruthy();

  await page.goto('/process-flows/flow-1');

  await expect(page.getByText('Accounts Payable')).toBeVisible();
  await expect(page.getByText('Untitled')).toBeVisible();
});
