# Debugging log

A running log kept while building this game, not a write-up from memory afterwards. The
summary below is the whole story in one page; the [appendix](#appendix--full-write-ups)
gives each bug in full, with the offending code inline, so nothing has to be taken on
trust or reconstructed from an old commit.

Nothing here is invented. Where a "bug" turned out not to be one, that is recorded too
([#8](#8-what-the-fuzzer-did-not-find)), because the investigation is the interesting
part.

## Summary

| #                                                                         | Bug                                                                         | How it was found                                      | Root cause                                                                                                                         | Fix                                                                                       |
| ------------------------------------------------------------------------- | --------------------------------------------------------------------------- | ----------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| [1](#1-npm-test-couldnt-run-at-all-cannot-find-native-binding)            | `npm test` died before running a single test                                | First `npm test` after scaffolding                    | Vite 8 / Vitest 4 preview line bundles native Rolldown binaries; npm's optional-dependency bug skipped the Linux one               | Pinned the stable, pure-JS toolchain: Vite 7, Vitest 3, TS 5.9                            |
| [2](#2-tsc--b-failed-on-the-simulator-cli)                                | `tsc -b` couldn't find `process`                                            | `npm run typecheck`                                   | The CLI is Node code, but only DOM typings were installed                                                                          | Added `@types/node` and a `tsconfig.node.json` project for the non-browser sources        |
| [3](#3-the-ai-was-measurably-stronger-than-the-number-written-on-the-tin) | Hard AI won in 44 shots where the cited benchmark says 42; medium 53 not 64 | 100k-game `npm run sim`                               | Not a bug. The published figures assume a weaker parity rule and a different fleet; the code was audited for cheating and is clean | Kept the algorithm, corrected the numbers in the UI and pinned them with regression tests |
| [4](#4-ships-had-a-pink-halo)                                             | Ship sprites had a magenta fringe                                           | Looking at the rendered board                         | Chroma-keying only removed exact-match pixels, leaving anti-aliased edge blends                                                    | Key on `r > g && b > g` and neutralise, rather than matching one colour                   |
| [5](#5-invalid-css-that-the-build-was-happy-to-ship)                      | Shadows silently missing                                                    | Re-reading the diff                                   | Corrupted declarations (`#1d3консольpx`) — CSS discards a bad declaration and carries on                                           | Repaired the declarations                                                                 |
| [6](#6-the-enemy-fleet-panel-told-you-which-ship-you-had-hit)             | Enemy roster showed live damage pips, so a hit named its ship               | Playing in the browser                                | The roster rendered true damage for both fleets                                                                                    | `concealDamage`: pips only appear once the ship sinks                                     |
| [7](#7-the-ai-secretly-picked-two-shots-every-turn)                       | AI drew from the RNG twice per turn, so seeded games were unreproducible    | Browser instrumentation of the RNG                    | `chooseShot()` ran inside a `setGame` updater, and React Strict Mode invokes updaters twice                                        | Choose the coordinate before entering the updater                                         |
| [8](#8-what-the-fuzzer-did-not-find)                                      | (No bug — 6,000 fuzzed games, every invariant held)                         | `npm run fuzz`                                        | —                                                                                                                                  | Kept as a regression net; documents what it cannot see                                    |
| [9](#9-every-fired-cell-grew-a-second-dot)                                | Two dots on every fired cell in Classic                                     | Someone else playing the deployed game                | The peg socket was a grid **sibling** of the peg instead of sitting behind it                                                      | `position: absolute` on the socket, taking it out of flow                                 |
| [10](#10-click-a-placed-ship-to-pick-it-up-again-did-nothing)             | Clicking a placed hull did nothing, despite the instruction to              | Scripted browser pass                                 | The handler lived on the hull layer, which is deliberately `pointer-events: none`                                                  | Resolve pickup from the cell button via `placementAt()`                                   |
| [11](#11-retro-wrecks-looked-exactly-like-live-ships)                     | Sunk ships looked identical to live ones in Retro                           | Scripted browser pass, comparing computed `filter`    | `.app[data-theme='retro'] .ship img` out-specified `.ship--sunk img`, so the tint was dropped whole                                | Theme-qualified selectors for the sunk, ghost and invalid states                          |
| [12](#12-a-rejected-placement-said-nothing-at-all)                        | Placing a Carrier at J10 failed silently on touch and keyboard              | Review of the deployed game                           | The only feedback was a hover-only red ghost; the UI ignored `placeShip()` returning `false`                                       | `placementProblem()` explains _why_; the status line announces it and the cells flash     |
| [13](#13-two-things-the-readme-claimed-that-were-not-true)                | README and a code comment described the AI incorrectly                      | Review, then checked by running the code              | Fleets are random but not uniformly sampled; the empty density map is centre-weighted, not a checkerboard                          | Corrected both, and locked the description down with tests that assert the real shape     |
| [14](#14-the-fix-for-12-reported-every-successful-placement-as-a-failure) | Every _legal_ placement also flashed "can't go there"                       | Browser pass — the new E2E suite was green throughout | `placeShip()` returned a flag captured inside a `setFleet` updater, which React may run after the dispatch returns                 | Decide legality in the callback, before dispatching; assert on the status synchronously   |
| [15](#15-the-log-scrolled-the-page-out-from-under-you)                    | Each new log entry scrolled the whole page down mid-game                    | Someone else playing it                               | The log called `scrollIntoView` to follow its newest entry, which scrolls _every_ scrollable ancestor, the document included       | Show newest first, so there is nothing to scroll to                                       |
| [16](#16-the-difficulty-blurbs-did-not-say-whose-fleet-was-being-sunk)    | "~53 shots" did not say whose shots, and Easy was worded differently        | Someone else playing it                               | The blurb quoted a number with no subject, so it read as the player's budget                                                       | One phrasing across all three, and a test pinning each number to the simulator            |

**How things get caught here, roughly in order of how much they found:**

| Tool                                  | What it is                                                                                         | What it caught              |
| ------------------------------------- | -------------------------------------------------------------------------------------------------- | --------------------------- |
| Playing the game in a browser         | Manual play, ~40 turns per pass                                                                    | #6, #7                      |
| Someone else playing it               | A pair of eyes that hadn't seen it before                                                          | #9, #12, #13, #14, #15, #16 |
| `npm run test:e2e`                    | Playwright, 38 checks over desktop and a phone viewport, asserting on computed styles and geometry | #10, #11, and it missed #14 |
| `npm run sim`                         | 100k headless games per difficulty, measures shot counts                                           | #3                          |
| `npm run fuzz`                        | Invariant checker over full games (see [#8](#8-what-the-fuzzer-did-not-find))                      | nothing — see #8            |
| `npm test`                            | 41 unit tests, including AI strength and heat-map shape regressions                                | guarded #3's fix            |
| `npm run typecheck` / `npm run build` | tsc + Vite                                                                                         | #2                          |
| Reading the diff back                 | —                                                                                                  | #5                          |

Three of these (#5, #9, #11) are CSS, and none could have been caught by types, lint,
unit tests or the build — which is why the browser pass that found them is now a
committed Playwright suite rather than a story about one. It asserts on computed styles
and peg geometry, in both themes, because that is the only level at which those bugs are
visible.

---

# Appendix — full write-ups

## 1. `npm test` couldn't run at all: "Cannot find native binding"

**Symptom.** The very first test run, on a freshly scaffolded project, died before
executing a single test:

```
Error: Cannot find native binding.
npm has a bug related to optional dependencies
Cannot find module '@rolldown/binding-wasm32-wasi'
```

**How it was found.** First `npm test` after scaffolding with `npm create vite`.

**Root cause.** Two things compounding. The Vite scaffold had installed the current
preview line — Vite 8 / Vitest 4 — which bundles with Rolldown, a native (Rust) bundler
shipped as per-platform optional dependencies. npm has a
[long-standing bug](https://github.com/npm/cli/issues/4828) where optional dependencies
are silently skipped when a lockfile is generated on a different platform, so the
Linux binary was never installed and the WASM fallback wasn't installed either.

**What was tried first, and why it wasn't good enough.** Deleting `node_modules` and
`package-lock.json` and reinstalling — the standard fix for that npm bug — did not help.
Installing the binary by hand did:

```bash
npm i @rolldown/binding-linux-x64-gnu@1.2.1 --no-save
```

but `--no-save` means it isn't in the lockfile, so CI and any reviewer cloning the repo
would hit exactly the same wall. A fix that only works on my machine isn't a fix.

**Fix.** Dropped off the preview line entirely and pinned the stable, pure-JS toolchain
in `package.json`: Vite 7, Vitest 3, TypeScript 5.9. No native binaries, nothing for the
npm optional-dependency bug to drop.

**Judgement call.** Worth noting this was a toolchain bug, not a game bug — but it's in
the log because "the tests don't run" was the actual first blocker, and papering over it
with `--no-save` would have shipped a repo that fails on a clean clone.

---

## 2. `tsc -b` failed on the simulator CLI

**Symptom.**

```
src/sim/cli.ts(4,22): error TS2591: Cannot find name 'process'.
error TS2688: Cannot find type definition file for 'node'.
```

**How it was found.** First `npm run typecheck` after the simulator was written. Note
that `npm test` and `npm run dev` were both perfectly happy — Vitest and Vite strip types
rather than checking them, so this only surfaced on an explicit typecheck.

**Root cause.** `src/sim/cli.ts` reads `process.argv`, but the project only had DOM and
browser types. `tsconfig.node.json` referenced the `node` types library without
`@types/node` being installed.

**Fix.** `npm i -D @types/node`.

**Consequence for CI.** This is exactly why `npm run typecheck` is a separate CI step
from `npm test` — a green test suite says nothing about whether the project compiles.

---

## 3. The AI was measurably stronger than the number written on the tin

**Symptom.** The UI advertised the difficulty levels using figures from the standard
public reference for Battleship strategy (Nick Berry's
[DataGenetics analysis](https://datagenetics.com/blog/december32011/index.html), 100M
simulated games): random ≈ 97 shots, hunt/target ≈ 65, hunt/target + parity ≈ 64,
probability density ≈ 42. Those numbers were taken on faith while planning.

Measuring this implementation gave something different:

```
$ npm run sim -- --games=100000 --seed=1

difficulty   mean   median   min   max
easy         95.4       97    50   100
medium       51.4       53    19    70
hard         44.6       44    18    73
```

Easy landed on the published 97. Medium came out at **53, not 64** — eleven shots better
than the reference. Hard came out at **44, not 42** — two worse.

**How it was found.** `npm run sim -- --games=100000`. At 100k games the standard error
on the mean is about 0.03 shots, so neither gap is noise.

**Why this was worth chasing.** A medium AI beating its published benchmark by eleven
shots is exactly the shape of a cheating bug — if `chooseShot` could see unsunk ship
positions, or if the "hunt" phase were quietly consulting the answer, you'd see numbers
that are too good. That had to be ruled out before the numbers could be believed.

**Investigation.** Three checks:

1. **Can the AI see anything it shouldn't?** The AI never touches a `Board`. It is handed
   an `OpponentView`, which is constructed to contain only what a human opponent learns:

   ```ts
   export interface OpponentView {
     shots: CellShot[][]; // 'hit' | 'miss' | null, per cell
     sunkCells: boolean[][]; // revealed only once a ship is fully destroyed
     remaining: number[]; // lengths still afloat — announced by the rules
   }
   ```

   `viewOf(board)` derives these and structurally cannot leak an unsunk ship's position,
   because it never reads `board.placements` except through `sunkShipIds`.

2. **Is it playing legally?** `npm run fuzz` (entry #8) plays thousands of complete games
   asserting no repeated shots, no out-of-bounds shots, and no game exceeding 100 shots.
   All clean.

3. **Do the strategies do what they claim?** Unit tests in `src/ai/ai.test.ts` assert that
   medium fires on-parity while hunting, switches to adjacent cells once something is
   wounded, and that the density map scores impossible pockets at zero.

**Conclusion — not a bug in the code, a bug in the documentation.** The two gaps have
different, mundane explanations:

- **Medium (53 vs 64).** The reference's 64-shot figure is parity hunting plus _plain_
  adjacent targeting. This implementation's target mode additionally prefers cells that
  extend two or more collinear hits, since a ship is a straight line — so once it has two
  hits in a row it stops poking at the perpendicular neighbours. That's a real
  improvement, and it's why medium sits much closer to hard than the reference suggests.
- **Hard (44 vs 42).** The reference's 42 comes from counting whole legal _fleet_
  configurations. This implementation sums per-ship placements independently, which is
  far cheaper (a few ms per turn, so no worker or server needed) and slightly less
  informed. Two shots is the price.

**Fix.** The code was left alone; the claims about it were corrected. The UI blurbs now
quote measured values:

```ts
export const DIFFICULTY_BLURBS: Record<Difficulty, string> = {
  easy: "Fires blind. Clears a board in ~97 shots.",
  medium: "Hunts on a checkerboard, then finishes what it starts. ~53 shots.",
  hard: "Rebuilds a probability heat map every turn. ~44 shots.",
};
```

and `src/sim/simulate.test.ts` now regression-guards the _measured_ medians rather than
the borrowed ones, with bounds wide enough not to flake at the 1,000 games CI runs
(σ ≈ 0.3 shots on the mean):

```ts
// Bounds set around medians measured over 100k games (easy 97, medium 53, hard 44).
expect(medium.median).toBeGreaterThan(45);
expect(medium.median).toBeLessThan(62);
```

**The general lesson,** and the reason this entry is long: the failure mode here wasn't
broken code, it was shipping a claim nobody had checked. Had the numbers not been
measured, the game would have shipped telling players the medium AI needs 64 shots when
it needs 53.

---

## 4. Ships had a pink halo

**Symptom.** The generated ship sprites, composited onto the board, had a visible magenta
fringe around every hull edge.

**How it was found.** Looking at the first chroma-keyed sprites side by side before
wiring them into the UI.

**Root cause.** The art was generated on a pure-magenta backdrop for chroma-keying. The
first pass of `tools/prepare-ships.py` only tested for _saturated_ magenta:

```py
def is_magenta(r, g, b):
    return r > 150 and b > 150 and g < 110 and (r - g) > 70 and (b - g) > 70
```

That correctly removes the backdrop, but antialiased edge pixels are a _blend_ of hull
grey and backdrop magenta — say `(150, 120, 150)` — which fails every one of those
thresholds and survives as an opaque pink outline.

**Fix.** A second pass over the surviving pixels. The hulls are neutral grey, so on a
correctly-keyed sprite no pixel should have both red and blue above green; any that does
is carrying backdrop spill, and clamping the two down to green neutralises it without
touching the hull:

```py
elif r > g and b > g:
    # Magenta spill on the antialiased hull edge. The plastic is neutral grey, so any
    # pixel where red and blue both exceed green is picking up the backdrop; clamping
    # them down to green removes the pink halo.
    pixels[x, y] = (g, g, g, a)
```

**Note.** This only works because the subject happens to be grey. It's documented in the
script rather than generalised, since re-running it on coloured art would eat the colour.

---

## 5. Invalid CSS that the build was happy to ship

**Symptom.** Three declarations in `src/styles/app.css` contained corrupted values —
mangled fragments like `#1d3консольpx` and `#0d insetpx` in box-shadow and colour slots,
introduced during a large edit to the stylesheet.

**How it was found.** Reading the file back after writing it. **Not** by any automated
check — and that's the point of this entry.

**Why nothing caught it.** CSS is specified to be forgiving: a parser encountering an
invalid declaration drops that one declaration and carries on. So `npm run build`
succeeded, the bundle was produced, and the page rendered — just with a few shadows and
tints silently missing. There is no compile error to fail CI on. The only signals would
have been (a) reading the diff, or (b) noticing something looked slightly flat in the
browser, which is easy to miss when you have never seen the correct version.

**Fix.** Corrected by hand to valid values, e.g.:

```css
.app[data-theme="classic"] {
  --button-bg: linear-gradient(180deg, #33557a 0%, #1d354f 100%);
  --button-edge: #0b1826;
  --sunk-tint: grayscale(0.5) brightness(0.55);
}
```

**Takeaway.** Everything else in this project has a machine checking it — types, tests,
lint, simulation. CSS has none of that, so it's the one place where reading the diff is
still the only defence.

---

## 6. The enemy fleet panel told you which ship you had hit

**Symptom.** Playing a game in the browser, the "Enemy fleet" roster lit up damage pips
per ship as soon as a shot landed: three hits scattered across the board showed as one
pip on Battleship, two on Submarine, one on Destroyer. Before sinking anything, the
player could already tell which ships were wounded and how badly.

**How it was found.** Playing a full game against Admiral in the browser and watching the
right-hand panel. No test would have caught this: every unit test passed, the game logic
was completely correct, and the rendering did exactly what the component was told to do.

**Root cause.** Both rosters were rendered by the same component reading the same field:

```tsx
<Roster title="Your fleet"  board={game.player} />
<Roster title="Enemy fleet" board={game.ai} />
```

```tsx
const damage = board ? board.damage[spec.id] : 0;
```

`board.damage` is the _engine's_ bookkeeping — ground truth about which ship absorbed
which hit. That is fine to show for your own fleet, where you're allowed to know. For the
enemy fleet it hands the player information the real game never gives: Battleship's rules
tell you only "hit", and then later "you sank my Cruiser". Knowing that a live hit belongs
to the Submarine tells you the ship is 3 long, which meaningfully narrows where the rest
of it is.

Worth stressing that this is an asymmetry bug, not a cosmetic one: the AI plays through
`OpponentView`, which deliberately withholds exactly this information (see #3). So the
human was playing with strictly more information than the AI — the game was easier than
intended and the difficulty numbers didn't describe the game being played.

**Fix.** An explicit opt-in on the roster, so the concealment is visible at the call site
rather than implied:

```tsx
/**
 * Hides per-ship damage until the ship sinks. Real Battleship only tells you
 * "hit" and later "you sank my Cruiser" — never which ship a live hit belongs to.
 */
concealDamage?: boolean;
```

```tsx
const trueDamage = board ? board.damage[spec.id] : 0;
const damage = concealDamage ? (sunk ? spec.length : 0) : trueDamage;
```

```tsx
<Roster title="Enemy fleet" board={game.ai} concealDamage />
```

The enemy roster now shows nothing until a ship goes down, at which point it fills all its
pips and strikes through — matching the ship's hull becoming visible on the enemy grid.

**Verified in the browser afterwards:** with hits standing on C3, C5, F2, H2 and G3 the
enemy roster showed no pips at all; sinking the Battleship at B1–B4 lit its four pips and
revealed its hull. Correct on both counts.

---

## 7. The AI secretly picked two shots every turn

**Symptom.** None visible. The game looked right: one player shot, one enemy shot, correct
results, correct log. This one was found by suspicion rather than by symptom.

**How it was found.** While reviewing `useBattle.ts` I noticed the AI's move was being
chosen _inside_ a React state updater:

```ts
setGame((current) => {
  if (!current || current.phase !== "playing" || current.turn !== "ai")
    return current;
  return applyShot(
    current,
    "ai",
    chooseShot(viewOf(current.player), difficulty, rng),
  );
});
```

React requires state updaters to be pure, and in development Strict Mode it deliberately
invokes them twice to catch code that isn't. `chooseShot` draws from a seeded RNG whose
internal state advances on every call — so it is not pure, and this should be firing
twice per turn. Rather than assume, I instrumented it:

```ts
console.log("updater ran", rng.next());
```

and took one turn in the browser:

```
[log] updater ran 0.5238947693724185
[log] updater ran 0.6213869142811745
```

Two invocations, two different RNG draws. Confirmed.

**Root cause.** `chooseShot` was doing real work with real side effects inside a function
React treats as pure and replayable. Each AI turn therefore ran the whole
probability-density computation twice and consumed two RNG draws where the engine's own
accounting assumes one. React keeps the result of the last invocation, so the _visible_
behaviour was correct and the game never fired two shots — which is precisely why this
would never have shown up in play, and why it would have been miserable to debug later
when the sequence of AI moves failed to reproduce from a fixed seed.

**Fix.** Hoist the decision out of the updater. The effect already closes over the current
`game`, so nothing is lost:

```ts
const timer = setTimeout(() => {
  const coord = chooseShot(viewOf(game.player), difficulty, rng);
  setGame((current) => {
    if (!current || current.phase !== "playing" || current.turn !== "ai")
      return current;
    return applyShot(current, "ai", coord); // pure: same input, same output
  });
  setAiThinking(false);
}, AI_THINKING_MS);
```

**Dead code removed alongside it.** The same effect carried a ref meant to stop Strict
Mode from double-scheduling the AI turn:

```ts
const scheduled = useRef<Side | null>(null);
// ...
if (scheduled.current === "ai") return;
scheduled.current = "ai";
// ...
return () => {
  clearTimeout(timer);
  scheduled.current = null;
};
```

It never fired. The cleanup sets the ref back to `null` before the effect re-runs, so the
guard is always false on the second pass — the `clearTimeout` was doing all the work by
itself. Worse than useless: it read as protection against a double-turn bug that it would
not actually have prevented, which is how you end up trusting the wrong line of code.
Deleted, with a comment recording what the real hazard is:

```ts
// The AI's turn, on a timer so the player can watch their own shot land first.
// chooseShot() draws from the shared RNG, so it has to run out here rather than inside
// the setGame updater: React invokes updaters twice under Strict Mode, which would
// advance the RNG twice per turn and make the AI's choices unreproducible.
```

**Re-verified** in the browser after the change: one AI shot per turn, log entries
alternating correctly.

---

## 8. What the fuzzer did _not_ find

Not a bug — recorded because "we looked and found nothing" is evidence too, and because
the tool built for entry #3 is worth describing.

Unit tests check hand-built positions. They can't tell you whether a hundred thousand
_real_ games stay legal. `src/sim/fuzz.ts` plays complete games with random fleets at
every difficulty and audits the board after every single shot:

- every shot lands in bounds;
- no cell is ever fired at twice;
- the board's shot count matches the number of shots taken;
- each ship's recorded `damage` equals the number of its own cells showing `hit`;
- `isSunk` is true exactly when all of a ship's cells are hit;
- no game survives 100 shots (impossible on a 10×10 board).

```
$ npm run fuzz -- --games=2000 --seed=1
ok  easy: 2000 games, all invariants held
ok  medium: 2000 games, all invariants held
ok  hard: 2000 games, all invariants held
```

6,000 games, ~300,000 individual shots, no violations. That's the evidence behind the
claim in #3 that the AI plays legally, and it runs in CI at 500 games per difficulty so a
future refactor can't quietly break the accounting.

---

## 9. Every fired cell grew a second dot

**Symptom.** In the classic theme, cells that had been fired at showed **two** circles
side by side — the peg, plus a smaller empty socket next to it, both shoved off centre.
Unfired cells were fine, and the retro theme was fine.

**How it was found.** Reported by someone else playing the game: _"the ui looks kinda
funky with two dots on each block for our view"_, followed by _"it isn't here now but it
was there in the previous game"_. That second message is what localised it: the artefact
appears as the board fills up and is invisible on a fresh one, which is why it survived
my own browser passes — I had been checking placement and firing behaviour, not staring
at an already-shot cell.

**Root cause.** A cell centres its contents with grid:

```css
.cell {
  display: grid;
  place-items: center;
}
```

The moulded peg socket is a `::before`, and the peg itself is a real element rendered
only once the cell has been fired at:

```tsx
{
  shot && <span className="peg" />;
}
```

A `::before` is a genuine child box, so with both present the cell had **two** grid items.
`place-items: center` doesn't stack them — grid laid them out in two auto columns and
centred the pair. Hence two dots. With no peg there is only one item, so an unfired cell
looked perfect, and the retro theme has no socket at all so it never showed.

**Fix.** Take the socket out of the grid flow entirely, so the peg drops _into_ it rather
than beside it. `.cell` is already `position: relative`:

```css
.app[data-theme="classic"] .cell::before {
  /* The moulded socket each peg drops into. Taken out of the grid flow so it sits
     behind the peg rather than beside it. */
  content: "";
  position: absolute;
  width: 34%;
  height: 34%;
  /* ... */
}
```

**Takeaway,** same one as entry #5: this is a CSS layout bug, so nothing in the toolchain
could have caught it — the markup is valid, the types are fine, every test passes. It also
only manifests in a state you have to _play into_. Loading the page and looking at it is
not testing it.

---

---

## 10. "Click a placed ship to pick it up again" did nothing

**Symptom.** The placement panel tells you _"Click a placed ship to pick it up again."_
Clicking a hull on your grid did nothing at all — no pickup, no error. You could only
re-position a ship by re-selecting it from the roster list.

**How it was found.** An end-to-end browser pass, from someone working through the
placement UI as documented rather than as I habitually used it. I had built the feature
and then, every time I tested, reached for the roster out of habit — so I never exercised
my own instructions.

**Root cause.** A stacking-order contradiction between two rules written at different
times. Hit-testing the hull returned `app__main`, i.e. the click passed straight through
the ship _and_ the cell. The grid layer is deliberately arranged so a peg is never hidden
behind a hull:

```css
/* Ships sit under the pegs so a hit marker is never hidden by a hull. */
.board__ships {
  z-index: 1;
  pointer-events: none;
}
.cell {
  z-index: 2;
}
```

The pickup handler, however, was mounted on the ship sprites, with a `.ship--grabbable`
class re-enabling pointer events on them:

```tsx
{
  battle.fleet.map((placement) => (
    <Ship
      placement={placement}
      onPointerDown={() => pickUp(placement.shipId)}
    />
  ));
}
```

That never wins: the cell button sits above the ship layer and swallows the click first.
The overlay was also rendering a _second_ copy of every hull purely to have something to
attach the handler to, which is what put two sprites per ship in the DOM.

**Fix.** Let the cell resolve it. The cell already knows its coordinate, and the engine
can already say which ship occupies a square, so the click handler asks:

```tsx
const handlePlacementClick = (coord: Coord) => {
  // Clicking a hull picks that ship back up. The hull sprites sit in a
  // pointer-events:none layer beneath the cell buttons, so the cell has to resolve
  // this rather than the sprite itself.
  const occupant = placementAt(battle.fleet, coord.row, coord.col);
  if (occupant) {
    pickUp(occupant.shipId);
    return;
  }
  // ...otherwise place the currently selected ship here
};
```

The duplicate grab-layer, the `onPointerDown` prop on `Ship` and the `.ship--grabbable`
rule all went with it — the visible hulls were never the right place for this.

**Note.** No z-index was touched. The original constraint (pegs above hulls) is still
correct; the mistake was attaching behaviour to the layer that had deliberately been made
inert.

---

## 11. Retro wrecks looked exactly like live ships

**Symptom.** In the retro CRT theme, a sunk ship was indistinguishable from the ships
still afloat — no dimming, no desaturation. The classic theme greyed wrecks out correctly.

**How it was found.** The same browser pass, and specifically by _measuring_ rather than
eyeballing: reading computed styles showed `.ship img` and `.ship--sunk img` resolving to
byte-identical `filter` and `opacity` values under retro. Worth stressing, because "does
that look a bit dimmer to you?" is not a test — on a green-on-black CRT theme a human
squinting at two hulls will talk themselves into seeing a difference.

**Root cause.** CSS specificity, not a wrong value. The retro theme recolours every hull
to phosphor green:

```css
.app[data-theme="retro"] .ship img {
  /* (0,2,1) */
  filter: grayscale(1) brightness(1.1) sepia(1) hue-rotate(65deg)
    saturate(2.5)...;
  opacity: 0.85;
}
```

and the sunk tint was written as a plain state class:

```css
.ship--sunk img {
  /* (0,1,1) — loses */
  filter: var(--sunk-tint) drop-shadow(...);
}
```

`filter` is a single property, so the losing rule doesn't merge — it's discarded outright
and the wreck keeps the full-brightness phosphor treatment. The classic theme has no
equivalent themed override, which is exactly why it worked and hid the problem.

The same trap had silently swallowed `.ship--ghost img` (the translucent placement
preview) and `.ship--invalid img` (the red "you can't put it there" tint) under retro.
Only the sunk case was reported; the other two were found by looking for the pattern once
the mechanism was understood.

**Fix.** Give each state tint a retro-specific selector so it matches the theme rule's
specificity, rather than bumping specificity globally or reaching for `!important`:

```css
/* The retro theme recolours every hull to phosphor green with a rule that would
   otherwise out-specify these state tints, so each one has to match its specificity. */
.ship--ghost img,
.app[data-theme='retro'] .ship--ghost img { opacity: 0.55; }

.ship--invalid img,
.app[data-theme='retro'] .ship--invalid img { ... }

.ship--sunk img,
.app[data-theme='retro'] .ship--sunk img {
  filter: var(--sunk-tint) drop-shadow(0 2px 3px rgba(0, 0, 0, 0.6));
  opacity: 0.75;
}
```

**Takeaway.** Three entries in this log (#5, #9, #11) are CSS, and none of them could be
caught by types, lint, tests or the build. A theme switcher makes it worse: every visual
state now has to be checked in _both_ themes, because a themed rule can quietly outrank a
state rule in one theme and not the other.

## 12. A rejected placement said nothing at all

**Symptom.** Clear the board, keep the Carrier horizontal, tap J10. Nothing happens. No
ship, no error, no clue — the game simply ignores you.

**How it was found.** Someone reviewing the deployed game, on the specific suspicion that
the feedback was hover-shaped.

**Root cause.** Two halves of the same mistake. The engine was right and the UI threw its
answer away:

```tsx
battle.placeShip({ shipId: spec.id, length: spec.length, ... });
```

`placeShip` returns a `boolean`. Nothing read it. The only signal that a placement was
illegal was the ghost hull turning red, and the ghost is driven by `onPointerEnter` — so
it exists for a mouse and does not exist for a finger. Keyboard users are in the same
position. The bug had been invisible during testing precisely because every test so far
had been performed with a mouse, which renders the missing feedback moot.

**Fix.** The engine now explains itself rather than just refusing:

```ts
export type PlacementProblem =
  | { kind: "off-board"; overhang: number }
  | { kind: "overlap"; blockedBy: ShipId };

export function placementProblem(placement, others): PlacementProblem | null;
```

and the UI turns that into something a person can act on, in the `role="status"` live
region that already existed — so it is spoken by a screen reader as well as shown:

> Carrier won't fit at J10 — it hangs 4 cells off the board. Rotate it, or start further in.

The cells the ship would have covered flash red for the same two seconds, which is the
part that reads at a glance. Both are input-agnostic. Two Playwright tests cover it, and
they run against a **Pixel 5 viewport** as well as desktop, because a mouse-only run is
exactly what missed this in the first place.

## 13. Two things the README claimed that were not true

**Symptom.** Not a runtime bug — a documentation bug, which is arguably worse, because
the code is right and the explanation of it is wrong.

Two claims:

1. "Both sides place their fleets **uniformly at random** over legal configurations."
2. The hunting heat map "comes out as a **checkerboard**."

**How it was found.** Review, then confirmed by actually running the code rather than
re-reading it.

**Root cause 1 — the sampler is not uniform.** `randomFleet()` places one ship at a time,
each picked uniformly from the options its predecessors left behind. That is not the same
as sampling uniformly from complete configurations: a shorter surviving option list gives
each of its members a larger share, so layouts where the early ships crowd the later ones
are over-represented. Measured exhaustively on a 4×4 board with lengths `[3, 2]`, where
all 264 legal configurations can be enumerated, 4M samples spread them over 0.90×–1.12× of
uniform — a 1.25× ratio between the most and least likely.

**Root cause 2 — the empty map is a bowl, not a checkerboard.** Printing `densityMap()`
for an empty board settles it:

```
  10  15  19  21  22  22  21  19  15  10
  15  20  24  26  27  27  26  24  20  15
  19  24  28  30  31  31  30  28  24  19
  21  26  30  32  33  33  32  30  26  21
  22  27  31  33  34  34  33  31  27  22
                (symmetric)
```

Corners score 10 because few placements reach them, the centre 34, and the two colours of
the board sum to _exactly the same total_ — the opposite of a checkerboard. Admiral's
parity tendency is **emergent**: a miss invalidates every placement running through it, so
the peaks drift apart only as the board fills. Explicit parity belongs to **Commander**,
which literally filters its candidates to one colour. The stale `~42 shots` in
`density.ts` was wrong too — this implementation measures a median of 44 over 100k games.

**Fix.** Corrected the README and both code comments, and — since prose drifts and tests
do not — added two regression tests that assert the real shape:

```ts
it("scores an empty board as a centre-weighted bowl, not a checkerboard", ...)
it("drifts onto a parity as misses accumulate, without being told to", ...)
```

**Takeaway.** Every other entry in this log was found by exercising the code. This one was
found by reading a claim and testing it, which is the one kind of bug no amount of
gameplay would ever have surfaced.

## 14. The fix for #12 reported every successful placement as a failure

**Symptom.** With [#12](#12-a-rejected-placement-said-nothing-at-all) in place, clear the
board and click A1. The Carrier lands correctly at A1–E1 and the roster advances — and the
status line simultaneously turns red with `Carrier can't go at A1.` while the five cells
under the brand-new hull flash red. Every placement, 4 attempts out of 4.

**How it was found.** A browser pass, immediately after shipping #12. Not by the test
suite — see below.

**Root cause.** The tell was that the false message was always the _generic fallback_,
`"<Ship> can't go at <Cell>."`, with no reason appended. So `placementProblem()` was
looking at the board and correctly finding nothing wrong, while `App` had already decided
the placement failed. The two disagreed because `placeShip` reported its result from
inside a state updater:

```ts
const placeShip = useCallback((placement: Placement): boolean => {
  let accepted = false;
  setFleet((current) => {
    const others = current.filter((p) => p.shipId !== placement.shipId);
    if (!isLegalPlacement(placement, others)) return current;
    accepted = true; // runs whenever React decides to run it
    return [...others, placement];
  });
  return accepted; // ...which may well be after this line
}, []);
```

React does not promise to run an updater synchronously during the dispatch. It sometimes
does, which is why this shape had sat there unnoticed since the first commit: nothing read
the return value. The moment something did, it read `false` every time.

**Fix.** Decide before dispatching, so the answer cannot depend on React's scheduling:

```ts
const placeShip = useCallback(
  (placement: Placement): boolean => {
    const others = fleet.filter((p) => p.shipId !== placement.shipId);
    if (!isLegalPlacement(placement, others)) return false;
    setFleet([...others, placement]);
    return true;
  },
  [fleet],
);
```

**Why the new E2E suite missed it, which is the actual lesson.** All 34 tests passed with
this bug firing on every single placement. Playwright's `toContainText` auto-retries, and
the bogus warning clears itself after 2.2 seconds — so the matcher waited it out and then
saw the text it wanted. **An auto-retrying assertion cannot see a transient wrong state.**
Compounding it, the suite only asserted on the rejection _messages_; it never checked that
a successful placement stays quiet, so it tested the failure path thoroughly and the
success path not at all.

The regression test therefore reads the status exactly once, with no polling:

```ts
const state = await page
  .locator(".app__status")
  .evaluate((el) => ({ text: el.textContent, className: el.className }));
expect(state.className).not.toContain("app__status--warning");
```

It was confirmed to fail against the old `useBattle.ts` before the fix was applied. A
regression test that has never been seen to fail is just a comment.

## 15. The log scrolled the page out from under you

**Symptom.** Every shot scrolled the whole page down a little. On a laptop-height window
the boards would drift off the top of the screen mid-game, so you had to scroll back up to
take your next turn.

**How it was found.** Reported by someone playing the deployed game — the same route as
[#9](#9-every-fired-cell-grew-a-second-dot) and [#12](#12-a-rejected-placement-said-nothing-at-all).
Everything found this way has been visual or interaction behaviour, never game logic, which
is the pattern worth noticing: the engine is the part the tests actually cover.

**Root cause.** The log kept its newest entry visible by scrolling to it:

```tsx
const endRef = useRef<HTMLLIElement>(null);
useEffect(() => {
  endRef.current?.scrollIntoView({ block: "nearest" });
}, [entries.length]);
```

`.log__list` is its own scroll container (`max-height` + `overflow-y: auto`), so the intent
was to scroll only that. But `scrollIntoView` scrolls **every** scrollable ancestor needed
to bring the element into the viewport, and the document is one of them. `block: "nearest"`
limits how far each one scrolls, not which ones scroll. So whenever the log ran below the
fold — which is exactly when the window is short — the page came along too.

**Fix.** Render the log newest-first and delete the effect. Nothing needs to be scrolled to
if the entry you care about is already at the top:

```tsx
const newestFirst = entries.map((entry, index) => ({ entry, index })).reverse();
```

The reverse happens in the DOM rather than with `flex-direction: column-reverse`, so that
what a screen reader announces stays in the same order as what is on screen.

**Regression test.** The bug is invisible on a tall viewport, so the test forces a short
one and asserts the page has not moved, having first checked the page _can_ move — an
assertion that the scroll position is 0 proves nothing on a window with no scrollbar:

```ts
await page.setViewportSize({ width: 900, height: 600 });
expect(scrollable, "viewport must be short enough to scroll").toBe(true);
for (let col = 0; col < 3; col++) await exchangeShot(page, 0, col);
expect(await page.evaluate(() => window.scrollY)).toBe(0);
```

Confirmed to fail against the old component first: `Expected: 0, Received: 340`.

## 16. The difficulty blurbs did not say whose fleet was being sunk

**Symptom.** Picking an opponent showed, for example, `Hunts on a checkerboard, then
finishes what it starts. ~53 shots.` A number with no subject: it reads as _your_ budget
rather than how long the AI takes to sink _you_, and Easy's phrasing ("Clears a board in
~97 shots") did not match the other two, so there was nothing to compare against.

**How it was found.** Reported by the same person playing the game — not a defect, but the
text failing to say the thing it existed to say.

**Fix.** One phrasing across all three levels, naming the subject:

```diff
-  medium: "Hunts on a checkerboard, then finishes what it starts. ~53 shots.",
+  medium: "Hunts on a checkerboard, then finishes what it starts. Sinks your fleet in ~53 shots.",
```

**Why this got a test.** [#13](#13-two-things-the-readme-claimed-that-were-not-true) was a
stale `~42` that had drifted from the real median of 44, and nothing could have caught it
because it lived in a comment. These blurbs are the _user-facing_ version of exactly that
claim, so they are now checked against the simulator rather than trusted. `simulate` is
seeded, so the assertion is exact rather than a tolerance:

```ts
const quoted = DIFFICULTY_BLURBS[level].match(/~(\d+) shots/)?.[1];
expect(Number(quoted), `${level} blurb`).toBe(simulate(level, GAMES).median);
```

Verified by reintroducing the original mistake: setting Admiral back to `~42` fails with
`hard blurb: expected 42 to be 44`. That class of bug cannot reach the UI again.

## Things deliberately not "fixed"

- **The fleet sampler is not made uniform.** See [#13](#13-two-things-the-readme-claimed-that-were-not-true):
  it is random and legal but sequentially biased. Genuine uniformity means rejection
  sampling over whole configurations, and the bias is invisible to the density AI, which
  reasons from shots rather than from a placement prior.
- **The AI does not model human placement habits.** A stronger opponent could exploit
  the fact that humans place ships badly (edge-biased, avoiding contact) by weighting its
  heat map with a learned placement prior. Left out: it needs real human game data, and
  self-play would actively mislead it, since the AI would only learn to counter its own
  uniform placement.
- **Sinking a ship names it.** Queried as a possible information leak: does the real game
  tell you _which_ ship you just sank? It does, and it is the one line everybody quotes —
  "You sank my battleship!" [Hasbro's rules](https://instructions.hasbro.com/en-au/instruction/battleship)
  and every restatement of them require the defender to announce which ship went down, and
  that information is load-bearing: knowing a sunk ship's length is what lets you rule out
  placements for the rest of the fleet. So `Log` names the ship on a sink and says only
  "hit" before that — matching the enemy roster, which shows no damage pips until a ship
  goes down. The `keeps enemy damage secret until a ship sinks` E2E test pins that boundary
  in both directions. Concealing the name would be a non-standard hard mode, not a fix.
- **Ships may touch.** Some house rules forbid adjacent ships. The standard Hasbro rules
  allow it, `isLegalPlacement` allows it, and the AI's density map assumes it — changing
  this means changing all three together, so it stays as the standard rule.
- **`base: './'` rather than `'/battleship/'`.** GitHub Pages serves this from a subpath,
  so Vite's default absolute `base` would produce asset URLs pointing at the domain root.
  A relative base fixes that without hardcoding the repository name, and keeps
  `npm run preview` working from the filesystem root at the same time.
