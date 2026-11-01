import { expect, test, type Browser } from "@playwright/test";

/**
 * Queued next trip (docs/PRD.md F12, "5b · Request while driving"): a
 * Pilot near the end of a short trip queues a rider waiting close to the
 * drop-off, and heads there after the drop. Three browsers, at the airport,
 * away from every other test's Pilots. Desktop only, so the two projects
 * can't pick up each other's riders.
 */

const NEAR_T1 = { latitude: 13.195, longitude: 77.7068 };
const AT_T2 = { latitude: 13.2006, longitude: 77.7137 };

async function at(browser: Browser, spot: { latitude: number; longitude: number }) {
  const context = await browser.newContext({ geolocation: spot, permissions: ["geolocation"] });
  return context.newPage();
}

async function bookWithoutBot(
  page: import("@playwright/test").Page,
  destination: string,
  match: RegExp,
) {
  await page.goto("/demo?role=rider");
  await page.getByText("Simulated Pilot", { exact: true }).click();
  await page.getByRole("button", { name: "Start riding" }).click();
  await page.getByRole("link", { name: "Where to?" }).click();
  await page.getByLabel("Destination").fill(destination);
  await page.getByRole("button", { name: match }).click();
  await page.getByRole("button", { name: "Book Comet Go" }).click();
}

test("a Pilot queues their next trip near the drop, then heads there", async ({
  browser,
}, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "Desktop only: one Pilot at the airport.");
  test.setTimeout(120_000);

  const pilot = await at(browser, NEAR_T1);
  await pilot.goto("/demo?role=pilot");
  await pilot.getByRole("button", { name: "Start driving" }).click();
  await pilot.getByRole("button", { name: "Go online" }).click();
  await expect(pilot.getByRole("button", { name: "You're online" })).toBeVisible();

  // A short trip: Terminal 1 to Terminal 2, under 5 minutes.
  const first = await at(browser, NEAR_T1);
  await bookWithoutBot(first, "terminal 2", /Terminal 2/);
  await pilot
    .getByRole("article", { name: /Ride request/ })
    .getByRole("button", { name: "Accept" })
    .click();
  await pilot.getByRole("button", { name: "I've arrived" }).click();
  const code = (await first.getByTestId("ride-code").textContent())!.trim();
  await pilot.getByLabel("Ask the rider for their 4-digit code").pressSequentially(code);
  await pilot.getByRole("button", { name: "Start trip" }).click();
  await expect(pilot.getByRole("heading", { name: "On trip" })).toBeVisible();
  await expect(pilot.getByRole("switch", { name: /Get requests during trips/ })).toBeChecked();

  // Someone waiting at Terminal 2, where this trip ends.
  const second = await at(browser, AT_T2);
  await bookWithoutBot(second, "terminal 1", /Terminal 1/);

  const card = pilot.getByRole("region", { name: /Next trip request/ });
  await expect(card).toContainText("Starts after you drop Aarav");
  await expect(card).toContainText("your drop");
  await card.getByRole("button", { name: "Queue next trip" }).click();
  await expect(pilot.getByRole("region", { name: "Next trip queued" })).toBeVisible();
  await expect(
    second.getByRole("heading", { name: "Your Pilot is finishing a nearby trip" }),
  ).toBeVisible({
    timeout: 15_000,
  });
  await expect(second.getByTestId("trip-subtitle")).toContainText("Cancelling is free until then");

  await pilot.getByRole("button", { name: "End trip" }).click();
  const cash = pilot.getByRole("button", { name: "Cash received" });
  if (await cash.isVisible().catch(() => false)) await cash.click();
  await pilot.getByRole("button", { name: "Head to next pickup" }).click();
  await expect(pilot.getByRole("heading", { name: "Head to pickup" })).toBeVisible();
  await expect(second.getByRole("heading", { name: "Your Pilot is on the way" })).toBeVisible({
    timeout: 15_000,
  });
});

test("several requests: the nearest pickup is the best match, and Skip all clears them", async ({
  browser,
}, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "Desktop only: one Pilot at the airport.");
  test.setTimeout(120_000);
  // South of Anekal, away from the airport test running alongside.
  const pilot = await at(browser, { latitude: 12.62, longitude: 77.8 });
  await pilot.goto("/demo?role=pilot");
  await pilot.getByRole("button", { name: "Start driving" }).click();
  await pilot.getByRole("button", { name: "Go online" }).click();
  await expect(pilot.getByRole("button", { name: "You're online" })).toBeVisible();

  const near = await at(browser, { latitude: 12.621, longitude: 77.8 });
  await bookWithoutBot(near, "hsr", /HSR Layout/);
  const further = await at(browser, { latitude: 12.615, longitude: 77.8 });
  await bookWithoutBot(further, "hsr", /HSR Layout/);

  await expect(pilot.getByText("2 ride requests")).toBeVisible();
  await expect(pilot.getByText("Pick one — the others go to nearby Pilots")).toBeVisible();
  const best = pilot.getByRole("article").filter({ hasText: "Best match" });
  await expect(best).toHaveCount(1);
  await expect(best).toContainText("Pickup 0.1 km");
  await expect(best).toContainText("/km");
  await pilot.getByRole("button", { name: "Skip all" }).click();
  await expect(pilot.getByRole("article", { name: /Ride request/ })).toHaveCount(0);
});
