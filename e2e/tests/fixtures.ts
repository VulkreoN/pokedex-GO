import { test as base, expect, type APIRequestContext, type Page } from '@playwright/test';

let seq = 0;
const run = Date.now().toString(36).slice(-4);
export const uniq = (p: string) => `${p}_${run}${process.pid % 100}${seq++}`;
export const PASSWORD = 'correct-horse-42';

/**
 * Every test gets its own client IP (the API rate-limits per x-forwarded-for, and the preview proxy forwards headers),
 * and fails on any uncaught page error or API 5xx.
 */
export const test = base.extend<{ guard: void }>({
  extraHTTPHeaders: async ({}, use) => {
    await use({ 'x-forwarded-for': `10.9.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}` });
  },
  guard: [
    async ({ page }, use) => {
      const problems: string[] = [];
      page.on('pageerror', (e) => problems.push(`page error: ${e.message}`));
      page.on('response', (r) => {
        if (r.url().includes('/api/') && r.status() >= 500) problems.push(`API ${r.status()} on ${r.url()}`);
      });
      page.on('dialog', (d) => void d.accept());
      await use();
      expect(problems, problems.join('\n')).toEqual([]);
    },
    { auto: true },
  ],
});
export { expect };

/** Creates an account through the API; the session cookie lands in the page's context. */
export async function apiRegister(request: APIRequestContext, username = uniq('u'), password = PASSWORD) {
  const r = await request.post('/api/auth/register', { data: { username, password } });
  expect(r.status(), await r.text()).toBe(201);
  return (await r.json()).user as { id: string; username: string; friendCode: string; role: string };
}

export async function apiCreateList(request: APIRequestContext, name: string, keys: string[]) {
  const r = await request.post('/api/lists', { data: { name } });
  expect(r.status()).toBe(201);
  const id = (await r.json()).list.id as string;
  const e = await request.put(`/api/lists/${id}/entries`, { data: { entries: keys.map((k) => ({ variantKey: k, shiny: false })) } });
  expect(e.status()).toBe(200);
  return id;
}

export async function uiLogin(page: Page, username: string, password = PASSWORD) {
  await page.goto('/login');
  await page.getByLabel('Pseudo').fill(username);
  await page.getByLabel('Mot de passe', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Se connecter', exact: true }).click();
  await expect(page).toHaveURL(/\/dex$/);
}

export async function clipboard(page: Page): Promise<string> {
  return page.evaluate(() => navigator.clipboard.readText());
}

/** Logs this context in as the test admin (ADMIN_USERNAMES=e2eadmin on the test API), creating it if needed. */
export async function adminLogin(request: APIRequestContext) {
  for (let i = 0; i < 3; i++) {
    const reg = await request.post('/api/auth/register', { data: { username: 'e2eadmin', password: PASSWORD } });
    if (reg.status() === 201) return;
    const login = await request.post('/api/auth/login', { data: { username: 'e2eadmin', password: PASSWORD } });
    if (login.status() === 200) return;
  }
  throw new Error('could not log in as e2eadmin');
}
