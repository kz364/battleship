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

  // The square grows with the viewport once the boards stack, so the two ends of that
  // range are worth pinning: a phone should get more than the floor, and the narrowest
  // screen anyone still ships must not scroll sideways.
  test("grows the squares on a phone without overflowing a 320px screen", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 393, height: 851 });
    await open(page);
    const phone = await ownCell(page, 0, 0).boundingBox();
    expect(phone!.width).toBeGreaterThan(28);

    // 320 as the browser sees it, and 305 as the layout sees it on a platform whose
    // scrollbar takes 15px of it. Playwright's phone emulation uses overlay scrollbars,
    // so a plain 320px check passes over a layout that does scroll sideways in Chrome
    // on a desktop dragged narrow.
    for (const width of [320, 305]) {
      await page.setViewportSize({ width, height: 640 });
      const narrow = await ownCell(page, 0, 0).boundingBox();
      expect(narrow!.width, `${width}px cell`).toBeGreaterThanOrEqual(24);
      const overflow = await page.evaluate(
        () =>
          document.documentElement.scrollWidth -
          document.documentElement.clientWidth,
      );
      expect(overflow, `${width}px sideways overflow`).toBeLessThanOrEqual(0);
    }
  });
});
