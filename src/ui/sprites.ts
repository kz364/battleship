import type { ShipId } from "../engine/types";

/**
 * Ship art lives in `public/ships/`. BASE_URL keeps these working under the GitHub
 * Pages subpath as well as at the root in dev.
 */
export function spriteUrl(shipId: ShipId): string {
  return `${import.meta.env.BASE_URL}ships/${shipId}.png`;
}

/**
 * Width divided by height of each source image, pinned here so a hull can be drawn at
 * its own proportions rather than stretched to fill its squares. `sprites.test.ts` reads
 * the PNG headers and fails if the art and these numbers ever disagree.
 */
export const SPRITE_ASPECT: Record<ShipId, number> = {
  carrier: 900 / 220,
  battleship: 900 / 169,
  cruiser: 893 / 152,
  submarine: 889 / 179,
  destroyer: 795 / 178,
};

/**
 * How tall to draw a hull, in cells. Its length in cells is fixed by the squares it
 * occupies, so the height follows from the art's aspect — except where that would
 * exceed one cell and spill into the neighbouring row, which the Carrier's beam does.
 */
export function hullHeight(shipId: ShipId, length: number): string {
  const cells = Math.min(1, length / SPRITE_ASPECT[shipId]);
  return `calc(var(--cell) * ${cells.toFixed(4)})`;
}
