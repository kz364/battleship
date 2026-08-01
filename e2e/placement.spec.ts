import { expect, test } from "@playwright/test";
import { cellName, hulls, logEntries, open, ownCell, status } from "./helpers";

const LAST = 9;

test.describe("placement", () => {
  test.beforeEach(async ({ page }) => {
    await open(page);
    await page.getByRole("button", { name: "Clear" }).click();
    await expect(status(page)).toContainText("5 ships to go");
  });

  test("places the fleet and enables Engage only when it is complete", async ({
    page,
  }) => {
    await expect(page.getByRole("button", { name: "Engage" })).toBeDisabled();

    await ownCell(page, 0, 0).click();
    await expect(status(page)).toContainText("4 ships to go");

    await page.getByRole("button", { name: "Randomize" }).click();
    await expect(status(page)).toContainText("Fleet ready");
    await expect(page.getByRole("button", { name: "Engage" })).toBeEnabled();
    await expect(hulls(page)).toHaveCount(5);
  });

  // A duplicate sprite layer once rendered every hull twice, which is invisible in a
  // screenshot because the copies sit exactly on top of each other.
  test("draws exactly one sprite per ship", async ({ page }) => {
    await page.getByRole("button", { name: "Randomize" }).click();
    await expect(hulls(page)).toHaveCount(5);

    const sprites = hulls(page).locator("img");
    const loaded = await sprites.evaluateAll((images) =>
      images.map((img) => (img as HTMLImageElement).naturalWidth),
    );
    expect(loaded.every((width) => width > 0)).toBe(true);
  });

  // Regression: `placeShip` used to report its result from inside a `setFleet` updater,
  // which React may run after the dispatch returns, so every *successful* placement read
  // back as rejected and flashed a warning. Auto-retrying matchers cannot see this — the
  // warning clears itself after 2.2s and `toContainText` simply waits it out — so read the
  // status the instant the click resolves, once, with no polling.
  test("says nothing when a placement succeeds", async ({ page }) => {
    await ownCell(page, 0, 0).click();

    const state = await page
      .locator(".app__status")
      .evaluate((el) => ({ text: el.textContent, className: el.className }));

    expect(state.className).not.toContain("app__status--warning");
    expect(state.text).not.toContain("can't go");
    expect(state.text).not.toContain("won't fit");
    expect(await page.locator(".cell--rejected").count()).toBe(0);
    await expect(hulls(page)).toHaveCount(1);
  });

  test("rotates with the button and with R", async ({ page }) => {
    await page.getByRole("button", { name: "Rotate (R)" }).click();
    await ownCell(page, 0, 0).click();
    await expect(hulls(page)).toHaveCount(1);
    const vertical = await hulls(page)
      .first()
      .evaluate(
        (el) =>
          el.getBoundingClientRect().height > el.getBoundingClientRect().width,
      );
    expect(vertical).toBe(true);

    await page.getByRole("button", { name: "Clear" }).click();
    await page.keyboard.press("r");
    await ownCell(page, 0, 0).click();
    const horizontal = await hulls(page)
      .first()
      .evaluate(
        (el) =>
          el.getBoundingClientRect().width > el.getBoundingClientRect().height,
      );
    expect(horizontal).toBe(true);
  });

  // Regression: the pickup handler used to live on the sprite layer, which is
  // pointer-events:none, so clicking a hull did nothing at all.
  test("picks a placed ship back up from any of its cells", async ({
    page,
  }) => {
    await ownCell(page, 0, 0).click();
    await expect(status(page)).toContainText("4 ships to go");

    // The middle of the hull, not its origin — an origin-only implementation passes
    // a naive test and still leaves most of the ship dead to the touch.
    await ownCell(page, 0, 2).click();
    await expect(status(page)).toContainText("5 ships to go");
    await expect(hulls(page)).toHaveCount(0);

    await page.getByRole("button", { name: "Rotate (R)" }).click();
    await ownCell(page, 0, 0).click();
    await ownCell(page, 2, 0).click();
    await expect(status(page)).toContainText("5 ships to go");
  });

  test("explains a placement that runs off the board", async ({ page }) => {
    await ownCell(page, LAST, LAST).click();

    await expect(status(page)).toContainText("Carrier won't fit at J10");
    await expect(status(page)).toContainText("hangs 4 cells off the board");
    await expect(status(page)).toHaveClass(/app__status--warning/);
    await expect(page.locator(".cell--rejected")).toHaveCount(1);
    await expect(status(page)).toContainText("5 ships to go", {
      timeout: 5_000,
    });
  });

  test("explains a placement blocked by another ship", async ({ page }) => {
    await page.getByRole("button", { name: "Rotate (R)" }).click();
    // Carrier down A3..A7, then a Battleship from A1 that would run into its nose. The
    // origin itself is empty, so this is a rejected placement and not a pickup.
    await ownCell(page, 2, 0).click();
    await expect(status(page)).toContainText("4 ships to go");

    await ownCell(page, 0, 0).click();
    await expect(status(page)).toContainText("Battleship can't go at A1");
    await expect(status(page)).toContainText("Carrier is in the way");
    await expect(page.locator(".cell--rejected")).toHaveCount(4);
    await expect(hulls(page)).toHaveCount(1);
  });

  test("allows ships to touch", async ({ page }) => {
    await ownCell(page, 0, 0).click();
    await ownCell(page, 1, 0).click();
    await expect(status(page)).toContainText("3 ships to go");
    await expect(hulls(page)).toHaveCount(2);
  });

  test("labels every cell for assistive tech", async ({ page }) => {
    await expect(ownCell(page, 0, 0)).toHaveAccessibleName("Your waters A1");
    await expect(ownCell(page, LAST, LAST)).toHaveAccessibleName(
      `Your waters ${cellName(LAST, LAST)}`,
    );
    await expect(logEntries(page)).toHaveCount(0);
  });
});
