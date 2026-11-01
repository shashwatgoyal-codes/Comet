import type { APIRequestContext, Page } from "@playwright/test";
import { expect } from "@playwright/test";

/**
 * Email sign-in for e2e tests. The code is read from Mailpit, the mail
 * catcher that local Supabase runs on :54324.
 */

const MAILPIT = process.env.MAILPIT_URL ?? "http://127.0.0.1:54324";

export async function waitForCode(request: APIRequestContext, email: string) {
  for (let attempt = 0; attempt < 20; attempt++) {
    const res = await request.get(
      `${MAILPIT}/api/v1/search?query=${encodeURIComponent(`to:"${email}"`)}`,
    );
    const body = (await res.json()) as { messages?: { ID: string }[] };
    const id = body.messages?.[0]?.ID;
    if (id) {
      const msg = (await (await request.get(`${MAILPIT}/api/v1/message/${id}`)).json()) as {
        Text?: string;
        HTML?: string;
      };
      const match = `${msg.Text ?? ""} ${msg.HTML ?? ""}`.match(/\b(\d{6})\b/);
      if (match) return match[1]!;
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`No sign-in code arrived for ${email}`);
}

/** Signs in on /login and waits to land on `lands`. */
export async function signInByEmail(
  page: Page,
  request: APIRequestContext,
  email: string,
  next: string,
  lands: RegExp,
) {
  await page.goto(`/login?next=${encodeURIComponent(next)}`);
  await page.getByLabel("Email").fill(email);
  await page.getByRole("button", { name: "Send code" }).click();
  await expect(page.getByRole("heading", { name: "Check your email" })).toBeVisible();
  await page.getByLabel("6-digit code").pressSequentially(await waitForCode(request, email));
  await expect(page).toHaveURL(lands);
}
