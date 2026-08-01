import { useCallback, useEffect, useMemo, useState } from "react";
import {
  cellsFor,
  createBoard,
  isLegalPlacement,
  placementAt,
  placementProblem,
} from "./engine/board";
import {
  FLEET,
  coordLabel,
  type Coord,
  type Orientation,
  type Placement,
  type ShipId,
} from "./engine/types";
import {
  DIFFICULTY_BLURBS,
  DIFFICULTY_LABELS,
  type Difficulty,
} from "./ai/strategies";
import { Board } from "./ui/Board";
import { Log } from "./ui/Log";
import { Roster } from "./ui/Roster";
import { Ship } from "./ui/Ship";
import { useBattle } from "./ui/useBattle";
import { useTheme } from "./ui/useTheme";
import "./styles/app.css";

const DIFFICULTIES: Difficulty[] = ["easy", "medium", "hard"];

/** How long a rejected placement stays announced and highlighted. */
const REJECTION_MS = 2200;

interface Rejection {
  message: string;
  /** The cells the ship would have covered, highlighted so the reason is visible. */
  cells: Coord[];
  nonce: number;
}

function describeProblem(
  shipName: string,
  placement: Placement,
  others: readonly Placement[],
): string {
  const problem = placementProblem(placement, others);
  const at = coordLabel(placement.row, placement.col);

  if (problem?.kind === "off-board") {
    const noun = problem.overhang === 1 ? "cell" : "cells";
    return `${shipName} won't fit at ${at} — it hangs ${problem.overhang} ${noun} off the board. Rotate it, or start further in.`;
  }

  if (problem?.kind === "overlap") {
    const blocker = FLEET.find((s) => s.id === problem.blockedBy);
    return `${shipName} can't go at ${at} — the ${blocker?.name ?? "another ship"} is in the way. Ships may touch, but not overlap.`;
  }

  return `${shipName} can't go at ${at}.`;
}

