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
      await page
        .locator('[aria-live], [role="status"], [role="alert"]')
        .count(),
    ).toBe(1);

    // Both fleets are summarised as they finished. The winner's five ships must all read
    // as sunk, and the count of sunk hulls must match what the log actually recorded —
    // the enemy roster spent the whole game concealing damage, so this is the one place
    // it is allowed to tell the truth.
    const fleets = page.locator(".result__fleets");
    await expect(fleets.locator(".roster")).toHaveCount(2);

    const won = ((await result.textContent()) ?? "").includes("Victory");
    const loser = fleets
      .locator(".roster")
      .filter({ hasText: won ? "Enemy fleet" : "Your fleet" });
    await expect(loser.locator(".roster__item--sunk")).toHaveCount(5);

    const sunkInLog = await logEntries(page)
      .filter({ hasText: /sank the enemy|is sunk/ })
      .count();
    await expect(fleets.locator(".roster__item--sunk")).toHaveCount(sunkInLog);

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
