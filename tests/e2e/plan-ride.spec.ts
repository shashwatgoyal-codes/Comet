import { expect, test } from "@playwright/test";

/**
 * Phase 3 critical flow: plan a trip and see locked prices.
 *
 * Runs with COMET_FAKE_EXTERNALS=1 (deterministic routes and a small
 * Bengaluru gazetteer) and without a Mapbox token, so the drawn map is
 * used and the route line is inspectable.
 */

test.use({
  geolocation: { latitude: 12.9116, longitude: 77.6474 }, // HSR Layout
  permissions: ["geolocation"],
});

test("rider plans a trip from current location and sees four prices", async ({ page }) => {
  await page.goto("/demo?role=rider");
  await page.getByRole("button", { name: "Start riding" }).click();
  await expect(page).toHaveURL(/\/ride$/);
  await expect(page.getByRole("heading", { name: /, Aarav$/ })).toBeVisible();

  await page.getByRole("link", { name: "Where to?" }).click();
  await expect(page).toHaveURL(/\/ride\/plan$/);
  // The pickup field starts from your location; you can type over it.
  await expect(page.getByLabel("Pickup")).toHaveAttribute("placeholder", "Current location");

  await page.getByLabel("Destination").fill("air");
  await expect(page.getByText("Type at least 3 letters to search.")).not.toBeVisible();
  await page.getByLabel("Destination").fill("airport");
  await page.getByRole("button", { name: /Terminal 1/ }).click();

  await expect(page).toHaveURL(/\/ride\/choose\?/);
  await expect(page.getByRole("heading", { name: "Choose a ride" })).toBeVisible();
  await expect(page.getByTestId("route-line")).toBeAttached();

  const prices: Record<string, number> = {};
  for (const tier of ["bike", "auto", "go", "prime"]) {
    const text = (await page.getByTestId(`price-${tier}`).textContent()) ?? "";
    expect(text).toMatch(/^₹[\d,]+$/);
    prices[tier] = Number(text.replace(/[₹,]/g, ""));
  }
  expect(prices.bike).toBeLessThan(prices.auto!);
  expect(prices.go).toBeLessThan(prices.prime!);

  // Comet Go is preselected; picking Prime updates the Book button.
  await expect(page.getByRole("radio", { name: /Comet Go/ })).toHaveAttribute(
    "aria-checked",
    "true",
  );
  await page.getByRole("radio", { name: /Comet Prime/ }).click();
  await expect(page.getByRole("button", { name: "Book Comet Prime" })).toBeVisible();
});

test("search with no matches says so", async ({ page }) => {
  await page.goto("/demo?role=rider");
  await page.getByRole("button", { name: "Start riding" }).click();
  await expect(page).toHaveURL(/\/ride$/);
  await page.goto("/ride/plan");
  await page.getByLabel("Destination").fill("zzzzzz");
  await expect(page.getByText(/No places found/)).toBeVisible();
});

test("a tampered trip link shows a friendly error, not a crash", async ({ page }) => {
  await page.goto("/demo?role=rider");
  await page.getByRole("button", { name: "Start riding" }).click();
  await expect(page).toHaveURL(/\/ride$/);
  await page.goto("/ride/choose?plat=51.5&plng=-0.12&paddr=London&dlat=12.97&dlng=77.64&daddr=X");
  await expect(page.getByRole("heading", { name: /couldn.t price this trip/ })).toBeVisible();
  await expect(page.getByRole("link", { name: "Change destination" })).toBeVisible();
});
