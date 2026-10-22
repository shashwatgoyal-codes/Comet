import { expect, test } from "@playwright/test";

/** Promo codes on "4 · Choose ride" (docs/UX_FLOWS.md Flow 4, step 4). */

test("apply a promo on choose ride and book at the lower price", async ({ browser }) => {
  // Far from other tests' Pilots (Chikkajala), so the simulated Pilot takes it.
  const context = await browser.newContext({
    geolocation: { latitude: 13.16, longitude: 77.62 },
    permissions: ["geolocation"],
  });
  const page = await context.newPage();
  await page.goto("/demo?role=rider");
  await page.getByRole("button", { name: "Start riding" }).click();
  await page.getByRole("link", { name: "Where to?" }).click();
  await page.getByLabel("Destination").fill("mg road");
  await page.getByRole("button", { name: /MG Road/ }).click();

  const goPrice = page.getByTestId("price-go");
  const full = Number((await goPrice.textContent())!.replace(/[^\d]/g, ""));

  await page.getByRole("button", { name: "Offers & promo codes" }).click();
  const sheet = page.getByRole("dialog", { name: "Offers & promo codes" });
  // A typo, then a code for another tier: both explained.
  await sheet.getByLabel("Have a code?").fill("NOSUCH");
  await sheet.getByRole("button", { name: "Apply", exact: true }).click();
  await expect(sheet.getByRole("alert")).toHaveText(/isn't valid/);
  await expect(sheet.getByText("PRIME20 only works on Comet Prime rides.")).toBeVisible();

  await sheet.getByRole("button", { name: "Apply COMET30" }).click();
  await expect(sheet.getByText("COMET30 applied · you save ₹30")).toBeVisible();
  await expect(sheet.getByTestId("promo-you-pay")).toHaveText(
    `₹${(full - 30).toLocaleString("en-IN")}`,
  );
  await sheet.getByRole("button", { name: "Done" }).click();

  await expect(goPrice).toHaveText(`₹${(full - 30).toLocaleString("en-IN")}`);
  await expect(page.getByRole("button", { name: /COMET30 · ₹30 off/ })).toBeVisible();
  await page.getByRole("button", { name: "Book Comet Go" }).click();
  await expect(page).toHaveURL(/\/ride\/trip$/);
  await expect(page.getByText(`₹${(full - 30).toLocaleString("en-IN")}`).first()).toBeVisible();
  await context.close();
});
