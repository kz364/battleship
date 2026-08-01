import { expect, test } from "@playwright/test";
import { exchangeShot, open, ownCell, startBattle } from "./helpers";

/** Filters are the property the specificity bug silently dropped, so read them directly. */
async function shipStyles(
  page: import("@playwright/test").Page,
  selector: string,
) {
  return page
    .locator(selector)
    .first()
    .evaluate((el) => {
      const img = el.querySelector("img")!;
      const style = getComputedStyle(img);
      return { filter: style.filter, opacity: style.opacity };
    });
}

test.describe("themes", () => {
  test("switches between classic and retro and remembers the choice", async ({
    page,
  }) => {
    await open(page);
    const app = page.locator(".app");
    await expect(app).toHaveAttribute("data-theme", "classic");

    await page.getByRole("button", { name: "Retro mode" }).click();
    await expect(app).toHaveAttribute("data-theme", "retro");

    await page.reload();
    await expect(page.locator(".app")).toHaveAttribute("data-theme", "retro");

    await page.getByRole("button", { name: "Classic mode" }).click();
    await expect(page.locator(".app")).toHaveAttribute("data-theme", "classic");
  });

  // Regression: `.app[data-theme='retro'] .ship img` out-specified `.ship--sunk img`, and
  // because `filter` is a single property the losing rule was dropped whole — sunk hulls
  // rendered identically to live ones. Same trap had eaten the ghost and invalid tints.
  for (const theme of ["classic", "retro"] as const) {
    test(`distinguishes ghost and invalid hulls from live ones in ${theme}`, async ({
      page,
    }) => {
      await open(page);
      if (theme === "retro") {
        await page.getByRole("button", { name: "Retro mode" }).click();
        await expect(page.locator(".app")).toHaveAttribute(
          "data-theme",
          "retro",
        );
      }

      await page.getByRole("button", { name: "Clear" }).click();
      await ownCell(page, 0, 0).click();
      const live = await shipStyles(page, ".ship:not(.ship--ghost)");

      // Hovering an occupied run gives a ghost that overlaps, so it renders invalid.
      await ownCell(page, 0, 1).hover();
      await expect(page.locator(".ship--ghost")).toBeVisible();
      const ghost = await shipStyles(page, ".ship--ghost");

      expect(Number(ghost.opacity)).toBeLessThan(Number(live.opacity));
      await expect(page.locator(".ship--invalid")).toBeVisible();
      const invalid = await shipStyles(page, ".ship--invalid");
      expect(invalid.filter).not.toBe(live.filter);
    });

    test(`dims sunk hulls in ${theme}`, async ({ page }) => {
      test.slow();
      await open(page);
      if (theme === "retro") {
        await page.getByRole("button", { name: "Retro mode" }).click();
      }
      // Admiral sinks two of your ships quickly, and your own board always shows hulls.
      await startBattle(page, "Admiral");

      for (let row = 0; row < 10; row++) {
        for (let col = 0; col < 10; col++) {
          if (await page.locator(".ship--sunk").count()) break;
          await exchangeShot(page, row, col);
        }
        if (await page.locator(".ship--sunk").count()) break;
      }

      await expect(page.locator(".ship--sunk").first()).toBeVisible();
      const sunk = await shipStyles(page, ".ship--sunk");
      const live = await shipStyles(
        page,
        ".ship:not(.ship--sunk):not(.ship--ghost)",
      );
      expect(sunk.filter).not.toBe(live.filter);
      expect(Number(sunk.opacity)).toBeLessThan(Number(live.opacity));
    });
  }
});
