import { expect, test } from "@playwright/test";

test("home presents one promise, one recipe, and one proof frame", async ({
  page,
}) => {
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "Make ATS assets financeable." }),
  ).toBeVisible();
  await expect(page.getByText("Reference mode", { exact: true })).toBeVisible();
  await page.getByRole("tab", { name: "Maturity Bridge" }).click();
  await expect(
    page.getByRole("heading", { name: "Maturity Bridge" }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Open this blueprint" }),
  ).toHaveAttribute("href", "/facility?recipe=maturity-bridge&mode=reference");
  await expect(
    page.getByRole("heading", { name: "Every claim has a source." }),
  ).toBeVisible();
});

test("facility expands only one lifecycle step", async ({ page }) => {
  await page.goto("/facility?recipe=term-credit&mode=reference");
  await expect(
    page.getByRole("heading", { name: "One obligation, step by step." }),
  ).toBeVisible();
  await expect(page.locator('.facilityStep[data-active="true"]')).toHaveCount(
    1,
  );
  await expect(
    page.getByRole("button", { name: /Choose recipe/i }),
  ).toHaveAttribute("aria-expanded", "true");

  await page.getByRole("button", { name: "Continue" }).click();
  await expect(
    page.getByRole("button", { name: /Set terms/i }),
  ).toHaveAttribute("aria-expanded", "true");
  await expect(page.getByRole("button", { name: /Set terms/i })).toBeFocused();

  await page.getByRole("button", { name: "Live wallet" }).click();
  await expect(page).toHaveURL(/mode=live/);
  await expect(
    page.getByText("Live addresses are not configured."),
  ).toBeVisible();
  await page.getByRole("button", { name: /Price and fund/i }).click();
  const activeStep = page.locator('.facilityStep[data-active="true"]');
  await expect(activeStep.getByText("Lender", { exact: true })).toBeVisible();
  await expect(activeStep.locator(".primaryButton")).toHaveCount(1);
});

test("verification keeps financial claims and balances distinct", async ({
  page,
}) => {
  await page.goto("/verify?position=defaulted");
  await expect(
    page.getByRole("heading", {
      name: "Follow one position from claim to source.",
    }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Defaulted position" }),
  ).toHaveAttribute("aria-pressed", "true");
  await expect(
    page.getByText("Free ATS balance", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("Held ATS balance", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("Pyth cash quote", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("Cash liabilities", { exact: true }),
  ).toBeVisible();
  await expect(page.getByText("HSS reserve", { exact: true })).toBeVisible();
});

test("shareable recipe state and mobile layout remain bounded", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/facility?recipe=maturity-bridge&mode=reference");
  await expect(page.getByLabel("Financing recipe")).toHaveValue(
    "maturity-bridge",
  );
  const hasOverflow = await page.evaluate(
    () => document.documentElement.scrollWidth > window.innerWidth,
  );
  expect(hasOverflow).toBe(false);
  await expect(page.locator('.facilityStep[data-active="true"]')).toHaveCount(
    1,
  );
  await expect(
    page.locator('.facilityStep[data-active="true"] .primaryButton'),
  ).toHaveCount(1);
});
