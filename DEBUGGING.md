# Debugging log

A running log kept while building this game, not a write-up from memory afterwards. One
entry per real bug, in the order it was found. Each says what looked wrong, what caught
it, what was actually broken, and what changed — with the code inline, so you can read it
without checking out an old commit.

Nothing here is invented. Where a "bug" turned out not to be one, that's recorded too,
because the investigation is the interesting part.

**How things get caught here, roughly in order of how much they found:**

| Tool                                  | What it is                                                                    | What it caught   |
| ------------------------------------- | ----------------------------------------------------------------------------- | ---------------- |
| Playing the game in a browser         | Manual play, ~40 turns per pass                                               | #6, #7           |
| `npm run sim`                         | 100k headless games per difficulty, measures shot counts                      | #3               |
| `npm run fuzz`                        | Invariant checker over full games (see [#8](#8-what-the-fuzzer-did-not-find)) | nothing — see #8 |
| `npm test`                            | 31 unit tests + 5 strength regressions                                        | guarded #3's fix |
| `npm run typecheck` / `npm run build` | tsc + Vite                                                                    | #2               |
| Reading the diff back                 | —                                                                             | #5               |

---

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

## Things deliberately not "fixed"

- **The AI's own fleet is placed uniformly at random.** A stronger opponent could exploit
  the fact that humans place ships badly (edge-biased, avoiding contact) by weighting its
  heat map with a learned placement prior. Left out: it needs real human game data, and
  self-play would actively mislead it, since the AI would only learn to counter its own
  uniform placement.
- **Ships may touch.** Some house rules forbid adjacent ships. The standard Hasbro rules
  allow it, `isLegalPlacement` allows it, and the AI's density map assumes it — changing
  this means changing all three together, so it stays as the standard rule.
- **`base: './'` rather than `'/battleship/'`.** GitHub Pages serves this from a subpath,
  so Vite's default absolute `base` would produce asset URLs pointing at the domain root.
  A relative base fixes that without hardcoding the repository name, and keeps
  `npm run preview` working from the filesystem root at the same time.
