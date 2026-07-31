import { useEffect, useRef } from "react";
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

export function Log({ entries }: { entries: LogEntry[] }) {
  const endRef = useRef<HTMLLIElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "nearest" });
  }, [entries.length]);

  return (
    <div className="log">
      <h2 className="log__title">Ship&apos;s Log</h2>
      <ol className="log__list">
        {entries.length === 0 && (
          <li className="log__entry log__entry--quiet">Awaiting orders.</li>
        )}
        {entries.map((entry, index) => (
          <li
            key={index}
            className={`log__entry log__entry--${entry.side} log__entry--${entry.result}`}
            ref={index === entries.length - 1 ? endRef : undefined}
          >
            {describe(entry)}
          </li>
        ))}
      </ol>
    </div>
  );
}
