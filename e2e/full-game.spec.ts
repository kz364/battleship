import { expect, test } from "@playwright/test";
import {
  enemyCell,
  exchangeShot,
  logEntries,
  open,
  startBattle,
} from "./helpers";

test.describe("a game to the end", () => {
  // Up to 100 shots, each followed by ~650ms of AI thinking. Slow, but it is the only
  // test that proves the win condition, the post-game lockout and the reset work.
  test.setTimeout(240_000);

  test("reaches a result, locks the board, and resets cleanly", async ({
    page,
  }) => {
    await open(page);
    // Ensign fires blind, so the player reliably outlasts a full sweep of the board.
    await startBattle(page, "Ensign");

    const result = page.getByRole("alert");
    outer: for (let row = 0; row < 10; row++) {
      for (let col = 0; col < 10; col++) {
        if (await result.isVisible()) break outer;
        const cell = enemyCell(page, row, col);
        if (await cell.isDisabled()) continue;
        await exchangeShot(page, row, col);
      }
    }

    await expect(result).toBeVisible();
    await expect(result).toContainText(/Victory|Defeat/);
    await expect(result).toContainText("shots fired");

    // The log is no longer live, so the result alert is the sole announcement path for
    // the game-ending shot. It must include that shot, not replace it with only the
    // verdict, and the ordinary status region must stand down to avoid two live regions.
    const finalShot = await logEntries(page).first().textContent();
    expect(finalShot).toBeTruthy();
    await expect(result).toContainText(finalShot!);
    await expect(page.getByRole("status")).toHaveCount(0);
    expect(
      await page.locator('[aria-live], [role="status"], [role="alert"]').count(),
    ).toBe(1);

    // Firing after the game is over must be a no-op, not another log entry.
    const settled = await logEntries(page).count();
    await enemyCell(page, 9, 9).click({ force: true });
    await expect(logEntries(page)).toHaveCount(settled);

    await page.getByRole("button", { name: "Play again" }).click();
    await expect(result).toBeHidden();
    await expect(page.getByRole("button", { name: "Engage" })).toBeVisible();
    await expect(logEntries(page)).toHaveCount(0);
  });
});
