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
import { CarriedShip } from "./ui/CarriedShip";
import { Log } from "./ui/Log";
import { Roster } from "./ui/Roster";
import { Ship } from "./ui/Ship";
import { describeShot } from "./ui/shotText";
import { useBattle } from "./ui/useBattle";
import { useTheme } from "./ui/useTheme";
import "./styles/app.css";

const DIFFICULTIES: Difficulty[] = ["easy", "medium", "hard"];

interface Rejection {
  message: string;
  /** The cells the ship would have covered, highlighted so the reason is visible. */
  cells: Coord[];
  nonce: number;
  /**
   * What was being attempted. A refusal explains one specific attempt — this ship, this
   * way up, against this fleet — so it stops being true the moment any of those change.
   */
  shipId: ShipId;
  orientation: Orientation;
  fleet: readonly Placement[];
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
  const [highlighted, setHighlighted] = useState<ShipId | null>(null);
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
    // Over a hull the click picks that ship up, so promising a drop there would lie.
    if (placementAt(battle.fleet, hover.row, hover.col)) return null;
    const spec = FLEET.find((s) => s.id === selected);
    if (!spec) return null;
    return {
      shipId: spec.id,
      length: spec.length,
      row: hover.row,
      col: hover.col,
      orientation,
    };
  }, [battle.phase, battle.fleet, selected, hover, orientation]);

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
  // hover. Touch and keyboard users get the same information from this instead, and it
  // stays legible for as long as the attempt it describes is still on the table rather
  // than expiring on a clock.
  // Rotating, taking a different ship, Randomize, Clear, New game and a successful drop
  // all change one of these, which retires the message without each having to remember to.
  // `fleet` is compared by identity: every fleet edit produces a new array.
  const liveRejection =
    rejection &&
    battle.phase === "placement" &&
    rejection.shipId === selected &&
    rejection.orientation === orientation &&
    rejection.fleet === battle.fleet
      ? rejection
      : null;

  // Clear and New game build a different fleet, so anything still pointing at the old one
  // — the ship in hand, its rotation, what the pointer had picked out — has to let go.
  const resetPlacementUi = (nextSelected: ShipId | null) => {
    setSelected(nextSelected);
    setOrientation("horizontal");
    setHover(null);
    setHighlighted(null);
    setRejection(null);
  };

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
      shipId: spec.id,
      orientation,
      fleet: battle.fleet,
    });
  };

  const pickUp = (shipId: ShipId) => {
    // Adopt how the ship was lying, so lifting a randomized hull does not silently
    // rotate it to whatever the toggle happened to be set to.
    const lying = battle.fleet.find((p) => p.shipId === shipId);
    if (lying) setOrientation(lying.orientation);
    battle.removeShip(shipId);
    setSelected(shipId);
    setHighlighted(null);
  };

  const enterCell = (coord: Coord) => {
    setHover(coord);
    setHighlighted(
      placementAt(battle.fleet, coord.row, coord.col)?.shipId ?? null,
    );
  };

  const leaveBoard = () => {
    setHover(null);
    setHighlighted(null);
  };

  // The ship in hand: selected, not yet on the board, so it can ride the cursor instead
  // of disappearing between the roster and its square.
  const carried =
    battle.phase === "placement" && selected && !placedIds.has(selected)
      ? FLEET.find((spec) => spec.id === selected)
      : undefined;

  const game = battle.game;
  const lastEntry = game?.log[game.log.length - 1];
  const playerShots = game?.log.filter((e) => e.side === "player").length ?? 0;
  const aiShots = game?.log.filter((e) => e.side === "ai").length ?? 0;
  const lastPlayerShot = [...(game?.log ?? [])]
    .reverse()
    .find((e) => e.side === "player");
  const lastAiShot = [...(game?.log ?? [])]
    .reverse()
    .find((e) => e.side === "ai");

  // A hit jolts the board that took it, and reddens the screen edges when it is yours.
  // The log length stands in for "which shot", so each new hit alternates the class and
  // restarts the animation.
  const struck =
    game && lastEntry && lastEntry.result !== "miss" ? game.log.length : null;
  const playerStruck = lastEntry?.side === "ai" ? struck : null;
  const enemyStruck = lastEntry?.side === "player" ? struck : null;

  // The one place a shot is announced. It used to say only "Your move.", which left the
  // log — three panels down and below the fold on a laptop — as the sole record of what
  // had just happened, and the sole thing a screen reader could read.
  const statusText = (() => {
    if (battle.phase === "placement") {
      if (liveRejection) return liveRejection.message;
      return unplaced.length > 0
        ? `Position your fleet — ${unplaced.length} ship${unplaced.length === 1 ? "" : "s"} to go.`
        : "Fleet ready. Engage when you are.";
    }
    if (battle.phase === "over") {
      return game?.winner === "player"
        ? "Enemy fleet destroyed. You win!"
        : "Your fleet is lost. Defeat.";
    }
    if (!lastEntry) return "Open fire when ready.";
    const turn = game?.turn === "ai" ? "Enemy is taking aim…" : "Your move.";
    return `${describeShot(lastEntry)} ${turn}`;
  })();

  return (
    <div className="app" data-theme={theme}>
      <div className="app__scanlines" aria-hidden="true" />
      {playerStruck !== null && (
        // Keyed by the shot, so each hit mounts a fresh node and replays the fade.
        <div key={playerStruck} className="app__damage" aria-hidden="true" />
      )}
      {carried && (
        <CarriedShip
          shipId={carried.id}
          length={carried.length}
          orientation={orientation}
        />
      )}

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
          <button
            type="button"
            className="button"
            onClick={() => {
              battle.newGame();
              resetPlacementUi(null);
            }}
          >
            New game
          </button>
        </div>
      </header>

      <p className="app__blurb">{DIFFICULTY_BLURBS[battle.difficulty]}</p>
      <div className="app__statusbar">
        <p
          className={`app__status${liveRejection ? " app__status--warning" : ""}`}
          role="status"
        >
          {statusText}
        </p>
        {game && (
          // The running score, up beside the boards rather than only in the log. Not a
          // live region: the status line beside it already announces each shot.
          <p className="app__tally">
            <span>
              You <b>{playerShots}</b>
            </span>
            <span aria-hidden="true">·</span>
            <span>
              Enemy <b>{aiShots}</b>
            </span>
          </p>
        )}
      </div>

      <main className="app__main">
        <div className="app__field">
          <div className="app__boards">
            <section className="panel">
              <Board
                label="Your waters"
                board={
                  battle.phase === "placement" ? placementBoard : game!.player
                }
                revealShips
                interactive={battle.phase === "placement"}
                onCellClick={handlePlacementClick}
                onCellEnter={
                  battle.phase === "placement" ? enterCell : undefined
                }
                onCellLeave={leaveBoard}
                flashKey={liveRejection?.nonce}
                flashCells={liveRejection?.cells}
                highlightShip={
                  battle.phase === "placement" ? highlighted : null
                }
                shakeKey={playerStruck}
                lastShot={
                  lastAiShot
                    ? { row: lastAiShot.row, col: lastAiShot.col }
                    : null
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
                  {/*
                    The orientation is on the button because the only other sign of it is
                    the hover ghost, which touch and keyboard users never see.
                  */}
                  <button type="button" className="button" onClick={rotate}>
                    Rotate (R) ·{" "}
                    <span className="button__state">
                      {orientation === "horizontal" ? "Horizontal" : "Vertical"}
                    </span>
                  </button>
                  <button
                    type="button"
                    className="button"
                    onClick={() => {
                      battle.randomizeFleet();
                      resetPlacementUi(null);
                    }}
                  >
                    Randomize
                  </button>
                  <button
                    type="button"
                    className="button"
                    onClick={() => {
                      battle.clearFleet();
                      resetPlacementUi(FLEET[0].id);
                    }}
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
                    highlighted={highlighted}
                    onHover={setHighlighted}
                    onSelect={(shipId) =>
                      placedIds.has(shipId)
                        ? pickUp(shipId)
                        : setSelected(shipId)
                    }
                  />
                  <p className="hint">
                    Press <kbd>R</kbd> to rotate. Click a placed ship to pick it
                    up again.
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
                    shakeKey={enemyStruck}
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
          </div>

          <aside className="panel panel--log">
            <Log entries={game?.log ?? []} />
          </aside>
        </div>
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
            onClick={() => {
              battle.newGame();
              resetPlacementUi(null);
            }}
          >
            Play again
          </button>
        </div>
      )}
    </div>
  );
}
