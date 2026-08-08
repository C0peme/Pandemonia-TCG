# Overnight cost-formula tuning log

Backup restore point: commit `dace7b7` on branch `overnight-cost-tuning`.
Reference standings (pre-overnight, "SURCHARGE" run):
Combo 73, Snowball 63, Ramp 57, Stall 56, Guardian 51, Aggro 51, Swarm 51,
Attrition 50, Lane Control 49, Midrange 44, DoT 43, Control 34, Deck Out 28.
Spread 28-73. Correlation(foundation count, win rate) = 0.83.

---

## Iteration 1 — soften the stat curve

**Change.** `STAT_BASE` 0.28 -> 0.30, `STAT_R_ATK` 1.30 -> 1.08, `STAT_R_HP` 1.40 -> 1.12.
`VALUE_SCALE` 1.20 -> 1.30 to hold the pool price level (flattening alone dropped it 9.4%;
1.30 lands +0.3%, pool budget 617.0 both sides).

**Why.** Measured stats-per-energy fell 3.00x from a 1/2 to an 8/8 on the old curve: 6 energy
bought either a 4/5 (9 stats) or six 1/2s (18 stats). The geometric premium is borrowed from
single-combat games; Pandemonia is lane-based with 8 slots and parallel combat. Kept it
geometric (cards and slots bind late, so linear would let tall dominate instead) but cut the
spread to 1.50x.

**Effect on costs.** 53 cards re-priced. Big bodies dropped hardest — Worldheart Wyrm -6,
Abyss Warden / Mountain Bull / Apex Predator -2 each. Environments rose +1 (no body to shrink,
so they only feel the higher scale).

**Status.** tsc clean, 555 tests pass. Sim running.

---

## Keyword price probe — new tooling

The meta sim can tell you which DECK wins; it cannot tell you whether SNIPER is priced right,
because decks differ in a hundred ways at once. `.tuning/keywordAB.ts` runs a controlled A/B:
two 30-card decks, identical leader and identical filler, differing only in whether the probe
card carries one keyword — each side priced by the formula. 120 games, seats alternated so
first-player advantage cancels.

**Harness validated:** control-vs-control (identical decks) returns exactly 50%. Unbiased.

At 120 games 1 SE is 4.6%, so ~59%+ is a real signal and 55% is not.

### Sweep results (2/3 body, formula-priced)

| keyword | cost | win rate | read |
|---|---|---|---|
| lethal | 5e+1p | **73%** | badly underpriced |
| trueShield | 5e+1p | **73%** | badly underpriced |
| airborne | 2e+1p | **68%** | badly underpriced |
| doubleTeam | 2e+1p | **68%** | badly underpriced |
| branchShot | 3e+1p | **65%** | underpriced |
| shield 1 | 4e+1p | 60% | mildly underpriced |
| zombified | 5e+1p | 59% | mildly underpriced |
| overshot / battleReady | 2e/1e +1p | 58% / 57% | suggestive, within noise |
| doubleStrike, growth, strikeThrough, splashDamage, tough, spike, sniper | — | 48-53% | correctly priced |
| taunt, immunity, undershot, bloodlust | — | 43-46% | mildly overpriced, within noise |

Seven of twenty-one keywords are priced correctly, which is a decent hit rate for a table that
had never been measured — but the misses are large and concentrated in evasion/protection
(airborne, doubleTeam, trueShield, shield) and in Lethal.

**Result (IT1).** Combo 74, Ramp 65, Snowball 60, Stall 58, Guardian 54, Swarm 49, Attrition 49,
Lane Control 48, Aggro 46, DoT 44, Midrange 43, Control 37, Deck Out 24.

vs the pre-overnight run the curve did exactly what it was supposed to do to the tall/wide axis:
**Ramp +8** (big bodies: Worldheart Wyrm, Apex Predator) and **Aggro -5** (cheap bodies). That
is the intended rebalance and it is the cleanest attributable signal of the night.

It did NOT fix the meta, because it was never aimed at the actual problem: Combo held 74% and
spread widened to 24-74. Foundations were still the dominant force.

---

## Iteration 2 — charge the foundation half-stat carryover

**Change.** The derived half-stat grant is now priced (computed from the body in budget.ts,
since registry.ts derives the grant itself). Nothing else touched.

**Why.** IT1 left Combo at 74%, and the pre-overnight run had already measured
correlation(foundation count, win-rate delta) = **0.86** when the carryover was free.
The "it's a refund on a downside" premise fails because a Foundation fights standalone as a
full unit first and only then passes half its stats up — a two-stage payoff.

