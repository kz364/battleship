import type { ShipId } from "../engine/types";

/**
 * Ship art lives in `public/ships/`. BASE_URL keeps these working under the GitHub
 * Pages subpath as well as at the root in dev.
 */
export function spriteUrl(shipId: ShipId): string {
  return `${import.meta.env.BASE_URL}ships/${shipId}.png`;
}
