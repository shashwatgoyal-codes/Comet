import { expect, test } from "@playwright/test";

import { opsEmail, signInByEmail } from "./mail";

/**
 * Pilot onboarding and approval (docs/UX_FLOWS.md Flows 12 and 13): a new
 * Pilot applies, ops approve them, and they can start driving.
 */

const inAYear = new Date(Date.now() + 365 * 86_400_000).toISOString().slice(0, 10);

/** A name no other run has used, so the ops queue row is this run's. Letters only. */
const uniqueName = (first: string) => {
  const letters = Date.now()
    .toString()
    .slice(-6)
    .replace(/\d/g, (d) => "abcdefghij"[Number(d)]!);
  return `${first} ${test.info().project.name === "mobile" ? "M" : "D"}${letters}`;
};

test("a new Pilot applies, ops approve, and they can go online", async ({ browser, request }) => {
  test.setTimeout(120_000);
  const applicant = await (await browser.newContext()).newPage();
  const email = `e2e+pilot${Date.now()}${test.info().project.name}@example.com`;
  await signInByEmail(applicant, request, email, "/pilot", /\/pilot\/onboarding$/);
  const name = uniqueName("Meera");

  await expect(applicant.getByRole("heading", { name: "Become a Comet Pilot" })).toBeVisible();
  await applicant.getByRole("radio", { name: "Car" }).click();
  await expect(applicant.getByRole("radio", { name: "Car" })).toHaveAttribute(
    "aria-checked",
    "true",
  );

  const step = async (fill: Record<string, string>, save = "Save") => {
    for (const [label, value] of Object.entries(fill)) {
      await applicant.getByLabel(label).fill(value);
    }
    await applicant.getByRole("dialog").getByRole("button", { name: save }).click();
    await expect(applicant.getByRole("dialog")).toBeHidden();
  };

  await applicant.getByRole("button", { name: "Add your profile" }).click();
  await step({ "Full name, as on your licence": name });
  await expect(applicant.getByTestId("onboarding-progress")).toHaveText("1 of 5 done");

  await applicant.getByRole("button", { name: "Add driving licence" }).click();
  await step({ "Licence number": "KA05 20190012345", "Valid until": inAYear });
  await expect(applicant.getByText("DL ending 2345")).toBeVisible();

  await applicant.getByRole("button", { name: "Upload vehicle RC" }).click();
  await applicant.getByLabel("Number plate").fill("not a plate");
  await applicant.getByLabel("Make and model").fill("Hyundai Aura");
  await applicant.getByLabel("Colour").fill("Grey");
  await applicant.getByRole("dialog").getByRole("button", { name: "Save" }).click();
  await expect(applicant.getByRole("dialog").getByRole("alert")).toHaveText(
    "Enter a plate like KA 05 MX 2841.",
  );
  await step({ "Number plate": "ka03ab1234" });
  await expect(applicant.getByText("KA 03 AB 1234")).toBeVisible();

  await applicant.getByRole("button", { name: "Add vehicle photos" }).click();
  await step({}, "Add photos (simulated)");
  await applicant.getByRole("button", { name: "Add payout account" }).click();
  await step({ "UPI ID": "meera.v@okaxis" });

  await expect(applicant.getByTestId("onboarding-progress")).toHaveText("5 of 5 done");
  await applicant.getByRole("button", { name: "Send for review" }).click();
  await expect(applicant.getByText(/In review · this page updates/)).toBeVisible();

  // Signed in but not ops: /ops doesn't exist for them.
  const notFound = await applicant.goto("/ops");
  expect(notFound?.status()).toBe(404);

  const ops = await (await browser.newContext()).newPage();
  await signInByEmail(ops, request, opsEmail("approve"), "/ops", /\/ops$/);
  const row = ops.getByRole("listitem", { name: `Application from ${name}` });
  await expect(row).toContainText("KA 03 AB 1234");
  await expect(row).toContainText("me•••••@okaxis");
  await row.getByRole("button", { name: `Approve ${name}` }).click();
  await expect(row).toBeHidden();

  await applicant.goto("/pilot/onboarding");
  await expect(applicant.getByText("Approved · you can go online now")).toBeVisible();
  await applicant.getByRole("link", { name: "Start driving" }).click();
  await expect(applicant).toHaveURL(/\/pilot$/);
  await expect(applicant.getByRole("button", { name: "Go online" })).toBeVisible();

  await applicant.goto("/pilot/account");
  await expect(
    applicant.getByRole("listitem").filter({ hasText: "Background check" }),
  ).toContainText("Cleared");
});

test("ops can send an application back with a reason", async ({ browser, request }) => {
  test.setTimeout(120_000);
  const applicant = await (await browser.newContext()).newPage();
  const email = `e2e+back${Date.now()}${test.info().project.name}@example.com`;
  await signInByEmail(applicant, request, email, "/pilot", /\/pilot\/onboarding$/);
  await applicant.getByRole("radio", { name: "Bike" }).click();
  const fill = async (button: string, fields: Record<string, string>, save = "Save") => {
    await applicant.getByRole("button", { name: button }).click();
    for (const [label, value] of Object.entries(fields)) {
      await applicant.getByLabel(label).fill(value);
    }
    await applicant.getByRole("dialog").getByRole("button", { name: save }).click();
    await expect(applicant.getByRole("dialog")).toBeHidden();
  };
  const name = uniqueName("Deepak");
  await fill("Add your profile", { "Full name, as on your licence": name });
  await fill("Add driving licence", {
    "Licence number": "KA0520190012345",
    "Valid until": inAYear,
  });
  await fill("Upload vehicle RC", {
    "Number plate": "KA 01 HX 7788",
    "Make and model": "Honda Activa",
    Colour: "Blue",
  });
  await fill("Add vehicle photos", {}, "Add photos (simulated)");
  await fill("Add payout account", { "UPI ID": "deepak@ybl" });
  await applicant.getByRole("button", { name: "Send for review" }).click();
  await expect(applicant.getByText(/In review/).first()).toBeVisible();

  const ops = await (await browser.newContext()).newPage();
  await signInByEmail(ops, request, opsEmail("reject"), "/ops", /\/ops$/);
  const row = ops.getByRole("listitem", { name: `Application from ${name}` });
  await row.getByRole("button", { name: `Reject ${name}` }).click();
  await row
    .getByLabel(/What should .* fix\?/)
    .fill("Your vehicle photos are blurry. Please retake them.");
  await row.getByRole("button", { name: "Send back" }).click();
  await expect(row).toBeHidden();

  await applicant.reload();
  await expect(applicant.getByTestId("rejection-reason")).toHaveText(
    "Your vehicle photos are blurry. Please retake them.",
  );
  await expect(applicant.getByRole("button", { name: "Send for review" })).toBeVisible();
});
