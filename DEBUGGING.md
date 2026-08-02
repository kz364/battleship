# Debugging log

Thirty-one defects found while building this game, kept as a running log rather than
reconstructed afterwards. This page is the short version: how they were caught, the seven
that were most worth catching, and what is now guarding each one. Every entry, with the
offending code inline, is in the [full appendix](docs/debugging-appendix.md).

## How they were found

| Tool                                                | What it caught                                           |
| --------------------------------------------------- | -------------------------------------------------------- |
| Someone else playing the deployed game              | 13 — by far the most productive                          |
| `npm run test:e2e` (Playwright, computed styles)    | 4, including two nobody had noticed by eye               |
| Measuring the browser at each requested viewport    | 1 — sideways scroll only some scrollbars produce         |
| Reading the code and the diff back                  | 3 — the two state bugs below, plus dead CSS              |
| Reviewing proposed fixes against their own contract | 2 — reversible state and the final announcement          |
| Playing it myself in a browser                      | 2                                                        |
| `npm run sim` / `npm test` / `npm run typecheck`    | 2, and they hold the AI's published numbers in place     |
| `npm run fuzz` (6,000 full games, every invariant)  | 0 — see the appendix on [what a fuzzer cannot see][fuzz] |

The distribution is the honest lesson. Types, lint, unit tests and a fuzzer between them
found three bugs; a person clicking around found eleven. Six of the visual defects lived
entirely in CSS, where no type system was ever going to look — which is why the browser
pass that found them is now a committed Playwright suite asserting on computed styles and
geometry in both themes, not an anecdote about a session.

[fuzz]: docs/debugging-appendix.md#8-what-the-fuzzer-did-not-find

## Seven representative bugs

**The AI secretly fired twice per turn.** Seeded games were not reproducible.
`chooseShot()` was being called _inside_ a `setGame` updater, and React Strict Mode
invokes updaters twice — so two coordinates were drawn from the RNG and one was silently
discarded. Fixed by choosing the coordinate before entering the updater; updaters must be
pure. Found by instrumenting the RNG in the browser, and it is the reason the deployed
build was later re-checked in production, where Strict Mode does not double-invoke.
([#7](docs/debugging-appendix.md#7-the-ai-secretly-picked-two-shots-every-turn))

**The enemy fleet panel told you which ship you had just hit.** The roster rendered true
damage for both fleets, so a hit lit a pip against a named ship — the information the
whole game is about. Fixed with `concealDamage`, showing pips only once a ship sinks, and
pinned by an E2E test that asserts the boundary in both directions.
([#6](docs/debugging-appendix.md#6-the-enemy-fleet-panel-told-you-which-ship-you-had-hit))

**Placing a ship illegally said nothing at all — and then the fix broke every legal
placement.** The original defect was that refusal was communicated only by a hover-only
red ghost, which touch and keyboard users never see. The fix explained the refusal in the
status line. It also flashed "can't go there" under every _successful_ placement, because
`placeShip()` returned a flag assigned inside a `setFleet` updater that React need not run
during the dispatch. The uncomfortable part: the new Playwright suite was 34/34 green
while that fired on every single placement, because `toContainText` retries and the bogus
warning cleared itself after 2.2 seconds. **An auto-retrying assertion cannot see a
transient wrong state.** Every regression for a self-clearing bug in this repo now reads
the DOM once, synchronously.
([#12](docs/debugging-appendix.md#12-a-rejected-placement-said-nothing-at-all),
[#14](docs/debugging-appendix.md#14-the-fix-for-12-reported-every-successful-placement-as-a-failure))

**Sunk ships looked exactly like live ones in Retro.** `.app[data-theme='retro'] .ship img`
out-specified `.ship--sunk img`, and because `filter` is a single property the losing
declaration was dropped whole — the same trap had already eaten the ghost and
invalid-placement tints. Invisible to every non-visual tool; caught by comparing computed
`filter` values in Playwright, which is how it is now tested.
([#11](docs/debugging-appendix.md#11-retro-wrecks-looked-exactly-like-live-ships))

**A refused placement outlived the attempt that caused it.** Reject a placement, hit
Randomize, and the red warning described a board that no longer existed for the remaining
2.2s of its timer. The rejection was free-floating UI state whose only end condition was a
clock. Fixed by recording what the attempt was about (ship, orientation, fleet), deriving
whether it still applies, and irreversibly retiring it when a reversible control changes.
The first fix only hid the marker: selecting Carrier again or rotating twice resurrected
the old warning, which independent review caught before merge.
([#25](docs/debugging-appendix.md#25-a-refused-placement-outlived-the-attempt-that-caused-it),
[#28](docs/debugging-appendix.md#28-a-retired-placement-warning-could-come-back))

**"Your move." while it was the enemy's move.** Whose turn it is was stored twice: the
authoritative `game.turn`, and an `aiThinking` flag mirrored into it by an effect one
render later. In that gap the board locked, the log showed the shot, and the status line
said it was your move. Fixed by deleting the mirror. Both of these last two are the same
mistake — state that duplicates or outlives the thing it describes — and both were found
by reading, not by running.
([#26](docs/debugging-appendix.md#26-your-move-while-it-was-the-enemys-move))

**A 320px screen scrolled sideways, but only on some of them.** `--cell` was sized in
`vw`, and `100vw` counts a classic scrollbar's 15px as usable width — so the board panel
came out at 320.39px inside a 305px content box. On a phone, where scrollbars are
overlays, the same layout is fine, which is also why the committed regression could not
see it: Playwright's device emulation uses overlay scrollbars too. The width budget now
subtracts the scrollbar, and the test runs at 305px as well as 320px.
([#27](docs/debugging-appendix.md#27-a-320px-screen-scrolled-sideways-but-only-on-some-of-them))

## Three claims that were wrong before the code was

Prose is the part of this repository nothing verifies, and it drifted three times: the
README described the density map as a checkerboard when it is a centre-weighted bowl, a
code comment quoted a stale `~42` shots against a measured 44, and `?seed=` was documented
as guaranteeing an identical game when one shared RNG stream means it only does so for an
identical sequence of actions. All three are corrected, and the two that name a number are
now asserted against the simulator rather than trusted, so they cannot drift again.
([#13](docs/debugging-appendix.md#13-two-things-the-readme-claimed-that-were-not-true),
[#18](docs/debugging-appendix.md#18-the-readme-oversold-what-seed-guarantees))

## What is guarding it now

`npm run lint`, `npm run typecheck`, 50-odd unit tests, a 500-game fuzz over full games,
the production build, and a Playwright suite across a desktop and a phone viewport in both
themes — all of it on every pull request, and again on the exact merge commit before
GitHub Pages will publish it. Nothing deploys that has not passed.

The appendix also records what was **deliberately not fixed**, with measurements: two
published Battleship AIs reimplemented and rejected on paired trials (+0.47 ± 0.79 and
+0.02 ± 0.88 shots against the current Admiral), and an expected-information-gain shot
rule that fires at all 100 squares because information and damage are different
objectives.
