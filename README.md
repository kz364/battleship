# Battleship

Classic 10×10 Battleship against an AI that plays close to optimally, running entirely in
the browser. No backend, no accounts, no network calls after the page loads.

**▶ Play: https://kz364.github.io/battleship/**

**🐞 Debugging log: [DEBUGGING.md](DEBUGGING.md)** — every bug found while building this,
how it was caught, and how it was fixed.

## The game

- Standard fleet: Carrier 5, Battleship 4, Cruiser 3, Submarine 3, Destroyer 2.
- Place your fleet by hand (click a ship, click the grid, `R` to rotate, click a placed
  ship to pick it up again), or hit **Randomize** and go.
- Two skins: a skeuomorphic plastic-and-pegs **Classic** board, and a phosphor-green
  **Retro** CRT terminal with scanlines. The choice is remembered in `localStorage`.

## The opponent

Three difficulties, all driven by the same engine and the same information a human
player would have (shot history plus which ships have sunk — never the live ship
positions):

| Difficulty    | Strategy                                                                  | Median shots to clear a board |
| ------------- | ------------------------------------------------------------------------- | ----------------------------- |
| **Ensign**    | Fires at a uniformly random un-fired cell.                                | 97                            |
| **Commander** | Checkerboard hunt, then chases adjacent cells around a wounded ship.      | 53                            |
| **Admiral**   | Rebuilds a probability-density heat map every turn and fires at the peak. | 44                            |

Numbers are medians measured over 100,000 simulated games per difficulty (`npm run sim
-- --games=100000`), not estimates. 17 shots is the theoretical minimum.

**How the heat map works.** For each ship still afloat, enumerate every legal placement
on the board, discard any that crosses a known miss or a sunk ship, and add 1 to each
cell it covers. Placements that also cover a known-but-unsunk hit are weighted 10× per
hit. Fire at the highest-scoring un-fired cell, breaking ties randomly.

This single rule subsumes both classical modes: with no hits on the board the map comes
out as a checkerboard (hunting), and the moment something is wounded the weighting
collapses the map onto the cells that would complete that ship (targeting). It is greedy
— it maximises P(hit) this turn rather than minimising total turns — which is why it is
near-optimal rather than optimal. Battleship is not a solved game.

Both sides place their fleets uniformly at random over legal configurations, so the AI
has no placement habits for a human to learn.

## Running it

```bash
npm install
npm run dev        # http://localhost:5173
npm test           # engine + AI unit tests and strength regressions
npm run sim -- --games=10000 --seed=1
npm run build
```

Requires Node 20.19+ or 22.12+.

## Code layout

| Path                     | What lives there                                                                                                       |
| ------------------------ | ---------------------------------------------------------------------------------------------------------------------- |
| `src/engine/`            | Pure, immutable rules: board, placement legality, `fire()`, win detection, seeded RNG. Zero React.                     |
| `src/ai/`                | `view.ts` (what an attacker is allowed to see), `density.ts` (the heat map), `strategies.ts` (the three difficulties). |
| `src/sim/`               | Headless self-play harness and its CLI, used for the numbers above and for CI regressions.                             |
| `src/ui/`                | React components and the `useBattle` hook. The UI is a view over engine state and holds no rules of its own.           |
| `tools/prepare-ships.py` | Chroma-keys the generated ship art onto transparency. Run once; output is committed to `public/ships/`.                |

The engine being React-free is what makes the AI testable: `src/sim/` plays tens of
thousands of games in Node against exactly the code that runs in the browser.

## Deployment

Pushes to `main` build and publish to GitHub Pages via
[`.github/workflows/deploy.yml`](.github/workflows/deploy.yml). Vite is configured with a
relative `base` so the bundle works from the `/battleship/` subpath without hardcoding
the repo name.

## Licence

MIT.
