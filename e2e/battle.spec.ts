import { expect, test } from "@playwright/test";
import {
  enemyCell,
  exchangeShot,
  latestLogEntry,
  logEntries,
  open,
  startBattle,
  status,
} from "./helpers";

test.describe("battle", () => {
  test("alternates turns and never lets the AI move twice", async ({
    page,
  }) => {
    await open(page);
    await startBattle(page, "Admiral");

    for (let col = 0; col < 6; col++) {
      await exchangeShot(page, 0, col);
    }

    const sides = await logEntries(page).evaluateAll((items) =>
      items
        .map((li) => (li.className.includes("--player") ? "you" : "enemy"))
        .reverse(),
    );
    expect(sides).toHaveLength(12);
    expect(sides.join(",")).toBe(
      Array.from({ length: 6 }, () => "you,enemy").join(","),
    );
  });

  test("ignores a repeat shot at a cell already fired on", async ({ page }) => {
    await open(page);
    await startBattle(page, "Admiral");

    await exchangeShot(page, 4, 4);
    const after = await logEntries(page).count();

    await expect(enemyCell(page, 4, 4)).toBeDisabled();
    await expect(enemyCell(page, 4, 4)).toHaveAccessibleName(/\((hit|miss)\)/);
    await expect(logEntries(page)).toHaveCount(after);
  });

  test("locks the difficulty once the battle starts", async ({ page }) => {
    await open(page);
    await expect(page.getByLabel("Opponent")).toBeEnabled();
    await startBattle(page, "Ensign");
    await expect(page.getByLabel("Opponent")).toBeDisabled();
  });

  // Regression: the peg socket was a grid sibling of the peg rather than sitting behind
  // it, so every fired cell drew two dots.
  test("draws exactly one peg, centred, on each fired cell", async ({
    page,
  }) => {
    await open(page);
    await startBattle(page, "Admiral");
    for (let col = 0; col < 4; col++) await exchangeShot(page, 2, col);

    const geometry = await page
      .locator('button[aria-label*="("]')
      .evaluateAll((cells) =>
        cells.map((cell) => {
          const pegs = cell.querySelectorAll(".peg");
          const cellBox = cell.getBoundingClientRect();
          const pegBox = pegs[0]?.getBoundingClientRect();
          return {
            pegs: pegs.length,
            dx: pegBox
              ? pegBox.left +
                pegBox.width / 2 -
                (cellBox.left + cellBox.width / 2)
              : 99,
            dy: pegBox
              ? pegBox.top +
                pegBox.height / 2 -
                (cellBox.top + cellBox.height / 2)
              : 99,
          };
        }),
      );

    expect(geometry.length).toBeGreaterThan(0);
    for (const cell of geometry) {
      expect(cell.pegs).toBe(1);
      expect(Math.abs(cell.dx)).toBeLessThan(1);
      expect(Math.abs(cell.dy)).toBeLessThan(1);
    }
  });

  // The enemy roster must not reveal which ship a live hit belongs to. Real Battleship
  // announces "hit", and only names the ship once it sinks.
  test("keeps enemy damage secret until a ship sinks", async ({ page }) => {
    await open(page);
    await startBattle(page, "Ensign");

    let hits = 0;
    for (let row = 0; row < 10 && hits === 0; row++) {
      for (let col = 0; col < 10 && hits === 0; col++) {
        await exchangeShot(page, row, col);
        const own = await latestLogEntry(page, "player").textContent();
        if (own?.includes("hit!")) hits += 1;
        if (own?.includes("sank")) return; // sank on the first hit; nothing to assert
      }
    }
    expect(hits).toBe(1);

    const enemyPips = page
      .locator(".panel", { has: page.getByText("Enemy fleet") })
      .locator(".pip--hit");
    await expect(enemyPips).toHaveCount(0);
  });

  test("lists the newest entry first", async ({ page }) => {
    await open(page);
    await startBattle(page, "Admiral");
    await exchangeShot(page, 0, 0);
    await exchangeShot(page, 0, 1);

    const texts = await logEntries(page).allTextContents();
    const own = texts.filter((t) => t.startsWith("You fired"));
    expect(own[0]).toContain("B1");
    expect(own[1]).toContain("A1");
  });

  // The status line only ever says "Your move." during battle, so the log is the sole
  // record of what a shot did. Browser testing found it was not a live region at all,
  // which left the game unplayable by ear. Announcing it correctly also depends on
  // React inserting one row rather than rewriting every row's text, which reversing
  // the list would do if the entries were keyed by their position on screen.
  test("announces new entries without re-reading the old ones", async ({
    page,
  }) => {
    await open(page);
    await startBattle(page, "Admiral");
    await exchangeShot(page, 0, 0);

    const list = page.locator("aside ol.log__list");
    await expect(list).toHaveAttribute("aria-live", "polite");

    const before = await logEntries(page).evaluateAll((items) =>
      items.map((li, i) => {
        li.setAttribute("data-seen", String(i));
        return li.textContent;
      }),
    );
    await exchangeShot(page, 0, 1);

    const survivors = await logEntries(page).evaluateAll((items) =>
      items
        .filter((li) => li.hasAttribute("data-seen"))
        .map((li) => li.textContent),
    );
    expect(survivors, "existing rows must be moved, not rewritten").toEqual(
      before,
    );
  });

  // Regression: the log scrolled its newest entry into view on every shot, which also
  // scrolled the page whenever the log ran below the fold — yanking the board away
  // mid-game. A short viewport is required to reproduce; a tall one hides it.
  test("does not scroll the page when an entry arrives", async ({ page }) => {
    await page.setViewportSize({ width: 900, height: 600 });
    await open(page);
    await startBattle(page, "Admiral");

    await page.evaluate(() => window.scrollTo(0, 0));
    const scrollable = await page.evaluate(
      () => document.documentElement.scrollHeight > window.innerHeight,
    );
    expect(scrollable, "viewport must be short enough to scroll").toBe(true);

    for (let col = 0; col < 3; col++) await exchangeShot(page, 0, col);

    expect(await page.evaluate(() => window.scrollY)).toBe(0);
  });

  // Hit feedback is transient: the shake class and the red flash both clear on the next
  // entry, so each shot is read once, immediately, rather than waited on.
  test("jolts the board that takes a hit, and only on a hit", async ({
    page,
  }) => {
    await open(page);
    await startBattle(page, "Admiral");

    const read = () =>
      page.evaluate(() => {
        const board = document.querySelector('[aria-label="Enemy waters"]');
        return {
          struck: /board--struck-(even|odd)/.test(board?.className ?? ""),
          entry:
            document.querySelector("aside ol li.log__entry")?.textContent ?? "",
        };
      });

    let hits = 0;
    let misses = 0;
    // Sweep until both outcomes have been seen. 17 of the 100 squares hold a ship, so a
    // skewed walk finds one quickly whatever the seeded layout turns out to be.
    for (let shot = 0; shot < 30 && (hits === 0 || misses === 0); shot++) {
      const cell = enemyCell(page, shot % 10, (shot * 3) % 10);
      if (await cell.isDisabled()) continue;
      await cell.click();

      const { struck, entry } = await read();
      if (!entry.startsWith("You fired")) continue; // AI already replied; unreadable
      if (entry.includes("miss")) {
        misses += 1;
        expect(struck, `a miss must not shake: ${entry}`).toBe(false);
      } else {
        hits += 1;
        expect(struck, `a hit must shake: ${entry}`).toBe(true);
      }
      await page.waitForTimeout(1_200); // let the AI answer before firing again
    }
    expect(hits, "30 shots should land at least one hit").toBeGreaterThan(0);
    expect(misses).toBeGreaterThan(0);
  });

  test("reddens the screen edges when your own fleet is hit", async ({
    page,
  }) => {
    await open(page);
    await startBattle(page, "Admiral");

    const flashed = () =>
      page.evaluate(() => ({
        flash: document.querySelectorAll(".app__damage").length,
        entry:
          document.querySelector("aside ol li.log__entry--ai")?.textContent ??
          "",
      }));

    let hits = 0;
    let misses = 0;
    for (let col = 0; col < 10 && (hits === 0 || misses === 0); col++) {
      await exchangeShot(page, 5, col);
      const { flash, entry } = await flashed();
      if (!entry.startsWith("Enemy fired")) continue;
      if (entry.includes("miss")) {
        misses += 1;
        expect(flash, `no flash for an enemy miss: ${entry}`).toBe(0);
      } else {
        hits += 1;
        expect(flash, `flash when your fleet is hit: ${entry}`).toBe(1);
      }
    }
    expect(
      hits,
      "Admiral should land a hit within a dozen shots",
    ).toBeGreaterThan(0);
    expect(misses).toBeGreaterThan(0);
  });

  test("announces enemy fire against your own fleet", async ({ page }) => {
    await open(page);
    await startBattle(page, "Admiral");
    await exchangeShot(page, 0, 0);

    await expect(logEntries(page).first()).toContainText("Enemy fired at");
    await expect(status(page)).toContainText("Your move.");
  });
});
