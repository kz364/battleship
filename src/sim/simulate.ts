import { createBoard, randomFleet } from "../engine/board";
import { fire, isFleetDestroyed } from "../engine/game";
import { createRng, type Rng } from "../engine/rng";
import { chooseShot, type Difficulty } from "../ai/strategies";
import { viewOf } from "../ai/view";
import { BOARD_SIZE } from "../engine/types";

const CELLS = BOARD_SIZE * BOARD_SIZE;

/** Plays one solitaire game: how many shots does `difficulty` need to clear a board? */
export function playSolitaire(difficulty: Difficulty, rng: Rng): number {
  let board = createBoard(randomFleet(rng));
  let shots = 0;

  while (!isFleetDestroyed(board)) {
    if (shots > CELLS)
      throw new Error(`${difficulty} AI fired ${shots} shots without winning`);
    board = fire(board, chooseShot(viewOf(board), difficulty, rng)).board;
    shots++;
  }

  return shots;
}

export interface SimStats {
  difficulty: Difficulty;
  games: number;
  mean: number;
  median: number;
  min: number;
  max: number;
}

export function simulate(
  difficulty: Difficulty,
  games: number,
  seed = 1,
): SimStats {
  const rng = createRng(seed);
  const results: number[] = [];
  for (let i = 0; i < games; i++) results.push(playSolitaire(difficulty, rng));
  results.sort((a, b) => a - b);

  return {
    difficulty,
    games,
    mean: results.reduce((sum, n) => sum + n, 0) / games,
    median: results[Math.floor(games / 2)],
    min: results[0],
    max: results[games - 1],
  };
}
