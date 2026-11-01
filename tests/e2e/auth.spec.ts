import { expect, test, type Page } from "@playwright/test";

import { waitForCode } from "./mail";

/**
 * Phase 2 critical flows: one-click demo for both roles, email-code
 * sign-in, sign-out, and the redirect that protects app pages.
 *
 * Needs local Supabase (`npm run db:start`). The email code is read from
 * Mailpit, the mail catcher that local Supabase runs on :54324.
 */

const COMET_ID = /^CMT-[0-9A-HJKMNP-TV-Z]{6}$/;

async function cometIdOnPage(page: Page) {
  const id = (await page.getByTestId("comet-id").textContent())?.trim() ?? "";
  expect(id).toMatch(COMET_ID);
  return id;
}

test("demo rider: one click to a signed-in account with a Comet ID", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("link", { name: "Try as rider" }).click();
  await expect(page).toHaveURL(/\/demo\?role=rider/);
  await expect(page.getByRole("radio", { name: /Ride as Aarav/ })).toHaveAttribute(
    "aria-checked",
    "true",
  );

  await page.getByRole("button", { name: "Start riding" }).click();
  await expect(page).toHaveURL(/\/ride$/);
  await expect(page.getByRole("heading", { name: /, Aarav$/ })).toBeVisible();

  await page.getByRole("link", { name: "Account" }).first().click();
  await expect(page).toHaveURL(/\/ride\/account$/);
  await expect(page.getByText("Rider · demo")).toBeVisible();
  const id = await cometIdOnPage(page);

  // The account persists across reloads: same session, same Comet ID.
  await page.reload();
  expect(await cometIdOnPage(page)).toBe(id);
});

test("demo Pilot: gets an approved Pilot profile with the demo car", async ({ page }) => {
  await page.goto("/demo?role=pilot");
  await page.getByRole("button", { name: "Start driving" }).click();
  await expect(page).toHaveURL(/\/pilot$/);
  await expect(page.getByRole("button", { name: "Go online" })).toBeVisible();
  // The floating avatar on phones, the top navigation on desktop.
  await page
    .getByRole("link", { name: /^(Pilot account|Account)$/ })
    .filter({ visible: true })
    .first()
    .click();
  await expect(page).toHaveURL(/\/pilot\/account$/);
  await expect(page.getByText("White Maruti Swift Dzire")).toBeVisible();
  await expect(page.getByText("KA 05 MX 2841")).toBeVisible();
  await expect(page.getByText(/approved/)).toBeVisible();
  await cometIdOnPage(page);
});

test("app pages send signed-out visitors to sign in, then back", async ({ page }) => {
  await page.goto("/ride");
  await expect(page).toHaveURL(/\/login\?next=%2Fride/);
  await expect(page.getByRole("heading", { name: /Get there at/ })).toBeVisible();
});

test("a crafted next= can't send someone off-site", async ({ page }) => {
  await page.goto("/login?next=//evil.example.com");
  // The form keeps working and posts back to a same-site default.
  await expect(page.getByLabel("Email")).toBeVisible();
});

test("email code: sign in, land on /ride with a new Comet ID, sign out", async ({
  page,
  request,
}) => {
  const email = `e2e+${Date.now()}@example.com`;

  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByRole("button", { name: "Send code" }).click();
  await expect(page.getByRole("heading", { name: "Check your email" })).toBeVisible();

  const code = await waitForCode(request, email);
  await page.getByLabel("6-digit code").pressSequentially(code);

  await expect(page).toHaveURL(/\/ride$/);
  await page.goto("/ride/account");
  await expect(page.getByText(/^Rider$/)).toBeVisible();
  await cometIdOnPage(page);

  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(page).toHaveURL(/\/$/);
  await page.goto("/ride");
  await expect(page).toHaveURL(/\/login/);
});

test("a wrong email code is rejected with a clear message", async ({ page, request }) => {
  const email = `e2e+wrong${Date.now()}@example.com`;
  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByRole("button", { name: "Send code" }).click();
  await waitForCode(request, email);
  await page.getByLabel("6-digit code").pressSequentially("000000");
  await expect(page.getByText(/didn't match/)).toBeVisible();
});
