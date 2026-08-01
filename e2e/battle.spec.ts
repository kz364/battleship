import { expect, test } from "@playwright/test";
import {
  enemyCell,
  exchangeShot,
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
      items.map((li) => (li.className.includes("--player") ? "you" : "enemy")),
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
        const last = await logEntries(page).nth(-2).textContent();
        if (last?.includes("hit!")) hits += 1;
        if (last?.includes("sank")) return; // sank on the first hit; nothing to assert
      }
    }
    expect(hits).toBe(1);

    const enemyPips = page
      .locator(".panel", { has: page.getByText("Enemy fleet") })
      .locator(".pip--hit");
    await expect(enemyPips).toHaveCount(0);
  });

  test("announces enemy fire against your own fleet", async ({ page }) => {
    await open(page);
    await startBattle(page, "Admiral");
    await exchangeShot(page, 0, 0);

    await expect(logEntries(page).last()).toContainText("Enemy fired at");
    await expect(status(page)).toContainText("Your move.");
  });
});
