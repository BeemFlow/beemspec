import { type APIRequestContext, expect, type Locator, type Page } from '@playwright/test';
import {
  E2E_INVITEE_EMAIL,
  E2E_NODE_APPROVED_ID,
  E2E_NODE_RECEIVE_ID,
  E2E_OWNER_EMAIL,
  E2E_OWNER_PASSWORD,
  E2E_PROCESS_FLOW_ID,
  E2E_SECOND_TEAM_ID,
  E2E_STORY_MAP_ID,
  E2E_TEAM_ID,
  MAILPIT_BASE_URL,
  resetLocalAppState,
} from './local-fixtures';

export {
  E2E_INVITEE_EMAIL,
  E2E_NODE_APPROVED_ID,
  E2E_NODE_RECEIVE_ID,
  E2E_PROCESS_FLOW_ID,
  E2E_SECOND_TEAM_ID,
  E2E_STORY_MAP_ID,
};

export async function resetE2EState(scenario: 'default' | 'malformed' = 'default') {
  await resetLocalAppState(scenario);
}

export async function loginAsOwner(page: Page) {
  await page.goto('/auth/logout');
  await page.evaluate(() => {
    window.localStorage.clear();
    window.sessionStorage.clear();
  });
  await page.goto('/auth/login');
  await page.getByLabel('Email').fill(E2E_OWNER_EMAIL);
  await page.getByLabel('Password').fill(E2E_OWNER_PASSWORD);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await page.waitForURL(/\/$/);
  await page.context().addCookies([
    {
      name: 'beemspec_current_team_id',
      value: E2E_TEAM_ID,
      url: page.url(),
    },
  ]);
  await page.goto('/');
  await expect(page.getByRole('button', { name: /E2E Team/i })).toBeVisible();
}

export async function connectNodes(page: Page, sourceHandle: Locator, targetHandle: Locator) {
  const sourceBox = await sourceHandle.boundingBox();
  const targetBox = await targetHandle.boundingBox();

  if (!sourceBox || !targetBox) {
    throw new Error('Unable to connect process flow nodes because a handle is missing');
  }

  await sourceHandle.hover({ force: true });
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

function extractFirstUrl(value: string) {
  const inviteMatch = value.match(/https?:\/\/[^\s"'<>]*\/auth\/v1\/verify\?[^\s"'<>]+/i);
  if (inviteMatch) return inviteMatch[0].replace(/&amp;/g, '&');

  const match = value.match(/https?:\/\/[^\s"'<>]+/i);
  return match?.[0] ?? null;
}

export async function waitForInviteLink(request: APIRequestContext, email: string) {
  const normalizedEmail = email.toLowerCase();

  for (let attempt = 0; attempt < 20; attempt += 1) {
    const messagesResponse = await request.get(`${MAILPIT_BASE_URL}/api/v1/messages`);
    expect(messagesResponse.ok()).toBeTruthy();
    const messages = (await messagesResponse.json()) as {
      messages?: Array<{ ID?: string; To?: Array<{ Address?: string }> }>;
    };

    const message = messages.messages?.find((entry) =>
      entry.To?.some((recipient) => recipient.Address?.toLowerCase() === normalizedEmail),
    );

    if (message?.ID) {
      const detailResponse = await request.get(`${MAILPIT_BASE_URL}/api/v1/message/${message.ID}`);
      expect(detailResponse.ok()).toBeTruthy();
      const detail = (await detailResponse.json()) as {
        HTML?: string;
        Text?: string;
        Html?: string;
        TextBody?: string;
        HTMLBody?: string;
      };
      const body = [detail.Text, detail.TextBody, detail.HTML, detail.Html, detail.HTMLBody].find(Boolean) ?? '';
      const url = extractFirstUrl(body);
      if (url) return url;
    }

    await pageWait(500);
  }

  throw new Error(`Invite email for ${email} did not arrive in Mailpit`);
}

function pageWait(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
