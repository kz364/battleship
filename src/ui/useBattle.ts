import { useCallback, useEffect, useRef, useState } from "react";
import { isLegalPlacement, randomFleet } from "../engine/board";
import { applyShot, createGame, type GameState } from "../engine/game";
import { createRng } from "../engine/rng";
import {
  FLEET,
  type Coord,
  type Placement,
  type ShipId,
} from "../engine/types";
import { chooseShot, type Difficulty } from "../ai/strategies";
import { viewOf } from "../ai/view";

const AI_THINKING_MS = 650;

/**
 * `?seed=123` makes a session reproducible. One stream feeds every draw in load order —
 * the opening fleet, each Randomize, the enemy fleet at Engage, then each AI shot — so the
 * same seed replays exactly as long as the same actions are taken. Handy for reporting a
 * bug against an exact game, and it is what lets the end-to-end tests fix board layouts.
 */
function seedFromUrl(): number | undefined {
  if (typeof window === "undefined") return undefined;
  const raw = new URLSearchParams(window.location.search).get("seed");
  if (raw === null) return undefined;
  const seed = Number(raw);
  return Number.isFinite(seed) ? seed : undefined;
}

export type Phase = "placement" | "playing" | "over";

export interface Battle {
  phase: Phase;
  difficulty: Difficulty;
  setDifficulty: (difficulty: Difficulty) => void;

  /** The player's fleet while they are arranging it. */
  fleet: Placement[];
  placeShip: (placement: Placement) => boolean;
  removeShip: (shipId: ShipId) => void;
  randomizeFleet: () => void;
  clearFleet: () => void;
  startBattle: () => void;

  game: GameState | null;
  fireAtEnemy: (coord: Coord) => void;
  newGame: () => void;
}

export function useBattle(): Battle {
  const rng = useRef(createRng(seedFromUrl())).current;
  const [difficulty, setDifficulty] = useState<Difficulty>("hard");
  const [fleet, setFleet] = useState<Placement[]>(() => randomFleet(rng));
  const [game, setGame] = useState<GameState | null>(null);

  const phase: Phase =
    game === null ? "placement" : game.phase === "over" ? "over" : "playing";

  // Decided out here rather than inside a setFleet updater. React is free to defer an
  // updater past the dispatch, so a result captured inside one is read back stale — which
  // made every legal placement report itself as rejected.
  const placeShip = useCallback(
    (placement: Placement): boolean => {
      const others = fleet.filter((p) => p.shipId !== placement.shipId);
      if (!isLegalPlacement(placement, others)) return false;
      setFleet([...others, placement]);
      return true;
    },
    [fleet],
  );

  const removeShip = useCallback((shipId: ShipId) => {
    setFleet((current) => current.filter((p) => p.shipId !== shipId));
  }, []);

  const randomizeFleet = useCallback(() => setFleet(randomFleet(rng)), [rng]);
  const clearFleet = useCallback(() => setFleet([]), []);

  const startBattle = useCallback(() => {
    if (fleet.length !== FLEET.length) return;
    setGame(createGame(fleet, randomFleet(rng)));
  }, [fleet, rng]);

  const newGame = useCallback(() => {
    setGame(null);
    setFleet(randomFleet(rng));
  }, [rng]);

  const fireAtEnemy = useCallback((coord: Coord) => {
    setGame((current) => {
      if (!current || current.phase !== "playing" || current.turn !== "player")
        return current;
      if (current.ai.shots[coord.row][coord.col] !== null) return current;
      return applyShot(current, "player", coord);
    });
  }, []);

  // The AI's turn, on a timer so the player can watch their own shot land first.
  // chooseShot() draws from the shared RNG, so it has to run out here rather than inside
  // the setGame updater: React invokes updaters twice under Strict Mode, which would
  // advance the RNG twice per turn and make the AI's choices unreproducible.
  //
  // Whose turn it is lives in `game` alone. A mirrored `aiThinking` flag used to be set
  // from this effect, which runs a render *after* the turn changes: for that one frame the
  // board was locked and the log showed the player's shot while the status still read
  // "Your move."
  useEffect(() => {
    if (!game || game.phase !== "playing" || game.turn !== "ai") return;

    const timer = setTimeout(() => {
      const coord = chooseShot(viewOf(game.player), difficulty, rng);
      setGame((current) => {
        if (!current || current.phase !== "playing" || current.turn !== "ai")
          return current;
        return applyShot(current, "ai", coord);
      });
    }, AI_THINKING_MS);

    return () => clearTimeout(timer);
  }, [game, difficulty, rng]);

  return {
    phase,
    difficulty,
    setDifficulty,
    fleet,
    placeShip,
    removeShip,
    randomizeFleet,
    clearFleet,
    startBattle,
    game,
    fireAtEnemy,
    newGame,
  };
}
