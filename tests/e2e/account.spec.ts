import { expect, test } from "@playwright/test";

/**
 * Phase 9a: saved places, emergency contacts, help, settings and deleting
 * an account. Spot far from other tests' Pilots (Nelamangala road).
 */

const SPOT = { latitude: 13.1, longitude: 77.39 };

const goToAccount = (page: import("@playwright/test").Page) =>
  page.getByRole("link", { name: "Account" }).filter({ visible: true }).first().click();

test("saved places, contacts, help and deleting the account", async ({ browser }) => {
  test.setTimeout(60_000);
  const context = await browser.newContext({ geolocation: SPOT, permissions: ["geolocation"] });
  const page = await context.newPage();
  await page.goto("/demo?role=rider");
  await page.getByRole("button", { name: "Start riding" }).click();
  await expect(page).toHaveURL(/\/ride$/);

  // Saved places: the demo's Home and Work, plus one we add and remove.
  await goToAccount(page);
  await page.getByRole("link", { name: /Saved places/ }).click();
  const places = page.getByRole("list", { name: "Your places" });
  await expect(places).toContainText("Home");
  await expect(places).toContainText("Work");
  await page.getByRole("textbox", { name: "Name" }).fill("Gym");
  await page.getByRole("textbox", { name: "Address" }).fill("mg road");
  await page.getByRole("list", { name: "Address suggestions" }).getByRole("button").first().click();
  await page.getByRole("button", { name: "Save place" }).click();
  await expect(page.getByText("Place saved.")).toBeVisible();
  await expect(places).toContainText("Gym");
  await page.getByRole("button", { name: "Delete Gym" }).click();
  await expect(places).not.toContainText("Gym");

  // Planning from a saved place goes straight to prices.
  await page.goto("/ride/plan");
  await page.getByRole("button", { name: /^Work/ }).click();
  await expect(page).toHaveURL(/\/ride\/choose\?/);
  await expect(page.getByRole("heading", { name: "Choose a ride" })).toBeVisible();

  // Emergency contacts: masked, and never contacted.
  await page.goto("/ride/account/settings");
  await page.getByRole("button", { name: "+ Add contact" }).click();
  await page.getByLabel("Name", { exact: true }).fill("Mom");
  await page.getByLabel("Mobile number").fill("98765 43210");
  await page.getByRole("button", { name: "Save contact" }).click();
  const contacts = page.getByRole("list", { name: "Emergency contacts" });
  await expect(contacts).toContainText("+91 98••• ••210");
  await expect(contacts).not.toContainText("9876543210");
  await expect(page.getByText(/it never calls or messages these contacts/)).toBeVisible();
  await expect(page.locator('a[href^="tel:"]')).toHaveCount(0);

  // Help search.
  await page.goto("/ride/account/help");
  await page.getByPlaceholder("Search refunds, fees, safety…").fill("sos");
  await expect(page.getByText(/it never calls 112/)).toBeVisible();

  // Delete the account.
  await page.goto("/ride/account/settings");
  await page.getByRole("button", { name: "Delete my account" }).click();
  await page.getByLabel("Type DELETE to confirm").fill("DELETE");
  await page.getByRole("button", { name: "Delete account" }).click();
  await expect(page).toHaveURL(/\/\?deleted=1$/);
  await page.goto("/ride");
  await expect(page).toHaveURL(/\/login/);
  await context.close();
});

test("first launch explains location before the browser asks", async ({ browser }) => {
  // The suite grants location to every browser it starts, so this test
  // makes the page see what a first visit sees: location not asked yet.
  const context = await browser.newContext();
  await context.addInitScript(() => {
    const query = navigator.permissions.query.bind(navigator.permissions);
    navigator.permissions.query = (desc: PermissionDescriptor) =>
      desc.name === "geolocation"
        ? Promise.resolve({ state: "prompt" } as PermissionStatus)
        : query(desc);
  });
  const page = await context.newPage();
  await page.goto("/demo?role=rider");
  await page.getByRole("button", { name: "Start riding" }).click();
  const intro = page.getByRole("dialog", { name: "Find you faster" });
  await expect(intro).toBeVisible();
  await intro.getByRole("link", { name: "Enter pickup manually" }).click();
  await expect(page).toHaveURL(/\/ride\/plan$/);
  // Shown once: back home, it doesn't come back.
  await page.goto("/ride");
  await expect(page.getByRole("link", { name: "Where to?" })).toBeVisible();
  await expect(intro).toHaveCount(0);
  await context.close();
});
