import { expect, test } from "@playwright/test";
import {
  cellName,
  computedStyle,
  hulls,
  logEntries,
  open,
  ownCell,
  status,
} from "./helpers";

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

  // Hovering a hull has to say which ship it is, because clicking picks that one up.
  test("picks out the ship under the pointer, from the board or the roster", async ({
    page,
  }) => {
    await ownCell(page, 0, 0).click(); // Carrier, A1..E1
    await ownCell(page, 0, 2).hover();

    await expect(page.locator(".cell--highlighted")).toHaveCount(5);
    await expect(page.locator(".ship--highlighted")).toHaveCount(1);
    // Its own squares, not the neighbouring row's.
    await expect(ownCell(page, 0, 4)).toHaveClass(/cell--highlighted/);
    await expect(ownCell(page, 1, 0)).not.toHaveClass(/cell--highlighted/);
    // The click would pick the Carrier up, so no ghost may promise a drop here.
    await expect(page.locator(".ship--ghost")).toHaveCount(0);

    await page.getByRole("heading", { name: "Battleship" }).hover();
    await expect(page.locator(".cell--highlighted")).toHaveCount(0);

    await page.getByRole("button", { name: /Carrier/ }).hover();
    await expect(page.locator(".cell--highlighted")).toHaveCount(5);
    await expect(page.locator(".ship--highlighted")).toHaveCount(1);
  });

  // The squares are painted above the hulls so a peg is never buried by one, which meant
  // grid lines and empty sockets printed through the ship you were pointing at.
  test("draws a pointed-at hull over its squares, not under them", async ({
    page,
  }) => {
    await ownCell(page, 0, 0).click();
    const layer = page.locator(".board__ships").first();
    await expect(layer).not.toHaveClass(/board__ships--raised/);

    await ownCell(page, 0, 2).hover();
    await expect(layer).toHaveClass(/board__ships--raised/);
    const [shipLayer, square] = await Promise.all([
      computedStyle(layer, "z-index"),
      computedStyle(ownCell(page, 0, 2), "z-index"),
    ]);
    expect(Number(shipLayer)).toBeGreaterThan(Number(square));
    // Nothing washes over the hull either: the hover tint is suppressed on its squares.
    await expect(ownCell(page, 0, 2)).toHaveCSS(
      "background-color",
      "rgba(0, 0, 0, 0)",
    );
  });

  // Regression: lifting a ship kept whatever the rotate toggle was set to, so a hull that
  // had been lying across the board came back up on end.
  test("keeps a lifted ship lying the way it was", async ({ page }) => {
    const lying = (locator: ReturnType<typeof page.locator>) =>
      locator.evaluate((el) => {
        const box = el.getBoundingClientRect();
        return box.width > box.height ? "horizontal" : "vertical";
      });

    // A fresh random fleet each pass, so the ships come up lying both ways rather than
    // however one layout happened to fall — the bug only shows on the vertical ones.
    const seen = new Set<string>();
    const fleet = [
      "Carrier",
      "Battleship",
      "Cruiser",
      "Submarine",
      "Destroyer",
    ];

    for (const ship of fleet) {
      await page.getByRole("button", { name: "Randomize" }).click();
      await expect(hulls(page)).toHaveCount(5);

      const placed = await lying(
        page.locator(`.ship:has(img[alt="${ship.toLowerCase()}"])`),
      );
      seen.add(placed);
      await page.getByRole("button", { name: new RegExp(ship) }).click();
      expect(await lying(page.locator(".carried img")), ship).toBe(placed);
    }

    expect([...seen].sort()).toEqual(["horizontal", "vertical"]);
  });

  // Regression: taking a ship from the roster removed it from the board and drew nothing
  // in its place, so the ship you were holding simply vanished until you dropped it.
  test("carries the selected ship under the cursor", async ({
    page,
    isMobile,
  }) => {
    const carried = page.locator(".carried");
    await expect(carried).toHaveAttribute("data-ship", "carrier");

    // Touch has no hover, so the sprite would only ever sit under the finger: it stays
    // hidden there, and the board's ghost does the work on tap.
    await page.mouse.move(300, 40);
    if (isMobile) {
      await expect(carried).toHaveCSS("opacity", "0");
    } else {
      await expect(carried).toHaveCSS("opacity", "1");
      const box = await carried.evaluate((el) => el.getBoundingClientRect());
      expect(Math.abs(box.left - 300)).toBeLessThan(2);
      expect(Math.abs(box.top - 40)).toBeLessThan(2);

      // Over the grid the board's aligned ghost takes over, so the loose sprite hides.
      await ownCell(page, 5, 5).hover();
      await expect(carried).toHaveCSS("opacity", "0");
      await expect(page.locator(".ship--ghost")).toHaveCount(1);
    }

    // Dropped: the Carrier is on the board, and the next ship comes to hand.
    await ownCell(page, 5, 5).click();
    await expect(hulls(page)).toHaveCount(1);
    await expect(carried).toHaveAttribute("data-ship", "battleship");

    // Taking it back from the roster must not leave an empty hand.
    await page.getByRole("button", { name: /Carrier/ }).click();
    await expect(hulls(page)).toHaveCount(0);
    await expect(carried).toHaveAttribute("data-ship", "carrier");
  });

  test("labels every cell for assistive tech", async ({ page }) => {
    await expect(ownCell(page, 0, 0)).toHaveAccessibleName("Your waters A1");
    await expect(ownCell(page, LAST, LAST)).toHaveAccessibleName(
      `Your waters ${cellName(LAST, LAST)}`,
    );
    await expect(logEntries(page)).toHaveCount(0);
  });
});