export default function App() {
  const battle = useBattle();
  const { theme, toggleTheme } = useTheme();

  const [selected, setSelected] = useState<ShipId | null>(FLEET[0].id);
  const [orientation, setOrientation] = useState<Orientation>("horizontal");
  const [hover, setHover] = useState<Coord | null>(null);
  const [rejection, setRejection] = useState<Rejection | null>(null);

  const placedIds = useMemo(
    () => new Set(battle.fleet.map((p) => p.shipId)),
    [battle.fleet],
  );
  const unplaced = FLEET.filter((spec) => !placedIds.has(spec.id));

  const rotate = useCallback(
    () =>
      setOrientation((o) => (o === "horizontal" ? "vertical" : "horizontal")),
    [],
  );

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key.toLowerCase() === "r") rotate();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [rotate]);

  // Keep a ship selected while any remain unplaced, so the player can lay the whole
  // fleet down without going back to the roster between each one.
  useEffect(() => {
    if (battle.phase !== "placement") return;
    if (selected && !placedIds.has(selected)) return;
    setSelected(unplaced[0]?.id ?? null);
  }, [battle.phase, placedIds, selected, unplaced]);

  const ghost: Placement | null = useMemo(() => {
    if (battle.phase !== "placement" || !selected || !hover) return null;
    const spec = FLEET.find((s) => s.id === selected);
    if (!spec) return null;
    return {
      shipId: spec.id,
      length: spec.length,
      row: hover.row,
      col: hover.col,
      orientation,
    };
  }, [battle.phase, selected, hover, orientation]);

  const ghostLegal = ghost
    ? isLegalPlacement(
        ghost,
        battle.fleet.filter((p) => p.shipId !== ghost.shipId),
      )
    : false;

  const placementBoard = useMemo(
    () => createBoard(battle.fleet),
    [battle.fleet],
  );

  // The red ghost only tells you a placement is illegal if you have a pointer that can
  // hover. Touch and keyboard users get the same information from a rejection instead.
  useEffect(() => {
    if (!rejection) return;
    const timer = setTimeout(() => setRejection(null), REJECTION_MS);
    return () => clearTimeout(timer);
  }, [rejection]);

  const handlePlacementClick = (coord: Coord) => {
    // Clicking a hull picks that ship back up. The hull sprites sit in a
    // pointer-events:none layer beneath the cell buttons, so the cell has to resolve
    // this rather than the sprite itself.
    const occupant = placementAt(battle.fleet, coord.row, coord.col);
    if (occupant) {
      pickUp(occupant.shipId);
      return;
    }

    if (!selected) return;
    const spec = FLEET.find((s) => s.id === selected);
    if (!spec) return;

    const placement: Placement = {
      shipId: spec.id,
      length: spec.length,
      row: coord.row,
      col: coord.col,
      orientation,
    };

    if (battle.placeShip(placement)) {
      setRejection(null);
      return;
    }

    const others = battle.fleet.filter((p) => p.shipId !== spec.id);
    setRejection({
      message: describeProblem(spec.name, placement, others),
      cells: cellsFor(placement),
      // Re-clicking the same bad cell should replay the flash rather than sit inert.
      nonce: Date.now(),
    });
  };

  const pickUp = (shipId: ShipId) => {
    battle.removeShip(shipId);
    setSelected(shipId);
  };

  const game = battle.game;
  const lastEntry = game?.log[game.log.length - 1];
  const lastPlayerShot = [...(game?.log ?? [])]
    .reverse()
    .find((e) => e.side === "player");
  const lastAiShot = [...(game?.log ?? [])]
    .reverse()
    .find((e) => e.side === "ai");

  const statusText = (() => {
    if (battle.phase === "placement") {
      if (rejection) return rejection.message;
      return unplaced.length > 0
        ? `Position your fleet — ${unplaced.length} ship${unplaced.length === 1 ? "" : "s"} to go.`
        : "Fleet ready. Engage when you are.";
    }
    if (battle.phase === "over") {
      return game?.winner === "player"
        ? "Enemy fleet destroyed. You win!"
        : "Your fleet is lost. Defeat.";
    }
    if (battle.aiThinking) return "Enemy is taking aim…";
    return lastEntry ? "Your move." : "Open fire when ready.";
  })();

  return (
    <div className="app" data-theme={theme}>
      <div className="app__scanlines" aria-hidden="true" />

      <header className="app__header">
        <h1 className="app__title">Battleship</h1>
        <div className="app__controls">
          <label className="control">
            <span className="control__label">Opponent</span>
            <select
              className="control__select"
              value={battle.difficulty}
              disabled={battle.phase === "playing"}
              onChange={(event) =>
                battle.setDifficulty(event.target.value as Difficulty)
              }
            >
              {DIFFICULTIES.map((level) => (
                <option key={level} value={level}>
                  {DIFFICULTY_LABELS[level]}
                </option>
              ))}
            </select>
          </label>
          <button type="button" className="button" onClick={toggleTheme}>
            {theme === "classic" ? "Retro mode" : "Classic mode"}
          </button>
          <button type="button" className="button" onClick={battle.newGame}>
            New game
          </button>
        </div>
      </header>

      <p className="app__blurb">{DIFFICULTY_BLURBS[battle.difficulty]}</p>
      <p
        className={`app__status${rejection ? " app__status--warning" : ""}`}
        role="status"
      >
        {statusText}
      </p>

      <main className="app__main">
        <section className="panel">
          <Board
            label="Your waters"
            board={battle.phase === "placement" ? placementBoard : game!.player}
            revealShips
            interactive={battle.phase === "placement"}
            onCellClick={handlePlacementClick}
            onCellEnter={setHover}
            onCellLeave={() => setHover(null)}
            flashKey={rejection?.nonce}
            flashCells={rejection?.cells}
            lastShot={
              lastAiShot ? { row: lastAiShot.row, col: lastAiShot.col } : null
            }
            overlay={
              <>
                {ghost && (
                  <Ship placement={ghost} ghost invalid={!ghostLegal} />
                )}
              </>
            }
          />
          {battle.phase === "placement" ? (
            <div className="panel__actions">
              <button type="button" className="button" onClick={rotate}>
                Rotate (R)
              </button>
              <button
                type="button"
                className="button"
                onClick={battle.randomizeFleet}
              >
                Randomize
              </button>
              <button
                type="button"
                className="button"
                onClick={battle.clearFleet}
              >
                Clear
              </button>
              <button
                type="button"
                className="button button--primary"
                disabled={unplaced.length > 0}
                onClick={battle.startBattle}
              >
                Engage
              </button>
            </div>
          ) : (
            <Roster title="Your fleet" board={game!.player} />
          )}
        </section>

        <section className="panel">
          {battle.phase === "placement" ? (
            <div className="panel__placeholder">
              <Roster
                title="Choose a ship, then click your grid"
                placed={placedIds}
                selected={selected}
                onSelect={(shipId) =>
                  placedIds.has(shipId) ? pickUp(shipId) : setSelected(shipId)
                }
              />
              <p className="hint">
                Press <kbd>R</kbd> to rotate. Click a placed ship to pick it up
                again.
              </p>
            </div>
          ) : (
            <>
              <Board
                label="Enemy waters"
                board={game!.ai}
                revealShips={battle.phase === "over"}
                interactive={
                  battle.phase === "playing" && game!.turn === "player"
                }
                onCellClick={battle.fireAtEnemy}
                lastShot={
                  lastPlayerShot
                    ? { row: lastPlayerShot.row, col: lastPlayerShot.col }
                    : null
                }
              />
              <Roster title="Enemy fleet" board={game!.ai} concealDamage />
            </>
          )}
        </section>

        <aside className="panel panel--side">
          <Log entries={game?.log ?? []} />
        </aside>
      </main>

      {battle.phase === "over" && (
        <div className="result" role="alert">
          <p className="result__text">
            {game?.winner === "player" ? "Victory" : "Defeat"}
          </p>
          <p className="result__detail">
            {game?.log.filter((e) => e.side === "player").length} shots fired ·{" "}
            {game?.log.filter((e) => e.side === "ai").length} taken
          </p>
          <button
            type="button"
            className="button button--primary"
            onClick={battle.newGame}
          >
            Play again
          </button>
        </div>
      )}
    </div>
  );
}
