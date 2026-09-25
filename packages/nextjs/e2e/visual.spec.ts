import { expect, test, type Page } from "@playwright/test";

async function readyForSnapshot(page: Page) {
  await page.evaluate(() => document.fonts.ready);
  await page.addStyleTag({
    content: "nextjs-portal { display: none !important; }",
  });
}

test("home promise frame visual", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/");
  await readyForSnapshot(page);
  await expect(page).toHaveScreenshot("home-promise.png");
});

test("mobile facility workbench visual", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/facility?recipe=term-credit&mode=reference");
  await readyForSnapshot(page);
  await expect(page).toHaveScreenshot("facility-mobile.png");
});

test("verification ledger visual", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/verify?position=defaulted");
  await readyForSnapshot(page);
  await expect(page).toHaveScreenshot("verify-ledger.png");
});
