import { expect, test } from '@playwright/test';
import { connectNodes, expectProcessFlowWarningCount, resetE2EState } from './helpers';

test.beforeEach(async ({ request }) => {
  await resetE2EState(request);
});

test('dashboard shows story maps and process flows', async ({ page }) => {
  await page.goto('/');

  await expect(page.getByRole('heading', { name: 'Story Maps' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Process Flows' })).toBeVisible();
  await expect(page.getByRole('link', { name: /Platform Core/i })).toBeVisible();
  await expect(page.getByRole('link', { name: /Accounts Payable/i })).toBeVisible();
});

test('can create, open, and edit a process flow through the UI', async ({ page }) => {
  await page.goto('/');

  await page.getByRole('button', { name: 'New Process Flow' }).click();
  await page.getByLabel('Name').fill('Vendor Intake');
  await page.getByLabel('Description').fill('Vendor onboarding flow');
  await page.getByRole('button', { name: 'Create' }).click();

  await expect(page.getByRole('link', { name: /Vendor Intake/i })).toBeVisible();

  await page.getByRole('link', { name: /Vendor Intake/i }).click();
  await expect(page).toHaveURL(/\/process-flows\/flow-\d+$/);
  await expect(page.getByText('Vendor Intake')).toBeVisible();

  await page.getByRole('button', { name: 'Process flow settings' }).click();
  await page.getByLabel('Name').fill('Vendor Intake Ops');
  await page.getByRole('button', { name: 'Save' }).click();
  await expect(page.getByText('Vendor Intake Ops')).toBeVisible();

  await page.getByRole('button', { name: 'Step', exact: true }).click();
  const newStepNode = page.getByTestId('processflow-node-step').filter({ hasText: 'New step' }).first();
  await expect(newStepNode).toBeVisible();
  await page.getByRole('button', { name: 'Validate' }).click();
  await expectProcessFlowWarningCount(page, 1);

  await page.getByRole('button', { name: 'Auto-layout' }).click();
  await page.reload();

  await expect(page.getByText('Vendor Intake Ops')).toBeVisible();
  await expect(page.getByTestId('processflow-node-step').filter({ hasText: 'New step' }).first()).toBeVisible();
});

test('can add a new edge through the canvas UI', async ({ page }) => {
  await page.goto('/process-flows/flow-1');

  await page.getByRole('button', { name: 'Step', exact: true }).click();
  const newStepNode = page.getByTestId('processflow-node-step').filter({ hasText: 'New step' }).first();
  await expect(newStepNode).toBeVisible();
  await page.getByRole('button', { name: 'Validate' }).click();
  await expectProcessFlowWarningCount(page, 2);

  const createEdgeResponse = page.waitForResponse(
    (response) => response.url().includes('/api/process-flows/flow-1/edges') && response.request().method() === 'POST',
  );
  await connectNodes(
    page,
    page.getByTestId('processflow-handle-source-node-2'),
    page.getByTestId('processflow-handle-target-node-3'),
  );
  await createEdgeResponse;

  await expect(page.getByText('Edge Details')).toBeVisible();
  await page.getByLabel('Label').fill('Approved');
  await page.getByLabel('Condition').fill('invoice total <= $10,000');
  await Promise.all([
    page.waitForResponse(
      (response) => response.url().includes('/api/process-flows/flow-1/edges') && response.request().method() === 'PUT',
    ),
    page.getByRole('button', { name: 'Save Edge' }).click(),
  ]);

  await page.getByRole('button', { name: 'Validate' }).click();
  await expectProcessFlowWarningCount(page, 1);

  await page.reload();
  await page.getByRole('group', { name: 'Edge from node-2 to node-3' }).click({ force: true });
  await expect(page.getByText('Edge Details')).toBeVisible();
  await expect(page.getByLabel('Condition')).toHaveValue('invoice total <= $10,000');
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

  await page.getByRole('group', { name: 'Edge from node-1 to node-2' }).click({ force: true });
  await expect(page.getByText('Edge Details')).toBeVisible();
  await page.getByLabel('Condition').fill('invoice total > $10,000');
  await Promise.all([
    page.waitForResponse(
      (response) => response.url().includes('/api/process-flows/flow-1/edges') && response.request().method() === 'PUT',
    ),
    page.getByRole('button', { name: 'Save Edge' }).click(),
  ]);

  await page.reload();
  await page.getByRole('group', { name: 'Edge from node-1 to node-2' }).click({ force: true });
  await expect(page.getByLabel('Condition')).toHaveValue('invoice total > $10,000');
});

test('malformed persisted flow data does not crash the process flow page', async ({ page, request }) => {
  await resetE2EState(request, 'malformed');

  await page.goto('/process-flows/flow-1');

  await expect(page.getByText('Accounts Payable')).toBeVisible();
  await expect(page.getByText('Untitled')).toBeVisible();
});
