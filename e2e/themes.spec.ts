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

  // Regression: the retro skin is a monospace, so panels sized by their text came out
  // wider — and its action buttons wrapped onto a different number of lines — which
  // slid every element sideways and down as you switched skins.
  test("keeps the layout still when the skin changes", async ({ page }) => {
    const geometry = () =>
      page.evaluate(() =>
        [".app__boards", ".board", ".board__grid", ".panel", ".panel--log"].map(
          (selector) => {
            const box = document
              .querySelector(selector)!
              .getBoundingClientRect();
            return [box.x, box.y, box.width, box.height].map((n) =>
              n.toFixed(2),
            );
          },
        ),
      );

    await open(page);
    const placement = await geometry();
    await page.getByRole("button", { name: "Retro mode" }).click();
    await expect(page.locator(".app")).toHaveAttribute("data-theme", "retro");
    expect(await geometry()).toEqual(placement);

    await startBattle(page);
    const battle = await geometry();
    await page.getByRole("button", { name: "Classic mode" }).click();
    await expect(page.locator(".app")).toHaveAttribute("data-theme", "classic");
    expect(await geometry()).toEqual(battle);
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

      // Hovering an empty square where the ship would not fit: a ghost, rendered invalid.
      // It has to be an empty one — over a hull the click picks that ship up instead, so
      // no ghost is drawn there at all.
      await ownCell(page, 0, 9).hover();
      await expect(page.locator(".ship--ghost")).toBeVisible();
      const ghost = await shipStyles(page, ".ship--ghost");

      expect(Number(ghost.opacity)).toBeLessThan(Number(live.opacity));
      await expect(page.locator(".ship--invalid")).toBeVisible();
      const invalid = await shipStyles(page, ".ship--invalid");
      expect(invalid.filter).not.toBe(live.filter);
    });

    // The highlight replaces the hull's whole filter, and retro's phosphor recolour lives
    // in that same property — dropping it renders the pointed-at ship grey on a green console.
    test(`keeps the ${theme} skin on a hull under the pointer`, async ({
      page,
    }) => {
      await open(page);
      if (theme === "retro") {
        await page.getByRole("button", { name: "Retro mode" }).click();
      }
      await page.getByRole("button", { name: "Clear" }).click();
      await ownCell(page, 0, 0).click();

      const live = await shipStyles(page, ".ship:not(.ship--ghost)");
      await ownCell(page, 0, 2).hover();
      const lit = await shipStyles(page, ".ship--highlighted");

      expect(lit.filter).not.toBe(live.filter);
      expect(lit.opacity).toBe("1");
      if (theme === "retro") {
        expect(lit.filter).toContain("hue-rotate");
      }
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
