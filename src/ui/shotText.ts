import type { LogEntry } from "../engine/game";
import { coordLabel, specFor } from "../engine/types";

/**
 * One shot, in words. Shared by the log and the status line so the sentence a screen
 * reader hears is the same one printed on screen, written in one place.
 */
export function describeShot(entry: LogEntry): string {
  const who = entry.side === "player" ? "You" : "Enemy";
  const target = coordLabel(entry.row, entry.col);
  if (entry.result === "miss") return `${who} fired at ${target} — miss.`;
  if (entry.result === "hit") return `${who} fired at ${target} — hit!`;
  const ship = entry.shipId ? specFor(entry.shipId).name : "ship";
  return entry.side === "player"
    ? `${who} fired at ${target} — sank the enemy ${ship}!`
    : `${who} fired at ${target} — your ${ship} is sunk!`;
}
