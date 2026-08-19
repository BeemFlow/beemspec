import { expect, test } from '@playwright/test';
import {
  connectNodes,
  E2E_NODE_APPROVED_ID,
  E2E_NODE_RECEIVE_ID,
  E2E_PROCESS_FLOW_ID,
  loginAsOwner,
  resetE2EState,
} from './helpers';

test.beforeEach(async ({ page }) => {
  await resetE2EState();
  await loginAsOwner(page);
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
  await expect(page).toHaveURL(/\/process-flows\/[0-9a-f-]+$/);
  await expect(page.getByRole('heading', { name: 'Vendor Intake' })).toBeVisible();

  await page.getByRole('button', { name: 'Process flow settings' }).click();
  await page.getByLabel('Name').fill('Vendor Intake Ops');
  await page.getByRole('button', { name: 'Save' }).click();
  await expect(page.getByText('Vendor Intake Ops')).toBeVisible();

  await page.getByRole('button', { name: 'Step', exact: true }).click();
  const newStepNode = page.getByTestId('processflow-node-step').filter({ hasText: 'New step' }).first();
  await expect(newStepNode).toBeVisible();
  await page.getByRole('button', { name: 'Validate' }).click();
  await expect(page.getByText('Validation')).toBeVisible();

  const autolayoutResponse = page.waitForResponse(
    (response) =>
      response.url().includes('/layout') &&
      response.request().method() === 'POST' &&
      response.url().includes('/api/process-flows/'),
  );
  await page.getByRole('button', { name: 'Auto-layout' }).click();
  expect((await autolayoutResponse).ok()).toBeTruthy();
  await page.reload();

  await expect(page.getByText('Vendor Intake Ops')).toBeVisible();
  await expect(page.getByTestId('processflow-node-step').filter({ hasText: 'New step' }).first()).toBeVisible();
});

test('supports a full process-flow journey from creation through persistence and deletion', async ({ page }) => {
  await page.goto('/');

  await page.getByRole('button', { name: 'New Process Flow' }).click();
  await page.getByLabel('Name').fill('Order Escalation');
  await page.getByLabel('Description').fill('Escalation handling workflow');
  await page.getByRole('button', { name: 'Create' }).click();

  const flowLink = page.getByRole('link', { name: /Order Escalation/i });
  await expect(flowLink).toBeVisible();
  await flowLink.click();
  await expect(page).toHaveURL(/\/process-flows\/[0-9a-f-]+$/);

  await page.getByRole('button', { name: 'Process flow settings' }).click();
  await page.getByLabel('Name').fill('Order Escalation Ops');
  await page.getByLabel('Description').fill('Escalation handling workflow v2');
  await page.getByRole('button', { name: 'Save' }).click();
  await expect(page.getByText('Order Escalation Ops')).toBeVisible();

  await page.getByRole('button', { name: 'Process flow context' }).click();
  await page
    .getByPlaceholder(/Use this space to capture durable operational context for this process flow\./)
    .fill('Critical order escalations must reach operations within 15 minutes.');
  await page.getByRole('button', { name: 'Save' }).click();

  const firstNodeResponse = page.waitForResponse(
    (response) =>
      response.url().includes('/api/process-flows/') &&
      response.url().includes('/nodes') &&
      response.request().method() === 'POST',
  );
  await page.getByRole('button', { name: 'Step', exact: true }).click();
  const firstNode = await (await firstNodeResponse).json();

  const secondNodeResponse = page.waitForResponse(
    (response) =>
      response.url().includes('/api/process-flows/') &&
      response.url().includes('/nodes') &&
      response.request().method() === 'POST',
  );
  await page.getByRole('button', { name: 'Step', exact: true }).click();
  const secondNode = await (await secondNodeResponse).json();

  const newStepNode = page.getByTestId('processflow-node-step').filter({ hasText: 'New step' }).nth(1);
  await expect(newStepNode).toBeVisible();

  await newStepNode.click();
  await page.getByLabel('Label').fill('Resolve escalation');
  await page.getByLabel('Systems').fill('Zendesk\nSlack');
  await page.getByLabel('Frequency').fill('~20/day');
  await Promise.all([
    page.waitForResponse(
      (response) =>
        response.url().includes('/api/process-flows/') &&
        response.url().includes('/nodes') &&
        response.request().method() === 'PUT',
    ),
    page.getByRole('button', { name: 'Save Node' }).click(),
  ]);

  await connectNodes(
    page,
    page.getByTestId(`processflow-handle-source-${firstNode.id}`),
    page.getByTestId(`processflow-handle-target-${secondNode.id}`),
  );
  await page.getByRole('group', { name: `Edge from ${firstNode.id} to ${secondNode.id}` }).click({ force: true });
  await page.getByLabel('Condition').fill('high priority customer');
  await Promise.all([
    page.waitForResponse(
      (response) =>
        response.url().includes('/api/process-flows/') &&
        response.url().includes('/edges') &&
        response.request().method() === 'PUT',
    ),
    page.getByRole('button', { name: 'Save Edge' }).click(),
  ]);

  await page.getByRole('button', { name: 'Validate' }).click();
  await expect(page.getByText('Validation')).toBeVisible();

  await Promise.all([
    page.waitForResponse(
      (response) =>
        response.url().includes('/api/process-flows/') &&
        response.url().includes('/layout') &&
        response.request().method() === 'POST',
    ),
    page.getByRole('button', { name: 'Auto-layout' }).click(),
  ]);

  await page.reload();
  await expect(page.getByText('Order Escalation Ops')).toBeVisible();
  await expect(
    page.getByTestId('processflow-node-step').filter({ hasText: 'Resolve escalation' }).first(),
  ).toBeVisible();
  await page.getByTestId('processflow-node-step').filter({ hasText: 'Resolve escalation' }).first().click();
  await expect(page.getByLabel('Systems')).toHaveValue('Zendesk\nSlack');
  await expect(page.getByLabel('Frequency')).toHaveValue('~20/day');
  await page.getByRole('group', { name: `Edge from ${firstNode.id} to ${secondNode.id}` }).click({ force: true });
  await expect(page.getByLabel('Condition')).toHaveValue('high priority customer');

  await page.getByRole('button', { name: 'Process flow settings' }).click();
  await page.getByRole('tab', { name: 'Danger' }).click();
  await page.getByRole('button', { name: 'Delete process flow' }).click();
  await page.getByLabel(/Type .* to confirm/).fill('Order Escalation Ops');
  await page.getByRole('button', { name: 'Delete' }).click();
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByRole('link', { name: /Order Escalation Ops/i })).toHaveCount(0);
});

