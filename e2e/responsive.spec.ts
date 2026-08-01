import { expect, test } from "@playwright/test";
import { enemyCell, logEntries, open, ownCell, startBattle } from "./helpers";

test.describe("layout", () => {
  test("fits the viewport without sideways scrolling", async ({ page }) => {
    await open(page);

    const overflows = await page.evaluate(
      () =>
        document.documentElement.scrollWidth >
        document.documentElement.clientWidth,
    );
    expect(overflows).toBe(false);
  });

  test("keeps both boards reachable during battle", async ({ page }) => {
    await open(page);
    await startBattle(page, "Ensign");

    await expect(page.getByLabel("Your waters", { exact: true })).toBeVisible();
    await expect(
      page.getByLabel("Enemy waters", { exact: true }),
    ).toBeVisible();

    // Narrow viewports stack the boards, so the enemy grid starts below the fold.
    // What matters is that it scrolls to and can be fired at, not that it starts on screen.
    const target = enemyCell(page, 0, 0);
    await target.scrollIntoViewIfNeeded();
    await expect(target).toBeInViewport();
    await target.click();
    await expect(logEntries(page)).not.toHaveCount(0);
  });

  test("cells stay large enough to tap", async ({ page }) => {
    await open(page);
    const box = await ownCell(page, 0, 0).boundingBox();
    expect(box).not.toBeNull();
    // The grid scales with the viewport; below this it stops being usable by thumb.
    expect(box!.width).toBeGreaterThanOrEqual(24);
    expect(box!.height).toBeGreaterThanOrEqual(24);
  });
});
