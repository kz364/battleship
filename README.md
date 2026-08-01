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

This single rule subsumes both classical modes without a mode flag: the moment something
is wounded, the 10× weighting collapses the map onto the cells that would complete that
ship (targeting), and the rest of the time it hunts. It is greedy — it maximises P(hit)
this turn rather than minimising total turns — which is why it is near-optimal rather
than optimal. Battleship is not a solved game.

**What the map actually looks like while hunting.** On an empty board it is a smooth
centre-weighted bowl, not a checkerboard — corners score 10 because few placements reach
them, the four centre cells score 34, and the two colours of the board sum to exactly the
same total:

```
  10  15  19  21  22  22  21  19  15  10
  15  20  24  26  27  27  26  24  20  15
  19  24  28  30  31  31  30  28  24  19
  21  26  30  32  33  33  32  30  26  21
  22  27  31  33  34  34  33  31  27  22
  22  27  31  33  34  34  33  31  27  22
  ...                          (symmetric)
```

So Admiral opens in the middle. Parity is _emergent_ rather than designed: a miss
invalidates every placement running through it, so cells next to a miss lose more
candidates than cells a step further out, and the peaks drift apart as the board fills.
Firing 30 hunting shots at an empty ocean puts 24 of them on one colour — a checkerboard
tendency the rule was never told about. Explicit parity belongs to **Commander**, which
literally filters its candidate cells to one colour; Admiral rediscovers the same idea
from the placement counts.

Neither side's fleet is sampled uniformly over complete legal configurations — see
`randomFleet()`. It is random and legal, and it has no habits a human could learn, but
the sequential placement order does skew the distribution.

## Running it

```bash
npm install
npm run dev        # http://localhost:5173
npm test           # engine + AI unit tests and strength regressions
npm run sim -- --games=10000 --seed=1
npm run fuzz -- --games=500
npm run build

npx playwright install chromium   # once
npm run test:e2e   # browser tests, desktop + Pixel 5 viewport
npm run test:e2e:ui
```

Requires Node 20.19+ or 22.12+.

The end-to-end suite in [`e2e/`](e2e) builds the app and drives the real thing. It exists
because most of the bugs in [DEBUGGING.md](DEBUGGING.md) were visual — a duplicated peg, a
CSS rule silently out-specified, a click handler on a `pointer-events: none` layer — and
none of those are reachable from a unit test. So it asserts on computed styles and peg
geometry rather than on screenshots, and covers placement, pickup, turn alternation,
victory and replay, both themes, and a phone viewport.

Add `?seed=123` to the URL to make a session reproducible: both fleets and every AI choice
follow from it. That is how the tests get fixed board layouts, and it is the easiest way
to report a bug against an exact game.

## Code layout

| Path                     | What lives there                                                                                                       |
| ------------------------ | ---------------------------------------------------------------------------------------------------------------------- |
| `src/engine/`            | Pure, immutable rules: board, placement legality, `fire()`, win detection, seeded RNG. Zero React.                     |
| `src/ai/`                | `view.ts` (what an attacker is allowed to see), `density.ts` (the heat map), `strategies.ts` (the three difficulties). |
| `src/sim/`               | Headless self-play harness and its CLI, used for the numbers above and for CI regressions.                             |
| `src/ui/`                | React components and the `useBattle` hook. The UI is a view over engine state and holds no rules of its own.           |
| `e2e/`                   | Playwright specs against the production build, asserting on computed styles and geometry rather than screenshots.      |
| `tools/prepare-ships.py` | Chroma-keys the generated ship art onto transparency. Run once; output is committed to `public/ships/`.                |

The engine being React-free is what makes the AI testable: `src/sim/` plays tens of
thousands of games in Node against exactly the code that runs in the browser.

## Deployment

Pushes to `main` build and publish to GitHub Pages via
[`.github/workflows/deploy.yml`](.github/workflows/deploy.yml). Vite is configured with a
relative `base` so the bundle works from the `/battleship/` subpath without hardcoding
the repo name.

Deployment is gated on the checks passing. Both `ci.yml` and `deploy.yml` call the same
reusable [`checks.yml`](.github/workflows/checks.yml) — lint, typecheck, unit tests, a
500-game fuzz, the build and the Playwright suite — and the Pages job runs only once it
has gone green, so nothing can publish past a failing test.

## Licence

MIT.