**Effect.** 20 cards re-priced, foundations only. Stone Footing 4e->6e, Ward Stone 5e->7e,
Taunt Totem 3e->5e, Phylactery 5e->7e. Cheap enablers (Springboard, Mana Geyser, Tidal Dock,
Fred's Boat) unchanged — they have small bodies so their carryover is small.

**Status.** tsc clean, 555 tests pass. Sim running.

---

## Harness v1 was flawed — recorded so it is not repeated

The first keyword probe pitted a keyworded deck against a mirror of pure vanilla bodies. That
environment has no removal, no fliers, no answers, so evasion/protection keywords were simply
unanswerable in it. Raising True Shield 5e -> 10e still left it winning 60%; Airborne 2e -> 7e
still 61%. The cost search saturated because price was never the binding constraint.

v2 (`.tuning/keywordField.ts`) measures marginal value against the REAL field instead: take a
starter deck, convert its vanilla bodies to carry one keyword (formula-repriced), and compare
field win rate against the other twelve decks. Validated: a NO-OP substitution returns delta
0.0 over 288 games.

**Result (IT2).** Combo 70, Ramp 66, Stall 59, Snowball 55, Lane Control 51, Guardian 51,
Aggro 50, Attrition 49, Swarm 48, DoT 44, Midrange 43, Control 37, Deck Out 27.

vs IT1 the foundation fix moved exactly the decks it should:
**Combo -4, Snowball -5** (the 8- and 7-foundation decks) while non-foundation decks rose —
Aggro +4, Lane Control +3, Deck Out +3. Spread narrowed 24-74 -> 27-70.

correlation(foundation count, win rate): 0.83 -> **0.70**. Improved, not solved. Note Ramp's
66% inflates it and is mostly IT1's curve change (it runs the biggest bodies in the game), not
its 3 foundations.

Combo at 70% remains the outlier. Two formula fixes have each taken a bite out of it (-4 here,
-4 from the earlier discount removal) without dislodging it.

---

## Root cause of Combo, finally

The keyword field sweep explains what three foundation-level fixes could not shift. Combo's
three foundations grant exactly the keywords the sweep flags as most underpriced:

- Launch Ramp -> **Overshot** (+33.3 marginal win rate — the worst mispricing found)
- Twin Fang Mount -> **Double Strike** (+23.6)
- Fertile Mound -> Growth

Overshot converts a body's attack into unblockable face damage. In a lane game where blocking
is the primary defence, bypassing it entirely is close to the strongest thing a keyword can do,
and it is currently priced at 0.75 — below Sniper. Double Strike at 1.5 is the same story.

So Combo was never really a "foundation deck" problem. It is a deck built on two underpriced
keywords, delivered by foundations. Repricing the keywords should hit it where the foundation
changes could not.

---

## Process hazard (recurring — worth knowing for any future long run)

Killing a `vitest` run via the harness (timeout or TaskStop) frequently does NOT kill its child
node process. It survives, keeps running, and keeps writing to its output file. This has bitten
three times tonight:

1. Two meta sims raced into the SAME output file, interleaving results — the giveaway was the
   file showing a label the source no longer contained.
2. An abandoned keyword sweep kept running after TaskStop and had to be killed by PID.
3. A timed-out foreground sweep ran concurrently with its own background relaunch, duplicating
   work and halving throughput.

Detection: `Get-Process node` and compare `StartTime` against when each job was launched;
cross-check which output file is actually advancing (`ls --time-style=+%H:%M:%S`).
Mitigations used: unique timestamped output filenames per run, and verifying `starter.ts` is not
left mid-swap (the meta harness swaps the file in and out) after any kill.

---

## Iteration 3 — reprice the keyword table from measured field data

**Full sweep results** (marginal field win rate at formula price; 288 games/side, 2 SE ~8.4):

| keyword | delta | keyword | delta |
|---|---|---|---|
| growth +1/+1 | **+47.9** | tough 1 | +12.8 |
| branchShot | **+38.9** | airborne | +11.8 |
| overshot | **+33.3** | immunity | +11.8 |
| battleReady | **+25.3** | strikeThrough | +9.4 |
| doubleStrike | **+23.6** | shield 1 | +8.7 |
| lethal | +15.3 | bloodlust / doubleTeam | +6.9 / +6.6 |
| spike, splashDamage, trueShield, zombified | +0.3 to +3.5 (correct) | | |
| sniper / taunt / undershot | -5.2 / -8.0 / **-9.7** (overpriced) | | |

**Change.** Additive correction of delta/10 in value units. Overshot 0.75 -> 4.05, branchShot
1.5 -> 5.4, growth 1.5 -> 6.3, doubleStrike 1.5 -> 3.9, battleReady 0.25 -> 2.75, lethal 3 -> 4.5,
tough 2 -> 3.3, airborne 0.75 -> 1.95, immunity 2 -> 3.2, strikeThrough 1.5 -> 2.4, shield
2.5 -> 3.4, doubleTeam 1 -> 1.7, bloodlust 1.25 -> 1.95; down: sniper 0.75 -> 0.25,
taunt 1 -> 0.2, undershot 2 -> 1.

**Two knock-on fixes this forced.**

1. *Environment multiplier 2.5 -> 1.0.* Environment `grantKeywords` were amplified 2.5x. With
   keywords correctly priced that produced uncastable cards (Warehouse 22e, Overgrowth 20e,
   High Ground 19e) while Fortified Line fell to 0e. The 2.5x was never justified anyway:
   `refreshLaneEnvironment` applies the grant to units of BOTH players in the lane column, so
   you are partly arming your opponent. At 1.0 environments land at 0-8e.

2. *VALUE_SCALE 1.30 -> 1.09.* The reprice inflated the pool +19.6% (617 -> 738). Energy per
   turn is fixed at the round number, so that would have silently slowed every game. Rescaled
   to hold the price level, keeping the change purely RELATIVE.

**Near-miss worth recording:** the regex that wrote the new keyword values swallowed `break;`
into a trailing comment on 12 cases, which would have made the whole switch fall through and
mispriced everything silently. Caught by reading the patched output rather than trusting the
edit. tsc did not flag it.

**Status.** tsc clean, 555 tests pass. Sim running.

**Result (IT3).** Combo 69, Stall 62, Ramp 57, Guardian 57, Lane Control 54, Attrition 53,
Swarm 50, Midrange 49, DoT 48, Aggro 48, Control 43, Snowball 34, Deck Out 27.

Two things went wrong, and diagnosing them was the most useful part of the night.

**Snowball collapsed 55 -> 34.** Growth at 6.3 made its whole deck astronomical: Iron Seed
3e -> 9e, Bloom Elk -> 8e, War Beast -> 9e, Fertile Mound -> 10e.

**Combo barely moved (70 -> 69) despite Overshot and Double Strike being repriced.** Reading
its actual costs explained why: its foundations DID get expensive (Launch Ramp 4e -> 6e,
Fertile Mound 6e -> 10e), but Combo does not need them. It wins on a cheap vanilla core —
Pebble Pup 1e, Gravel Hound 2e, Oak Sentry 3e, Mountain Bull 4/5 for **4e**.

**Root cause: IT1's curve softening overshot.** At 1.08/1.12 a 7/7 was as efficient per energy
as a 2/3 (2.33 vs 2.50), so vanilla stat-sticks became the best cards in the game. That is why
Combo jumped 62 -> 74 the moment the curve changed, and no amount of foundation or keyword
work since has dislodged it. I had softened the curve on the strength of a stats-per-energy
argument I had ALREADY had to walk back once; the second walk-back is on me.

**Methodology caveat found:** the keyword probe converts EVERY vanilla body in the deck, so
keywords that compound across many units (growth, bloodlust, branchShot, overshot) read far
higher than one card's marginal worth. Single-target keywords (sniper, taunt, lethal) are
unaffected. Any future sweep should convert ONE card, not the whole deck.

---

## Iteration 4 — partially revert the curve, damp the board-scaling keywords

**Change.** `STAT_R_ATK` 1.08 -> **1.22**, `STAT_R_HP` 1.12 -> **1.30**, base 0.30 -> 0.29
(stats-per-energy spread 1.78x -> **2.86x**, vs the original 3.71x). Growth 6.3 -> **3.5**,
branchShot 5.4 -> **3.5**. VALUE_SCALE stays 1.09 (drift -0.8%, no rescale needed).

Mountain Bull 4e -> **5e** (premium restored), Iron Seed 9e -> **6e** (Snowball should recover).

**Status.** tsc clean, 555 tests pass. Sim running.

**Result (IT4).** Combo 65, Ramp 62, Stall 56, Lane Control 55, Guardian 52, Snowball 51,
Swarm 50, DoT 49, Attrition 48, Control 45, Aggro 45, Midrange 44, Deck Out 28.

Both fixes did what they were aimed at: **Combo 69 -> 65** (curve revert) and
**Snowball 34 -> 51** (growth damped, fully recovered).

### Structural health across the night

| config | spread | field SD | within +-7 | foundation corr |
|---|---|---|---|---|
| pre-overnight | 28-73 | 11.1 | 9/13 | 0.83 |
| IT1 curve soft | 24-74 | 12.2 | 7/13 | 0.79 |
| IT2 found grant | 27-70 | 10.9 | 8/13 | 0.70 |
| IT3 keywords | 27-69 | 10.6 | 9/13 | **0.30** |
| **IT4 curve back** | **28-65** | **8.8** | **10/13** | 0.58 |

IT4 is the best configuration measured, and better than the starting point on every measure:
field SD 11.1 -> 8.8, ten of thirteen decks within seven points of even, top deck 73 -> 65.
Foundations no longer predict strength the way they did (0.83 -> 0.58); IT3 pushed that to 0.30
but only by killing Snowball, so 0.58 with a live Snowball is the better trade.

Remaining outliers: Combo 65 and Ramp 62 at the top, Deck Out 28 at the floor (accepted as a
gimmick deck by design).

---

## Iteration 5 — convergence check on the keyword table

Re-running the same sweep against the repriced table. Same methodology as the first sweep so
the numbers are directly comparable: if the corrections landed, the keywords that read +47.9,
+38.9 and +33.3 should now read near zero. Anything still extreme is either under-corrected or
compounding in a way the whole-deck probe overstates.
