import type { LogEntry } from "../engine/game";
import { describeShot } from "./shotText";

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
        Not a live region. The status line above the boards now reads out each shot as
        it lands, and two regions carrying the same sentence means hearing every shot
        twice. This is the written record you can go back and read.
      */}
      <ol className="log__list" reversed>
        {entries.length === 0 && (
          <li className="log__entry log__entry--quiet">Awaiting orders.</li>
        )}
        {newestFirst.map(({ entry, index }) => (
          <li
            key={index}
            className={`log__entry log__entry--${entry.side} log__entry--${entry.result}`}
          >
            {describeShot(entry)}
          </li>
        ))}
      </ol>
    </div>
  );
}
