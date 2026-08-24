import { expect, test } from '@playwright/test';
import { E2E_STORY_MAP_ID, loginAsOwner, resetE2EState } from './helpers';

test.beforeEach(async ({ page }) => {
  await resetE2EState();
  await loginAsOwner(page);
});

test('switches team context from nested pages and on the dashboard', async ({ page }) => {
  await page.goto(`/story-map/${E2E_STORY_MAP_ID}`);
  await expect(page.getByRole('heading', { name: 'Platform Core' })).toBeVisible();

  await page.getByRole('button', { name: /E2E Team/i }).click();
  await page.getByRole('menuitem', { name: /E2E Secondary Team/i }).click();

  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByRole('button', { name: /E2E Secondary Team/i })).toBeVisible();
  await expect(page.getByRole('link', { name: /Secondary Roadmap/i })).toBeVisible();
  await expect(page.getByRole('link', { name: /Platform Core/i })).toHaveCount(0);

  await page.getByRole('button', { name: /E2E Secondary Team/i }).click();
  await page.getByRole('menuitem', { name: /^E2E Team/ }).click();

  await expect(page.getByRole('button', { name: /^E2E Team/ })).toBeVisible();
  await expect(page.getByRole('link', { name: /Platform Core/i })).toBeVisible();
  await expect(page.getByRole('link', { name: /Secondary Roadmap/i })).toHaveCount(0);
});
