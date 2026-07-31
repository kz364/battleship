/**
 * Invariant fuzzer. Plays full games with random fleets and every difficulty, asserting
 * the rules that unit tests state only for hand-built positions: shots stay in bounds,
 * no cell is fired at twice, damage never exceeds a ship's length, a ship reports sunk
 * exactly when all of its cells are hit, and no game runs past 100 shots.
 *
 *   npx tsx src/sim/fuzz.ts --games=5000 --seed=1
 */
import { cellsFor, createBoard, randomFleet } from "../engine/board";
import { fire, isSunk } from "../engine/game";
import { createRng } from "../engine/rng";
import { BOARD_SIZE, FLEET, coordLabel, type Board } from "../engine/types";
import { chooseShot, type Difficulty } from "../ai/strategies";
import { viewOf } from "../ai/view";

const DIFFICULTIES: Difficulty[] = ["easy", "medium", "hard"];

function check(condition: boolean, message: string): void {
  if (!condition) throw new Error(message);
}

function auditBoard(board: Board, shotCount: number): void {
  let hits = 0;
  for (let row = 0; row < BOARD_SIZE; row++) {
    for (let col = 0; col < BOARD_SIZE; col++) {
      if (board.shots[row][col] !== null) hits += 1;
    }
  }
  check(
    hits === shotCount,
    `board records ${hits} shots but ${shotCount} were fired`,
  );

  for (const spec of FLEET) {
    const placement = board.placements.find((p) => p.shipId === spec.id);
    check(placement !== undefined, `${spec.id} missing from the board`);
    const cells = cellsFor(placement!);
    check(
      cells.length === spec.length,
      `${spec.id} occupies ${cells.length} cells`,
    );

    const struck = cells.filter(
      (c) => board.shots[c.row][c.col] === "hit",
    ).length;
    check(
      board.damage[spec.id] === struck,
      `${spec.id} damage ${board.damage[spec.id]} but ${struck} of its cells are hit`,
    );
    check(
      isSunk(board, spec.id) === (struck === spec.length),
      `${spec.id} sunk flag disagrees with its cells`,
    );
  }
}

function playGame(difficulty: Difficulty, seed: number): void {
  const rng = createRng(seed);
  let board = createBoard(randomFleet(rng));
  const fired = new Set<string>();

  for (let shot = 1; shot <= 100; shot++) {
    const coord = chooseShot(viewOf(board), difficulty, rng);
    check(
      coord.row >= 0 &&
        coord.row < BOARD_SIZE &&
        coord.col >= 0 &&
        coord.col < BOARD_SIZE,
      `shot out of bounds at ${JSON.stringify(coord)}`,
    );
    const key = coordLabel(coord.row, coord.col);
    check(!fired.has(key), `fired at ${key} twice`);
    fired.add(key);

    board = fire(board, coord).board;
    auditBoard(board, shot);

    if (FLEET.every((spec) => isSunk(board, spec.id))) return;
  }

  throw new Error(
    "fleet survived 100 shots, which is impossible on a 10x10 board",
  );
}

function main(): void {
  const arg = (name: string, fallback: number): number => {
    const raw = process.argv.find((a) => a.startsWith(`--${name}=`));
    return raw ? Number(raw.split("=")[1]) : fallback;
  };

  const games = arg("games", 2000);
  const seed = arg("seed", 1);

  for (const difficulty of DIFFICULTIES) {
    for (let i = 0; i < games; i++) {
      try {
        playGame(difficulty, seed + i);
      } catch (error) {
        console.error(
          `FAIL ${difficulty} seed ${seed + i}: ${(error as Error).message}`,
        );
        process.exit(1);
      }
    }
    console.log(`ok  ${difficulty}: ${games} games, all invariants held`);
  }
}

main();
