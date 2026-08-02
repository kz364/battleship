import type { LogEntry } from "../engine/game";
import { coordLabel, specFor } from "../engine/types";

function describe(entry: LogEntry): string {
  const who = entry.side === "player" ? "You" : "Enemy";
  const target = coordLabel(entry.row, entry.col);
  if (entry.result === "miss") return `${who} fired at ${target} — miss.`;
  if (entry.result === "hit") return `${who} fired at ${target} — hit!`;
  const ship = entry.shipId ? specFor(entry.shipId).name : "ship";
  return entry.side === "player"
    ? `${who} fired at ${target} — sank the enemy ${ship}!`
    : `${who} fired at ${target} — your ${ship} is sunk!`;
}

// Newest first, so the entry you care about is always at the top of the panel. The
// previous chronological order needed scrollIntoView to keep up, which also scrolled
// every scrollable ancestor -- including the page, whenever the log ran below the fold.
export function Log({ entries }: { entries: LogEntry[] }) {
  const newestFirst = entries
    .map((entry, index) => ({ entry, index }))
    .reverse();

  return (
    <div className="log">
      <h2 className="log__title">Ship&apos;s Log</h2>
      {/*
        The log is the only place a shot's outcome is written down -- the status line
        says "Your move." and nothing about what just happened -- so without a live
        region a screen reader plays the game blind. Keys are the chronological index,
        so a new shot inserts one node rather than rewriting every row's text, and
        exactly one entry gets announced.
      */}
      <ol className="log__list" reversed aria-live="polite">
        {entries.length === 0 && (
          <li className="log__entry log__entry--quiet">Awaiting orders.</li>
        )}
        {newestFirst.map(({ entry, index }) => (
          <li
            key={index}
            className={`log__entry log__entry--${entry.side} log__entry--${entry.result}`}
          >
            {describe(entry)}
          </li>
        ))}
      </ol>
    </div>
  );
}
