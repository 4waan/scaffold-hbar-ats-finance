import { expect, test } from "@playwright/test";

test("overview explains the rail and evidence state", async ({ page }) => {
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: /Finance a security/i }),
  ).toBeVisible();
  await expect(page.getByText("Reference mode", { exact: true })).toBeVisible();
  await expect(page.getByText("Pyth", { exact: true })).toBeVisible();
});

test("facility exposes the complete bilateral workflow", async ({ page }) => {
  await page.goto("/facility");
  await expect(page.getByRole("heading", { name: /Move cash/i })).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Fund exact HBAR" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Settle overdue" }),
  ).toBeVisible();
});

test("verification keeps free and held balances distinct", async ({ page }) => {
  await page.goto("/verify");
  await expect(
    page.getByRole("heading", { name: /Trust the receipt/i }),
  ).toBeVisible();
  await expect(page.getByText(/Free and held ATS balances/i)).toBeVisible();
  await expect(page.getByText("Committed reference lifecycle")).toBeVisible();
});