test('can edit and persist operational metadata for nodes and edges', async ({ page }) => {
  await page.goto(`/process-flows/${E2E_PROCESS_FLOW_ID}`);

  await page.getByTestId('processflow-node-step').filter({ hasText: 'Receive invoice' }).first().click();
  await page.getByLabel('Frequency').fill('~200/day');
  await page.getByLabel('Est. Duration').fill('5-10 min');
  await page.getByLabel('Time Constraint').fill('must complete within 48h');
  await Promise.all([
    page.waitForResponse(
      (response) =>
        response.url().includes(`/api/process-flows/${E2E_PROCESS_FLOW_ID}/nodes`) &&
        response.request().method() === 'PUT',
    ),
    page.getByRole('button', { name: 'Save Node' }).click(),
  ]);

  await page.reload();
  await page.getByTestId('processflow-node-step').filter({ hasText: 'Receive invoice' }).first().click();
  await expect(page.getByLabel('Frequency')).toHaveValue('~200/day');
  await expect(page.getByLabel('Est. Duration')).toHaveValue('5-10 min');
  await expect(page.getByLabel('Time Constraint')).toHaveValue('must complete within 48h');

  await page
    .getByRole('group', { name: `Edge from ${E2E_NODE_RECEIVE_ID} to ${E2E_NODE_APPROVED_ID}` })
    .click({ force: true });
  await expect(page.getByText('Edge Details')).toBeVisible();
  await page.getByLabel('Condition').fill('invoice total > $10,000');
  await Promise.all([
    page.waitForResponse(
      (response) =>
        response.url().includes(`/api/process-flows/${E2E_PROCESS_FLOW_ID}/edges`) &&
        response.request().method() === 'PUT',
    ),
    page.getByRole('button', { name: 'Save Edge' }).click(),
  ]);

  await page.reload();
  await page
    .getByRole('group', { name: `Edge from ${E2E_NODE_RECEIVE_ID} to ${E2E_NODE_APPROVED_ID}` })
    .click({ force: true });
  await expect(page.getByLabel('Condition')).toHaveValue('invoice total > $10,000');
});

test('can delete an edge and remove a newly created node', async ({ page }) => {
  await page.goto(`/process-flows/${E2E_PROCESS_FLOW_ID}`);

  await page
    .getByRole('group', { name: `Edge from ${E2E_NODE_RECEIVE_ID} to ${E2E_NODE_APPROVED_ID}` })
    .click({ force: true });
  await expect(page.getByText('Edge Details')).toBeVisible();
  await Promise.all([
    page.waitForResponse(
      (response) =>
        response.url().includes(`/api/process-flows/${E2E_PROCESS_FLOW_ID}/edges`) &&
        response.request().method() === 'PUT',
    ),
    page.getByRole('button', { name: 'Delete' }).click(),
  ]);

  await page.reload();
  await expect(
    page.getByRole('group', { name: `Edge from ${E2E_NODE_RECEIVE_ID} to ${E2E_NODE_APPROVED_ID}` }),
  ).toHaveCount(0);

  const createNodeResponse = page.waitForResponse(
    (response) =>
      response.url().includes(`/api/process-flows/${E2E_PROCESS_FLOW_ID}/nodes`) &&
      response.request().method() === 'POST',
  );
  await page.getByRole('button', { name: 'Step', exact: true }).click();
  const createdNode = await (await createNodeResponse).json();

  await expect(page.getByTestId('processflow-node-step').filter({ hasText: 'New step' }).first()).toBeVisible();
  await page.getByTestId('processflow-node-step').filter({ hasText: 'New step' }).first().click();
  await expect(page.getByText('Node Details')).toBeVisible();
  await Promise.all([
    page.waitForResponse(
      (response) =>
        response.url().includes(`/api/process-flows/${E2E_PROCESS_FLOW_ID}/nodes`) &&
        response.request().method() === 'PUT',
    ),
    page.getByRole('button', { name: 'Delete' }).click(),
  ]);

  await page.reload();
  await expect(page.getByTestId('processflow-node-step').filter({ hasText: 'New step' })).toHaveCount(0);
  expect(createdNode.id).toBeTruthy();
});

test('malformed persisted flow data does not crash the process flow page', async ({ page }) => {
  await resetE2EState('malformed');

  await page.goto(`/process-flows/${E2E_PROCESS_FLOW_ID}`);

  await expect(page.getByText('Accounts Payable')).toBeVisible();
  await expect(page.getByText('Untitled')).toBeVisible();
});
