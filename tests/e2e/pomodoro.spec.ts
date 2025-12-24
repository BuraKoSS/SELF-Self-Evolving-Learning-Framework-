import { test, expect } from "@playwright/test";

test("User can start a pomodoro session", async ({ page }) => {
  await page.goto("http://localhost:3000");
  await page.click("text=Başlat");
  await expect(page.locator("text=Duraklat")).toBeVisible();
});
