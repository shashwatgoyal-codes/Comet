import { expect, test, type Browser } from "@playwright/test";

/**
 * Rider–Pilot chat (docs/PRD.md F8), two browsers. Spots far from other
 * tests' Pilots (Doddaballapur road, Anekal).
 */

const SPOTS = {
  mobile: { latitude: 13.22, longitude: 77.55 },
  desktop: { latitude: 12.71, longitude: 77.69 },
} as const;

async function at(browser: Browser, spot: { latitude: number; longitude: number }) {
  const context = await browser.newContext({ geolocation: spot, permissions: ["geolocation"] });
  return { context, page: await context.newPage() };
}

test("rider and Pilot chat during a ride", async ({ browser }, testInfo) => {
  test.setTimeout(90_000);
  const spot = SPOTS[testInfo.project.name as keyof typeof SPOTS];
  const pilot = await at(browser, spot);
  const rider = await at(browser, spot);

  await pilot.page.goto("/demo?role=pilot");
  await pilot.page.getByRole("button", { name: "Start driving" }).click();
  await pilot.page.getByRole("button", { name: "Go online" }).click();
  await expect(pilot.page.getByRole("button", { name: "You're online" })).toBeVisible();

  await rider.page.goto("/demo?role=rider");
  await rider.page.getByText("Simulated Pilot", { exact: true }).click();
  await rider.page.getByRole("button", { name: "Start riding" }).click();
  await rider.page.getByRole("link", { name: "Where to?" }).click();
  await rider.page.getByLabel("Destination").fill("mg road");
  await rider.page.getByRole("button", { name: /MG Road/ }).click();
  await rider.page.getByRole("button", { name: "Book Comet Go" }).click();

  await pilot.page
    .getByRole("article", { name: /Ride request/ })
    .getByRole("button", { name: "Accept" })
    .click();
  await expect(pilot.page.getByRole("heading", { name: "Head to pickup" })).toBeVisible();

  // The rider writes.
  await rider.page.getByRole("button", { name: /^Chat/ }).click();
  const riderChat = rider.page.getByRole("dialog", { name: /your Pilot/ });
  await riderChat.getByRole("textbox", { name: "Message" }).fill("I'm at the blue gate");
  await riderChat.getByRole("button", { name: "Send" }).click();
  await expect(riderChat.getByRole("list", { name: "Messages" })).toContainText(
    "I'm at the blue gate",
  );

  // The Pilot sees an unread badge, and can only tap replies while driving.
  await expect(pilot.page.getByRole("button", { name: "Chat, 1 unread" })).toBeVisible();
  await pilot.page.getByRole("button", { name: /^Chat/ }).click();
  const pilotChat = pilot.page.getByRole("dialog", { name: /rider/ });
  await expect(pilotChat.getByRole("list", { name: "Messages" })).toContainText(
    "I'm at the blue gate",
  );
  await expect(pilotChat.getByRole("textbox", { name: "Message" })).toHaveCount(0);
  await pilotChat.getByRole("button", { name: "On my way" }).click();

  await expect(riderChat.getByRole("list", { name: "Messages" })).toContainText("On my way");
  await expect(riderChat.getByText(/· Seen$/)).toBeVisible();
  // No phone numbers or call links anywhere.
  await expect(rider.page.locator('a[href^="tel:"]')).toHaveCount(0);

  await pilot.context.close();
  await rider.context.close();
});
