import { expect, test } from "@playwright/test";

/** "13 · Schedule a ride": book ahead, see it upcoming, cancel free. */

test("book a ride for tomorrow, see it upcoming, and cancel it free", async ({ page }) => {
  await page.goto("/demo?role=rider");
  await page.getByRole("button", { name: "Start riding" }).click();
  await page.getByRole("link", { name: "Where to?" }).click();
  await page.getByLabel("Destination").fill("airport");
  await page.getByRole("button", { name: /Terminal 1/ }).click();

  await page.getByRole("button", { name: "Schedule for later" }).click();
  const picker = page.getByRole("dialog", { name: "Schedule a ride" });
  await picker.getByRole("radiogroup", { name: "Day" }).getByRole("radio").nth(1).click();
  await picker.getByRole("radio", { name: "5:15 am" }).click();
  await picker.getByRole("button", { name: "Set pickup time" }).click();

  const book = page.getByRole("button", { name: /^Schedule Comet Go/ });
  await expect(book).toContainText("5:15 am");
  await book.click();

  await expect(page).toHaveURL(/\/ride\/activity\?tab=upcoming$/);
  const row = page.getByRole("list", { name: "Rides" }).getByRole("link").first();
  await expect(row).toContainText("Booked ahead · Pilot assigned 15 min before");

  // Home shows it too.
  await page.goto("/ride");
  await expect(page.getByRole("link", { name: /^Booked: .*5:15 am/ })).toBeVisible();

  await page.getByRole("link", { name: /^Booked:/ }).click();
  await expect(page.getByTestId("scheduled-for")).toContainText("5:15 am");
  await page.getByRole("button", { name: "Cancel this ride · free" }).click();
  await expect(page.getByTestId("scheduled-for")).toHaveCount(0);
  await expect(page.getByText("No charge")).toBeVisible();
});
