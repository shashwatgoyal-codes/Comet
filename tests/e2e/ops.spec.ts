import { expect, test } from "@playwright/test";

import { opsEmail, signInByEmail } from "./mail";

/**
 * The ops dashboard (docs/UX_FLOWS.md Flow 13): an SOS appears for ops,
 * who take it and resolve it while the rider watches, and a promo code
 * created in ops reaches riders.
 */

// Away from every other test's Pilots, so only the simulated Pilot takes the ride.
const SPOTS = {
  mobile: { latitude: 13.08, longitude: 77.42 },
  desktop: { latitude: 12.79, longitude: 77.42 },
};

test("ops take an SOS and resolve it; the rider sees it happen", async ({ browser, request }) => {
  test.setTimeout(120_000);
  const project = test.info().project.name as keyof typeof SPOTS;
  const rider = await (
    await browser.newContext({ geolocation: SPOTS[project], permissions: ["geolocation"] })
  ).newPage();
  await rider.goto("/demo?role=rider");
  await rider.getByRole("button", { name: "Start riding" }).click();
  await expect(rider).toHaveURL(/\/ride$/);
  // Every demo rider is "Aarav"; the Comet ID tells this one apart for ops.
  await rider.goto("/ride/account");
  const cometId = (await rider.getByTestId("comet-id").textContent())!.trim();
  await rider.goto("/ride");
  await rider.getByRole("link", { name: "Where to?" }).click();
  await rider.getByLabel("Destination").fill("mg road");
  await rider.getByRole("button", { name: /MG Road/ }).click();
  await rider.getByRole("button", { name: "Book Comet Go" }).click();
  await expect(rider.getByRole("heading", { name: "Your Pilot is on the way" })).toBeVisible({
    timeout: 20_000,
  });
  await rider.getByRole("button", { name: "SOS" }).click();
  await rider.getByRole("button", { name: "Send SOS alert now" }).click();
  await expect(rider.getByText("Comet safety team alerted")).toBeVisible();

  const ops = await (await browser.newContext()).newPage();
  await signInByEmail(ops, request, opsEmail("sos"), "/ops", /\/ops$/);
  const mine = ops.getByRole("alert", { name: `SOS from Aarav (${cometId})` });
  await expect(mine).toContainText("SOS active");
  await mine.getByRole("button", { name: "Assign to me" }).click();
  await expect(mine).toContainText("SOS · in hand");
  await expect(rider.getByText("A safety agent has your alert")).toBeVisible({ timeout: 15_000 });

  await mine.getByRole("button", { name: "Resolve" }).click();
  await mine
    .getByLabel("What happened, and how was it resolved?")
    .fill("Called the rider: wrong tap, all fine.");
  await mine.getByRole("button", { name: "Mark resolved" }).click();
  await expect(mine).toHaveCount(0);
  await expect(rider.getByText("Closed by Comet's safety team")).toBeVisible({ timeout: 15_000 });
});

test("a promo code created in ops reaches riders, until it's switched off", async ({
  browser,
  request,
}) => {
  test.setTimeout(120_000);
  const code = `E2E${test.info().project.name[0]!.toUpperCase()}${Date.now().toString(36).toUpperCase()}`;
  const ops = await (await browser.newContext()).newPage();
  await signInByEmail(ops, request, opsEmail("promo"), "/ops", /\/ops$/);
  await ops.getByRole("button", { name: "New code" }).click();
  const dialog = ops.getByRole("dialog", { name: "New promo code" });
  await dialog.getByLabel("Code").fill(code);
  await dialog.getByRole("radio", { name: "% off" }).click();
  await dialog.getByLabel("Percent").fill("150");
  await dialog.getByLabel("What riders see").fill("15% off, for testing");
  await dialog.getByRole("button", { name: "Create code" }).click();
  await expect(dialog.getByRole("alert")).toHaveText("A percentage can be at most 100.");
  await dialog.getByLabel("Percent").fill("15");
  await dialog.getByLabel("Cap (₹, optional)").fill("50");
  await dialog.getByRole("button", { name: "Create code" }).click();
  await expect(dialog).toBeHidden();
  const row = ops.getByRole("listitem", { name: `Promo ${code}` });
  await expect(row).toContainText("Live");
  await expect(row).toContainText("Up to ₹50");

  const rider = await (await browser.newContext()).newPage();
  await rider.goto("/demo?role=rider");
  await rider.getByRole("button", { name: "Start riding" }).click();
  await rider.getByRole("link", { name: "Where to?" }).click();
  await rider.getByLabel("Destination").fill("mg road");
  await rider.getByRole("button", { name: /MG Road/ }).click();
  await rider.getByRole("button", { name: "Offers & promo codes" }).click();
  const sheet = rider.getByRole("dialog", { name: "Offers & promo codes" });
  await expect(sheet.getByText(code)).toBeVisible();

  await row.getByRole("button", { name: `Switch off ${code}` }).click();
  await expect(row).toContainText("Off");
  await rider.reload();
  await rider.getByRole("button", { name: "Offers & promo codes" }).click();
  await expect(sheet.getByText("COMET30")).toBeVisible();
  await expect(sheet.getByText(code)).toHaveCount(0);
});
