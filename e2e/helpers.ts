import { expect, type Locator, type Page } from "@playwright/test";

/** Columns are lettered A-J across, rows numbered 1-10 down. */
export function cellName(row: number, col: number): string {
  return `${String.fromCharCode(65 + col)}${row + 1}`;
}

/**
 * A fired cell's label gains a " (hit)"/" (miss)" suffix, so match the prefix — but
 * anchored, or "A1" would also select "A10".
 */
function cellLocator(
  page: Page,
  board: string,
  row: number,
  col: number,
): Locator {
  return page.getByRole("button", {
    name: new RegExp(`^${board} ${cellName(row, col)}( \\(|$)`),
  });
}

export function ownCell(page: Page, row: number, col: number): Locator {
  return cellLocator(page, "Your waters", row, col);
}

export function enemyCell(page: Page, row: number, col: number): Locator {
  return cellLocator(page, "Enemy waters", row, col);
}

export const status = (page: Page) => page.getByRole("status");

/** Placed hulls only. The hover ghost is rendered into the same layer. */
export const hulls = (page: Page) =>
  page.locator(".board__ships .ship:not(.ship--ghost)");

/**
 * Real shots only — the list also holds an "Awaiting orders." placeholder when empty.
 * The log renders newest first, so index 0 is the most recent shot, not the opening one.
 */
export const logEntries = (page: Page) =>
  page.locator("aside ol li.log__entry:not(.log__entry--quiet)");

/** Most recent entry for one side, which survives the AI not having replied yet. */
export const latestLogEntry = (page: Page, side: "player" | "ai") =>
  page.locator(`aside ol li.log__entry--${side}`).first();

/**
 * A fixed seed makes both fleets and every AI choice reproducible, so tests can assert on
 * exact board layouts instead of retrying until the randomness cooperates.
 */
export async function open(page: Page, seed = 1, query = ""): Promise<void> {
  await page.goto(`/?seed=${seed}${query}`);
  await expect(page.getByRole("heading", { name: "Battleship" })).toBeVisible();
}

export async function startBattle(
  page: Page,
  difficulty?: "Ensign" | "Commander" | "Admiral",
) {
  if (difficulty) {
    await page.getByLabel("Opponent").selectOption({ label: difficulty });
  }
  await page.getByRole("button", { name: "Randomize" }).click();
  await page.getByRole("button", { name: "Engage" }).click();
  await expect(page.getByLabel("Enemy waters", { exact: true })).toBeVisible();
}

/**
 * Fires one shot and waits for the AI to answer, so turns never overlap. A shot that ends
 * the game gets no reply, so settle for the player's entry alone once the result is up.
 */
export async function exchangeShot(
  page: Page,
  row: number,
  col: number,
): Promise<void> {
  const before = await logEntries(page).count();
  await enemyCell(page, row, col).click();
  await expect(logEntries(page)).toHaveCount(before + 1, { timeout: 5_000 });

  await expect
    .poll(
      async () =>
        (await logEntries(page).count()) >= before + 2 ||
        (await page.getByRole("alert").isVisible()),
      { timeout: 5_000 },
    )
    .toBe(true);
}

/**
 * The status line and any rejected-cell markers, sampled once with no polling.
 * `expect(locator).toContainText()` retries, so it cannot see a wrong state that clears
 * itself — and both bugs this guards are exactly that: a placement warning that lingers
 * 2.2s past the attempt it described, and a single frame of "Your move." after firing.
 */
export function readStatus(page: Page): Promise<{
  text: string;
  warning: boolean;
  rejected: number;
}> {
  return page.evaluate(() => {
    const line = document.querySelector(".app__status");
    return {
      text: line?.textContent ?? "",
      warning: line?.className.includes("app__status--warning") ?? false,
      rejected: document.querySelectorAll(".cell--rejected").length,
    };
  });
}

export const rotateButton = (page: Page) =>
  page.getByRole("button", { name: /^Rotate \(R\)/ });

/** The orientation of the ship in hand, as a player without a mouse can read it. */
export const orientation = (page: Page) => page.locator(".hint__state");

export function computedStyle(
  cell: Locator,
  property: string,
): Promise<string> {
  return cell.evaluate(
    (element, prop) => getComputedStyle(element).getPropertyValue(prop),
    property,
  );
}
