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

**Result (IT5 convergence sweep).** Most keywords converged:
battleReady +25.3 -> +3.1, airborne +11.8 -> +2.8, strikeThrough +9.4 -> +3.5,
shield +8.7 -> +2.4, tough +12.8 -> +5.6, doubleStrike +23.6 -> +7.6,
overshot +33.3 -> +12.5, splashDamage/spike now ~0.

**Three did not, and they are the same three the methodology cannot measure properly:**

- **growth +38.9** (was +47.9, at 3.5). But the META sim disagrees: at 3.5 Snowball sits at 51%,
  and at 6.3 it collapsed to 34%. Growth applied to ~15 bodies compounds in a way one card
  never does, so the whole-deck probe massively over-reads it. **Trusting the meta sim here.**
- **branchShot +23.6** — same compounding shape (multi-target scales with board width).
- **taunt -10.4 despite being priced at 0.2**, nearly free. Giving every small body Taunt forces
  them all to be attacked, which is actively bad. Taunt is good on a big wall and terrible on
  fifteen small ones — its value is context-dependent, not a price the table can express.

**Stopping keyword tuning here.** For context-independent keywords the table has converged. The
remaining three are artifacts of converting a whole deck at once, and chasing them with this
tool would make the real meta worse — growth already demonstrated exactly that.

---

## Iteration 6 — final curve nudge (KEPT)

**Change.** `STAT_R_ATK` 1.22 -> **1.26**, `STAT_R_HP` 1.30 -> **1.35**. VALUE_SCALE stays 1.09.

**Result.** Combo 64, Ramp 60, Stall 53, Lane Control 53, Guardian 53, Attrition 53,
Snowball 52, Swarm 50, DoT 48, Aggro 47, Midrange 44, Control 44, Deck Out 28.

| config | spread | SD | within +-7 | found-corr | top |
|---|---|---|---|---|---|
| IT4 (1.22/1.30) | 28-65 | 8.8 | 10/13 | 0.58 | 65 |
| **IT6 (1.26/1.35)** | **28-64** | **8.3** | 10/13 | 0.64 | **64** |

Marginal but real: field SD 8.8 -> 8.3, top deck 65 -> 64. Foundation correlation ticks up
slightly (0.58 -> 0.64), which is the acceptable side of the trade. Kept.

---

## FINAL STATE

Starting point (pre-overnight) -> final (IT6):

| measure | before | after |
|---|---|---|
| field SD | 11.1 | **8.3** |
| spread | 28-73 | **28-64** |
| top deck | Combo 73 | **Combo 64** |
| decks within +-7 of even | 9/13 | **10/13** |
| correlation(foundations, win rate) | 0.83 | 0.64 |

Eight decks now sit between 44 and 53. The two remaining outliers are Combo 64 / Ramp 60 at
the top and Deck Out 28 at the floor (accepted as a gimmick deck).

### Formula changes that stuck

- Stat curve 0.28/1.30/1.40 -> **0.29/1.26/1.35** (stats-per-energy spread 3.71x -> ~3.0x)
- `VALUE_SCALE` 1.20 -> **1.09**, recalibrated twice to hold the pool price level at ~617
- Foundation half-stat carryover: derived universally in registry.ts, and PRICED
- Foundation grant discount (1.5) removed; foundation pip surcharge kept at +1
- Environment `grantKeywords` multiplier **2.5 -> 1.0** (the grant is symmetric)
- 16 keyword prices repriced from measured field data

### Tooling left behind

`.tuning/keywordField.ts` (field-based keyword probe, validated NO-OP = 0.0),
`.tuning/measure.ts`, `.tuning/keywordSweep.test.ts.off` (rename to .ts under src/ to re-run).
The sweep is deliberately parked outside src/ so `npm test` stays fast.

---

## Deck surgery — can deck edits rescue spell-heavy decks?

Swapped up to 8 spell copies for efficient vanilla units of similar cost. **No card definitions
changed** — only the lists.

| deck | before | after | delta |
|---|---|---|---|
| Control | 40% | **57%** | **+17.2** |
| Guardian | 56% | 63% | +6.1 |
| Lane Control | 54% | 59% | +5.0 |
| DoT | 48% | 51% | +2.5 |
| **Deck Out** | 30% | **16%** | **-14.2** |

**Four of five decks improve by deleting spells** — Control by seventeen points. A vanilla body
is simply worth more than a similarly-priced spell, which is the same story the -0.57
composition correlation told.

**Deck Out is the informative exception.** It gets much WORSE (-14.2) because its spells are its
win condition, not a value engine: cut the mill and the deck has no way to win at all. So its
28% is not evidence that spells are overpriced; it is a deck whose plan simply loses. That
matches the earlier read that Deck Out is a gimmick deck and its floor is by design.

**Conclusion: the answer to "can deck edits fix it" is yes, but they should not be the fix.**
The gains come from removing spells, not from playing better ones — evidence that the EFFECT
TABLE is mispriced rather than the lists being badly built. Editing the lists would paper over
that and leave every player-built custom deck holding the same overpriced spells.

---

## Effect cost table — measured and repriced (IT7)

Full sweep (swap N copies of a vanilla unit for a probe spell at its formula price, field win
rate vs the other 12 decks):

| UNDERPRICED | delta | | OVERPRICED | delta |
|---|---|---|---|---|
| buff +2/+2 ally | **+13.9** | | freeze any | **-11.1** |
| damage 4 enemy | **+11.1** | | forget 2 | **-10.8** |
| damage 2 ALL-enemy | **+9.2** | | cleanse ally | **-9.2** |
| move / burn 2 | +3.6 / +3.1 | | taunt (status) | **-8.1** |
| damage 2, damage 3 leader, debuff | ~0 | | heal 3 / sleep / expel | **-6.7** each |

**Every disruption effect is overpriced; damage and buffs are underpriced.** Tempo denial reads
better on paper than it plays — the target survives, the board does not change, and you spent a
card. That is exactly why Control, the most disruption-dense deck, gained +17.2 from throwing
its spells away.

**Changes.** freeze 2.5 -> 1.4, sleep 2.0 -> 1.3, taunt 1.0 -> 0.2, shield 2.5 -> 2.3,
expel 2.5 -> 1.8, forget base 1.75 -> 0.7, cleanse 1.0 -> 0.1, heal 0.5 -> 0.3/pt,
draw 1.0 -> 0.85/card, buff stats x1.9, AOE multiplier 2.5 -> **3.5**, and damage made
PROGRESSIVE (`amount*0.5 + max(0, amount-2)*0.55`) since 2 damage read neutral while 4 read
+11.1 — big hits kill real bodies, small ones only chip.

VALUE_SCALE unchanged at 1.09 (drift +0.1%).

Resulting card moves: disruption cheaper (cold-spell, hypnotic-patterns, peel-back,
displacement-wave, mend all -1), AOE pricier (wildfire-spread, verdant-cataclysm,
hivemind-surge all +3).

Also corrected a stale comment block on the stat curve that still described 1.08/1.12 after the
values had moved twice; it now records the full tuning history and why a premium is correct.

**Result (IT7).** Combo 64, Ramp 60, Lane Control 57, Stall 56, Snowball 54, Attrition 53,
Swarm 51, Guardian 50, Aggro 49, DoT 47, Control 42, Midrange 41, Deck Out 26.

**This is a NULL result and should be read as one.** Every per-deck delta vs IT6 falls inside
the +-5.2 noise band (worst: Lane Control +4, Midrange -3). Aggregate SD reads 8.34 -> 9.36 but
that is many noise-level wiggles stacking, not a measurable regression.

**The important part: Control did NOT recover** (44 -> 42) even though its freeze, expel and
sleep all got cheaper. That kills the simple story. Disruption is not merely overpriced — it is
WEAK, and a cheaper weak card is still a weak card. You cannot fix a losing strategy by
discounting it.

**Kept anyway**, because the two questions are separate:
- *Is the effect table accurate?* Now yes, and measured. Custom cards and future content get
  priced correctly, which matters more than the starter meta.
- *Does repricing fix Control?* No. That needs the effects themselves to do more, or the
  archetype to get a different payoff — a design change, not a price change.

### What disruption would actually need

Freeze/sleep/expel deny one attack and leave the board unchanged. Against a lane board with
8 slots the opponent simply attacks elsewhere. For a control plan to work the effects need to
generate advantage rather than delay it — draw attached to removal, damage attached to tempo,
or lane-wide rather than single-target denial. That is a content question, not a formula one.

---

## Hero powers: measured, NOT repriced (Phase 1)

Hypothesis going in: hero powers are the last unpriced primitive, and Screyera's Scry is what
makes Combo untouchable by card repricing. **Both halves were wrong**, and the measurements
are worth keeping for that.

**Disparity table** (`heroField.ts`, formula-priced): a 12x spread in value-per-energy, from
Fallback Code 3.18 to Mind Whip 0.27. But correlation with win rate is ZERO (-0.17 on
value/cost, -0.02 on raw value). Scry prices BELOW median (0.93) while Combo leads the field;
Sweet Liquor is the 2nd-richest power attached to the worst deck.

**Disable probe** (`heroDisable.ts`, 384 games/leader — price the power out of reach, measure
what the deck loses). This is formula-free, so it settles the ambiguity:

| power | delta | | power | delta |
|---|---|---|---|---|
| Modification | **-43.2** | | Misdirect | -22.4 |
| Scald | -40.6 | | Fallback Code | -19.3 |
| Disciplinary | -35.4 | | Sweet Liquor | -17.2 |
| Fortify | -34.4 | | Tinkerer | -13.5 |
| Mind Whip | -31.8 | | **Scry** | **-10.4** |
| Exploit | -29.7 | | **Cancerous Growth** | **0.0** |
| Subdue | -25.5 | | | |

Mean -24.9: powers are ~a quarter of every deck's win rate. But
`corr(formula value, contribution) = 0.072` — **the cost formula is worthless on leaders** and
must never be extended to them. What predicts contribution is how OFTEN a power is cast
(-0.49; -0.60 excluding the dead one); multiplying frequency by formula value makes the
prediction worse (-0.09). Leader powers stay hand-set by design intent.

**Combo is not carried by Scry** (-10.4, second-smallest; Combo still wins 52% with it off,
and Scry is cast only 3.15x/game). Combo's 64% is CARD QUALITY. That is why six formula
changes never moved it, and it is where the remaining work is.

The delta column doubles as a **card-quality deficit meter**: decks that collapse without their
power (Guardian -43, DoT -41, Midrange -35) have weak cards being propped up; decks that barely
notice (Combo -10, Ramp 0) win on cards alone.

## Cancerous Growth: direction, then profit, then the AI (IT8/IT9)

Measured 0.0 contribution across 384 games while being cast 8.2x/game. Not a magnitude problem:
**energy equals the round number** (turn.ts), so it grows automatically and is scarcest EARLY.
Saving energy for later moves it from a lean turn to a rich one — negative-EV at any rate.

Fixes, in the order the measurements forced them:
1. **Reversed** it to borrow-now/repay-later. Measured 0.00 activations — the AI never cast it.
2. **Root cause**: `evaluate()` scored `energyNext` but had NO term for current energy, so a
   loan showed its debt and hid its principal. Added `W.energy`.
3. At a **flat 1.0** the power worked (13.59 casts) but the meta broke: Deck Out **+12**,
   Midrange **-10**, both outside noise. A flat weight pays the AI to HOLD energy, which
   lengthens games — mill's win condition, beatdown's loss condition.
4. At **0.5** the hoarding vanished and so did the power (0.00 casts). That exposed the real
   mechanism: the meta sim runs the GREEDY 1-ply AI, so a branch is taken purely on the sign of
   the immediate eval (break-even 0.667). There is no lookahead to find the play the energy
   enables, so no flat weight can separate "energy I am about to spend" from "energy I am
   sitting on".
5. **Concave instead of flat**: `ENERGY_VALUE_CAP = 3` credits only the first ~3 points
   (about one play), zero marginal reward beyond. Same -2.6 contribution at **2.93** casts
   instead of 13.59 — selective, not compulsive.

Power is also net-PROFITABLE now (borrow 3, repay 2). A break-even shift settles at
`round - 2 + 2 = round` if cast every turn, i.e. exactly nothing — which is why it measured
zero in BOTH directions. Metastasis repays only 1 of 3.

**IT9 result — clean.** Combo 67, Ramp 64, Stall 56, Lane Control 52, Snowball 51, Attrition 50,
Aggro 49, Guardian 48, DoT 48, Swarm 47, Control 45, Midrange 43, Deck Out 31.
Every deck within +-5.2 of IT7; SD 9.36 -> 8.68, the best of the three runs.

---

## THE MEASURING INSTRUMENT WAS WRONG (planning vs greedy)

Scry got `hpCost: 1` restored (measured -3.6, best trim per unit of change; self-scaling
because ai.ts weights leader HP 1/point while healthy and 4x at/below the Signature threshold).
Then a meta was run with the PLANNING AI (`USE_PLAN=1`, 12 games/matchup, 83 min).

| deck | greedy IT9 | PLANNING | delta |
|---|---|---|---|
| Swarm | 47 | **65** | **+18** |
| Aggro | 49 | **63** | **+14** |
| Midrange | 43 | 48 | +5 |
| Guardian | 48 | 50 | +2 |
| Deck Out | 31 | 33 | +2 |
| DoT | 48 | 49 | +1 |
| Snowball | 51 | 51 | 0 |
| Stall | 56 | 54 | -2 |
| Ramp | 64 | 59 | -5 |
| Attrition | 50 | 44 | -6 |
| Lane Control | 52 | 44 | -8 |
| Control | 45 | **36** | **-9** |
| Combo | 67 | **54** | **-13** |

SE ~4.2pp, so Swarm/Aggro/Control/Combo are real and the rest is noise.
**corr(greedy standings, planning standings) = 0.545.**

**The shipped game uses PLANNING** — `useGame.ts` calls `chooseAction`, which is `planTurn`
(ai.ts:1180). `sim.ts` defaults `usePlan = false`. So every meta number in this log above this
entry was measured against a policy no player ever faces.

Consequences:
- **Combo was never the problem deck** (54% vs a competent AI). "Top in every configuration"
  was an artifact of greedy. Much of its -13 is the AI, not the hpCost nerf (-3.6 alone).
- **Swarm and Aggro are the real top decks.** Wide boards and attack sequencing are precisely
  what a 1-ply policy misplays — it cannot order attacks or see multi-body lethal.
- **Control 36% is WORSE under a good AI.** The one prior conclusion that survives: disruption
  is weak by design, not mispriced. Now double-confirmed.
- **`ENERGY_VALUE_CAP = 3`** was tuned against a greedy-specific hoarding pathology and needs
  re-validating under planning; the failure mode came from having no lookahead at all.

Cost of the switch: ~15 s/game vs ~0.3 s/game, ~50x. A 13-deck meta is 83 min at 12
games/matchup (SE ~4.2pp) vs ~9.5 h at 30. Budget accordingly — but greedy numbers are
measuring the wrong game.

---

## Overnight re-examination under PLANNING (5 phases, 3h36m)

Full output: `.tuning/overnight-planning.txt`. All planning-only; not comparable to greedy runs.

### 1. The energy term is a GREEDY CRUTCH — remove it

Meta with `W.energy = 0` vs the planning baseline: corr **0.865**, mean |delta| 4.4 against a
2SE band of 8.4, only DoT (-9) outside it. SD 9.07 -> 9.67. **No meaningful meta difference.**

Phase 5 settles it. Ramp under planning, energy term on vs off:

| | Ramp WR | Cancerous Growth acts/game |
|---|---|---|
| W.energy = 1 | 60.8% | 4.75 |
| W.energy = 0 | **68.3%** | **4.25** |

**Planning casts the power 4.25x/game with NO energy term at all** — versus 0.00 under greedy.
The whole `W.energy` + `ENERGY_VALUE_CAP` apparatus existed to compensate for greedy's lack of
lookahead; given a search that can find the play the borrowed energy enables, it is redundant.
Ramp also reads +7.5 WITHOUT it (~1.2 SE, suggestive not conclusive), i.e. the term may be
mildly harmful. Recommendation: delete `W.energy`/`ENERGY_VALUE_CAP`.

Note this does NOT revert the Cancerous Growth redesign — the borrow-now/repay-later direction
and the borrow-3/repay-2 profit stand on their own and are why planning casts it at all.

### 2. Swarm and Aggro are systemically strong — no single culprit

Swarm 64.6%, every card 56-69% win-when-played. Aggro 61.8%, every card 49-63%. Both
distributions are FLAT: there is no broken card to nerf. These decks execute better with
lookahead (attack ordering, multi-body lethal) and greedy was simply misplaying them.
Highest-damage shared card is `pyre-fiend` (10.7 dmg/game in Swarm, 6.2 in Aggro) — the only
obvious lever, and it is an engine card in two decks, not a single-deck problem.

### 3. Control's disruption is the worst part of Control

| Control 43.8% | | Lane Control 46.5% | |
|---|---|---|---|
| tide-serpent (20.2 dmg) | 42% | reef-raptor (11.7 dmg) | 45% |
| glacial-ray | 42% | displacement-wave | 44% |
| ... | | ... | |
| cold-spell | **36%** | tundra | **34%** |
| hypnotic-patterns | **35%** | cold-spell | **33%** |

In BOTH decks the disruption spells sit at the BOTTOM of their own deck's table and the
beaters sit at the top. The decks win when they act like beatdown decks. This is the third
independent confirmation (deck surgery +17.2, effect reprice null result, now card-level)
that disruption needs to GENERATE advantage, not delay it. Design work, not pricing.

### 4. Hero powers are still load-bearing under planning

| leader | greedy delta | planning delta | acts/g |
|---|---|---|---|
| Orsyric (Mind Whip) | -31.8 | **-35.4** | 7.72 |
| Phantom (Subdue) | -25.5 | **-28.1** | 12.46 |
| Autopus (Fallback Code) | -19.3 | **-26.0** | 8.63 |
| Screyera (Scry) | -10.4 | **-6.3** | 2.27 |

Powers matter as much or MORE under a competent AI. Scry is the exception and that is the
`hpCost: 1` nerf working as designed: usage down to 2.27/game, contribution roughly halved,
Combo base 56%.

### Precision caveat

Control measured **36%** in the meta and **43.8%** in runField — same policy, same 12
games/matchup, same 144 games. A 7.8pp gap between two supposedly equivalent measurements
bounds how much any single number here should be trusted. Treat +-8 as the real band.

---

## Naming: `undershot` -> `pierce`

The keyword was named for its original niche (striking UNDER the front line, at foundations).
It has since come to mean "ignore protective defences" and now also exists as a flag on damage
effects, so it is renamed for what it does. **Every measurement recorded ABOVE this entry that
names `undershot` refers to what is now `pierce`** — the historical entries are left as written
rather than rewritten.

Renamed across 23 files (109 occurrences). `store.ts` gained a `migrateUndershot` pass that
rewrites the key on load: `keywordsSchema` is `.strict()` and `loadPersist` DROPS anything that
fails to parse, so without it every saved custom card using the old keyword would have silently
vanished from the player's collection.

---

## PHASE B — the real noise band (measured, not assumed)

Same 13-deck PLANNING meta, 12 games/matchup, run at three seed bases (1 / 5000 / 9000).
Nothing changed between runs but the seed. Full output: `.tuning/noise-band.txt`.

| deck | s1 | s2 | s3 | mean | spread |
|---|---|---|---|---|---|
| Ramp | 63 | 60 | 67 | **63.3** | 7 |
| Aggro | 60 | 61 | 68 | **63.0** | 8 |
| Combo | 59 | 66 | 57 | **60.7** | 9 |
| Swarm | 59 | 55 | 57 | **57.0** | 4 |
| Stall | 60 | 56 | 52 | **56.0** | 8 |
| Lane Control | 51 | 49 | 51 | **50.3** | 2 |
| Guardian | 46 | 47 | 50 | **47.7** | 4 |
| Snowball | 50 | 49 | 42 | **47.0** | 8 |
| Midrange | 49 | 46 | 44 | **46.3** | 5 |
| Attrition | 47 | 40 | 42 | **43.0** | 7 |
| DoT | 40 | 45 | 43 | **42.7** | 5 |
| Control | 31 | 41 | 38 | **36.7** | 10 |
| Deck Out | 36 | 35 | 39 | **36.7** | 4 |

**mean spread 6.2pp, worst 10pp. Treat anything under ~7pp as unmeasurable at 12
games/matchup.** The binomial SE (+-4.2) was badly optimistic, as suspected: games within a
matchup are correlated (same two decks, similar lines), so effective sample size is far below
nominal.

**The band is NOT uniform.** Deck Out (4), Swarm (4), Guardian (4) and Lane Control (2) are
steady; Control (10), Combo (9), Aggro (8), Stall (8) and Snowball (8) swing hard. Decks with
polarised matchups are the noisy ones — which is the same rock-paper-scissors effect the
planning switch introduced. A single field number is a worse summary for exactly the decks we
care most about.

Aggro (60/61/68) is the cautionary pattern: two agreeing runs, then an 8-point third. Two
consistent readings are not confirmation.

### What this retroactively invalidates

Applies directly to PLANNING at 12 games/matchup; greedy runs at 30 games/matchup have their
own (probably smaller) band, so this is not a blanket retraction.

- **Survives**: the planning-vs-greedy switch (Swarm +18, Aggro +14, Combo -13 — all well
  clear of 10).
- **Downgraded to noise**: Control -9 on that same comparison; Scry `hpCost` -3.6; Cancerous
  Growth -2.6; and every IT7/IT9 per-deck delta I described as small-but-real.
- The "+-5.2 noise band" quoted throughout the earlier entries was too tight. Read those
  entries with +-7 or worse.

### The useful by-product: a 3x-sample BASELINE

The `mean` column is a 36-games/matchup estimate — three times any single run and the most
reliable standings we have. It captures the tree at commit 5358ffd (post Scry hpCost, post
Cancerous Growth, post energy-term removal) and BEFORE the Control rebuild, because vitest
loaded the modules at run start. That makes it exactly the right baseline to measure the
Control rebuild against.

### Method going forward

- A full meta at 12 games/matchup answers "did anything large move" and nothing finer.
- For one deck, `runField` at 40+ games/matchup (~480 games, ~2h) is far cheaper than a meta
  and answers a single question properly.
- For anything important, average >= 3 seeds. That is what makes the mean column trustworthy.

---

## Control rebuild A/B + paired-noise calibration (one run, two answers)

Old list vs rebuilt list, PLANNING, 12 games/matchup, three seed bases, both arms sharing a
seed. Full output: `.tuning/control-ab.txt`.

| seed | old | new | delta |
|---|---|---|---|
| 1 | 38.2 | 85.4 | +47.2 |
| 5000 | 34.0 | 75.0 | +41.0 |
| 9000 | 34.7 | 80.6 | +45.8 |

**mean delta +44.7pp.**

### 1. The harness cross-validates

Old-list mean **35.6** against the Phase B baseline's **36.7** for the same deck, measured by a
different harness on a different day. ~1pp apart. That is strong evidence the measurement is
sound and, importantly, that the hit-resolution engine change did NOT handicap the old list
(it runs almost no damage spells, so Freeze-absorbs-card-damage barely touches it). The +44.7
is attributable to the new list, not to the engine change kneecapping the old one.

### 2. The diagnosis was right and the execution OVERSHOT

Control goes from worst deck (36.7) to **80.3** — **17pp clear of the previous best deck**
(Ramp 63.3). That is not "fixed", it is broken in the other direction.

So: removal + card draw were genuinely the missing pieces (a 45pp swing does not come from
nowhere), but the package as priced is far too strong. Suspects, in order:
- `pierce` at 1.0 — it now also bypasses Freeze on card damage, and it is the only keyword
  that answers everything. Almost certainly underpriced.
- `abyssal-verdict` — 4 damage that pierces everything for 3e+1W, x3.
- draw at 0.85/card — the list gained three draw sources at once.

Next step is a card-level field report on the new list (~16 min, one arm) to see which cards
carry it, rather than guessing which dial to turn.

### 3. Paired A/B is NOT better than unpaired — the methodological answer

**Delta spread across seeds: 6.2pp** — identical to the mean *absolute* cross-seed spread from
Phase B (6.2 mean / 10 worst). Common random numbers bought us nothing.

The reason: any change worth testing perturbs play immediately, so the two arms decorrelate
within a few turns and the shared shuffle stops helping.

Consequences, and this settles the earlier uncertainty:
- **The retractions stand.** Scry `hpCost` -3.6 and Cancerous Growth -2.6 are noise. They were
  paired probes, and pairing does not rescue them.
- **A/B probes detect large effects only** (>~7pp). Every keyword/effect price in this log
  measured below that threshold is unresolved, not confirmed.
- Balance changes should be sized to be readable, or made on design reasoning and not
  measured at all. Fine-tuning by simulation is not available at this sample size.

---

## Pierce reprice: NULL. And the reason unifies the whole session.

`PIERCE_COST` 1.0 -> 2.5, repricing abyssal-verdict 3e+1W -> 5e+1W (x3) and
riptide-executioner 2e+1W -> 4e+1W (x2). Re-ran the same three-seed A/B.

| | before | after |
|---|---|---|
| Control (new list) | 80.3 | **78.7** |
| delta vs old list | +44.7 | +43.1 |

**+2 energy on 5 of 30 cards moved the deck 1.6pp — deep inside the 6.9pp delta noise.**
Old-list arms reproduced to within 0.1pp across both runs (38.2/34.0/34.7 twice), so the
harness is sound. This is a real null, not a miss.

### Why: ENERGY IS NOT SCARCE, so cost is a weak balance lever

`turn.ts`: `energy = round number`, uncapped. By round 6 every deck can cast almost anything;
most cards cost 2-6. A +2 tax delays a card by at most one round and then stops mattering.

That retro-explains every cost-side null result in this log:
- overnight cost-formula tuning (IT1-IT6): per-deck moves mostly inside noise
- effect cost table reprice (IT7): explicit null
- pierce reprice (this entry): null

...against everything that DID move the meta, none of which was a price:
- deck surgery, swapping spells for units: **+17.2**
- the Control rebuild, adding removal + draw: **+43.1**
- switching the AI policy greedy -> planning: **up to +-18**

**The binding constraints are CARDS (1 draw/turn) and BOARD SLOTS (8), not energy.** That is
also why draw is so strong and why card QUALITY (Combo) was never touchable by repricing.

Cost still matters for the first ~5 rounds and for element/pip gating. It is not a lever for a
deck's overall win rate. Balance via card function, stats and counts instead.

### The open fork on Control

Before the rebuild the game had NO hard removal anywhere. Giving it to one deck made that deck
dominant by 18pp over the previous best. Two coherent responses:

1. **Nerf Control back** and keep the game removal-free — cheapest, preserves the existing
   meta, but leaves the design problem that no deck can answer a threat.
2. **Distribute removal across the elements** so every deck has answers, and re-baseline the
   whole meta. Larger content change; matches how essentially every mature TCG works, and the
   LoR/MTG research that started this thread.

This is a design decision, not a measurement one.

---

## Removal distributed by element (option 2)

Chosen over nerfing Control, on the reasoning that **balancing around a starter LIST is
unenforceable when the card pool is open** — a player can always build the deck that has the
answers, so the answers have to exist for everyone.

Corrected premise first: the game was NOT removal-free. It was unevenly distributed, with a
power cliff. Pool HP: 2 damage kills 49% of units, 3 kills 74%, 4 kills 85%.

| element | had | added |
|---|---|---|
| Fire | firebolt (2), chain-spark (2+chain), ashen-bomber (3 lane) | nothing — best served already |
| Water | tidal-wave (2, lane-gated), void-caller (2 AOE, **in no deck**), abyssal-verdict (4, pierce) | nothing |
| Nature | verdant-cataclysm (3 AOE, 8e), creeping-blight (Poison 1 to all), Lethal bodies | **strangleroot** — Poison 2, single target |
| Earth | **NOTHING — no spells at all** | **reprisal** — damage = target's own attack |

- `reprisal` (earth, 1e+1E): counter-punch idiom. Kills a 5/5, does nothing to a 0/5 wall.
- `strangleroot` (nature, 2e+1N): attrition idiom. Slow, cleansable, outpaced by healing, and
  shuts off Growth/Bloodlust (a poisoned unit cannot be buffed).

Slotted into the two below-average decks whose identity matches: DoT 42.7 (plague-rat x2 ->
strangleroot x2) and Attrition 43.0 (plague-rat x2 -> reprisal x2).

**Abyssal Verdict kept as-is** (user call): deleting one card does not remove the effect from
the game when future cards will carry it, so the fix is that every element can answer, not that
this card stops existing.

### New engine support: `amountFrom: 'targetAttack'`

Damage derived from the target instead of a printed number — the mechanism for differentiating
removal by CONDITION rather than price. That distinction is the session's main finding: energy
is uncapped and equals the round number, so price stops restraining a card after round ~5.

No AI work needed, unlike `energyNext`: the beam search values a damage spell by simulating the
kill and scoring the resulting board, so a dynamic amount is observed correctly. The `e.amount`
reads in ai.ts are only heuristics (environment/polish/lethal-check) and target the leader.

### Held back deliberately

`void-caller` (2 damage to all enemies, 3e+1W) exists and is in NO deck. It was in the plan to
add it to Control — NOT done: Control currently measures 78.7% and does not need another tool.
Revisit when Control is re-baselined.

No meta test run (user call).

---

## Pool audit: element x function, and the gaps filled

Audited the whole pool by element x function (`.tuning/poolAudit.test.ts`). The headline:

**Before today the ENTIRE card pool contained ONE card that draws** — `grove-elder` — plus
Screyera's hero power. In a game where energy is uncapped and grows every round, the binding
resources are CARDS (1 draw/turn) and BOARD SLOTS (8). So card ACCESS was a resource exactly
one leader could buy, at any price.

That is the best explanation yet for Combo leading every configuration measured and surviving
six repricings untouched: it was not mispriced, it was the only deck buying the scarce
resource. It also explains why two draw bodies instantly made Control the best deck in the game.

### Filled (8 cards, each in its element's idiom)

| element | gap | card |
|---|---|---|
| Fire | no draw | `powder-monkey` 2/1, on death draw 1 — fire pays with the body |
| Water | **no healing at all** | `reef-nurse` 1/3, on play heal an ally 2 |
| Nature | no cleanse (`purify` was the game's ONLY one) | `rejuvenate` (spell), `ironroot-ward` (body) |
| Earth | 2 spells total, no draw, no AOE, top-heavy curve | `quarry-hand` (1-drop), `tremor` (AOE), `bulwark` (Tough grant), `runestone-keeper` (0/4 Taunt, draws each turn) |

Every element now has draw, and cleanse exists outside Water.

### Deliberately NOT filled — identity, not gaps

Fire heal/cleanse, Water DoT, Earth ramp, Nature protection. Those absences are what make the
elements distinct; filling them would homogenise the pool.

### Still open

`summon` exists only in Nature (2 cards), and `mill` exists only as John Pork's hero power, not
as a card effect anywhere.

### Fallout: one brittle test

`run.test.ts` store test hardcoded offer slot 0 and assumed it was affordable. Store offers roll
from the WHOLE pool, so adding cards shifted the roll and slot 0 became a 65-coin card against a
60-coin purse — `buyCard` correctly refused. Fixed by selecting the first affordable slot; the
rule under test (one buy per slot) is unchanged. Any future card addition would have broken it.

---

## Gaps round 2: dead mechanics, unobtainable keywords, unplayed card types

Audit: `.tuning/gaps2.test.ts` (keyword support, orphan cards, foundations/environments).

### A. TWO MECHANICS ARE FULLY BUILT AND HAVE ZERO CARDS

**`metamorphosis` — 0 cards in the pool.** It has: a `metamorphose()` implementation in
endOfTurn.ts, a dedicated 150-line `metamorphosis.test.ts`, `metamorphValue()` in the AI, and
its own section in CLAUDE.md documenting the Foundation re-bond subtlety. All of it is
unreachable in play.

**`smelt` — 0 cards.** Engine support in endOfTurn.ts plus tests in batch3.test.ts.

This is the cheapest content in the game: the engine, AI valuation and tests already exist, so
these are card-authoring tasks, not feature work.

### B. Lethal cannot be printed on a card

No playable card has printed `lethal`. The only sources are `whetstone-altar` (Earth foundation
that GRANTS it) and `killing-fields` (Earth environment). The one unit with it, `critter-elite`,
is a token.

Worse, the card-creation guide lists Lethal in **Nature's** toolkit while every source is
**Earth** — a doc/data mismatch that will mislead anyone authoring to the guide.

### C. Environments are a nearly-unused card TYPE

29 environments in the pool; **4 appear in any starter deck**. Fire has 7 and plays none. A
whole card type is content that no demonstrator deck shows off.

### D. 57 of 179 cards (32%) are in no starter deck

Some is deliberate (Adventure pool, custom-deck fodder), but it includes whole sub-themes:
Fire's foundations (5, one played) and Water's foundations (5, one played).

### E. Thin keywords (1-2 carriers)

`trueShield` 1, `immunity` 2, `zombified` 2, `brittle` 2, `sacrifice` 2. Mechanics that exist
but are too rare to build around or plan against.

(Note: `producer`/`healer`/`mover`/`debuff`/`expel` also read as 0-1, but those are the
expansion keywords — starter data authors them as trigger effects instead, so the keyword count
undercounts them. Not real gaps.)

### F. Stale deck comments reference cards that do not exist

Combo's and DoT's comments describe `venom-sniper`, `deathspike-lancer`, `boulder-titan`,
`stone-golem` and `flame-guard` — none are in the pool. The comments document a deck that was
never built, which is actively misleading when reasoning about why a deck performs as it does.

---

## Gaps round 2: filled

9 cards, all verified against the formula (printed cost == recommended cost for all 24 cards
added today).

### Dead mechanics made reachable

| card | element | cost | fills |
|---|---|---|---|
| `emerald-drake` | nature | 6e+1N | evolved form (4/5 Airborne) |
| `chrysalis-grub` | nature | 3e+1N | **metamorphosis** — 1/3 that becomes the Drake after 2 turns |
| `ember-chronicler` | fire | 3e+1F | **smelt** — lose 1 HP each turn to draw a card |

Two traps found while authoring, both now covered by tests:
- **metamorphosis silently does nothing without `into`** (endOfTurn.ts returns early), and
  `gains` alone never applies. It needs a base AND an evolved card.
- **smelt runs a TRIGGERED effect**, so it must be player-scoped (draw/energy/energyNext/
  bankMax/forget). A unit-targeting effect is dropped by the dispatch whitelist — the same trap
  that made `energyNext` a no-op earlier in this session.

Also fixed a real pricing bug: **smelt was priced as a one-shot** despite firing every end of
turn, so a per-turn engine cost the same as using its effect once. Now takes the universal x1.4
recurrence premium (ember-chronicler 2e+1F -> 3e+1F).

### Lethal is printable

`venom-sniper` (nature, 4e+2N, 1/2 Sniper+Lethal). Lethal previously existed only as an Earth
foundation/environment grant while the creation guide listed it in NATURE's toolkit — the card
makes the guide true rather than the guide being edited to match an accident.

### Grant coverage completed

An audit of all 19 grantable keywords x {foundation, environment} found four holes:

| keyword | was missing | added |
|---|---|---|
| pierce | environment | `tidal-rift` (water, 2e+2W) |
| splashDamage | foundation | `mortar-emplacement` (fire, 5e+2F) |
| trueShield | foundation | `aegis-plinth` (earth, 5e+2E) |
| brittle | **both** | `glass-forge` (fire foundation), `shattered-span` (fire environment) |

Brittle is a downside, so those two are a glass-cannon trade and a hazard lane rather than
gifts. A test now asserts every grantable keyword has both sources, so this cannot regress.

### Stale comments removed

Combo's deck comment described a Lethal-carrier plan built from `stone-golem`, `venom-sniper`,
`deathspike-lancer` and `boulder-titan` — **none existed in the pool**. DoT's described a
"Flame Guard" wall that also did not exist. Both deleted with a note. This mattered: those
comments were read earlier in this session while reasoning about why Combo wins, and they
describe decks that were never built.

---

## Ability -> element map completed (8/8/8/8)

The card-creation guide already had an ELEMENT TOOLKITS list. It was incomplete and partly
contradicted by the cards:

- **10 of 32 keywords were unassigned**: pierce, trueShield, immunity, zombified, doubleTeam,
  smelt, healer, debuff, mover, expel.
- **Wildly uneven**: Fire 7, Nature 7, Water 6, **Earth 2**.
- **Four assignments disagreed with the data**: Taunt (guide: water) is on earth:10/water:1;
  Spike (guide: nature) is on earth:7/nature:2; Overshot and Splash Damage (guide: water) are
  mostly fire. Earth was never ability-poor — its two biggest mechanics were filed elsewhere.

Now canonical, every keyword assigned exactly once, 8 per element:

| element | abilities |
|---|---|
| Fire | battleReady*, strikeThrough, doubleStrike, brittle, kamikaze, smelt, overshot, splashDamage |
| Water | aquatic*, sniper, pierce, shield, doubleTeam, healer, mover, expel |
| Nature | growth*, bloodlust*, producer, airborne, lethal, metamorphosis, sacrifice, branchShot |
| Earth | tough*, polish, taunt, spike, trueShield, immunity, zombified, debuff |

(* = signature, unchanged.)

### For the proposed ability-derived pips

The idea is to derive each pip from the ABILITY's element rather than the card's, producing
dual-element cards. Two things to know before building it:

1. **Pips are not a gate.** `settleCost` pays any element shortfall from generic energy, so an
   off-element pip makes a card EXPENSIVE, not unplayable. The scheme would add real cost
   pressure (banking and elementCaps are genuinely constrained, unlike energy) but would not
   lock anyone out.
2. **An ability-dense card can exceed `MAX_ELEMENT_COST` (4)** once pips come from 3-4 different
   elements, so it needs a clamping rule — `recommendedPips` currently clamps a single total.

---

## Starter deck pass — every deck re-tuned against the new pool

The 13 decks were mostly unchanged for months and had never seen the ~35 cards added this
session. Audit (`.tuning/deckAudit.test.ts`) before the pass:

| gap | decks affected |
|---|---|
| **no draw** | **12 of 13** (Control 3, Ramp 2) |
| **no cleanse** | **13 of 13** |
| no removal | 6 — Midrange, Combo, Guardian, Deck Out, Stall, Snowball |
| no heal | 6 |

74 of 203 cards were in NO deck, including every card added today.

### A real bug the pip rework introduced

**Combo ran 3x `launch-ramp`, which ability-derived pips pushed to 2 FIRE — and Screyera caps
fire at 1.** She could never bank for it; it was payable only by dumping generic energy. That
is 3 of 30 cards broken, and it was the deck's whole Overshot line.

Replaced with `whetstone-altar` (8e+1N+1E, on-element for her, grants Lethal) — which finally
makes real the Lethal plan Combo's deck comment claimed it had and never did. General lesson:
a card needing 2+ pips of ONE element is locked to leaders with that cap, so it can no longer
serve as a splash. Worth watching whenever pips move.

### After the pass

Draw: 12 decks without -> **1** (Combo, whose leader power IS draw). Removal: 6 without -> **1**
(Deck Out, whose plan is mill by design). Off-cap pips: **0**.

Highlights, all at exactly 30 cards:
- **Midrange** — the vanilla baseline had no removal and no draw. Now runs the NEUTRAL package
  (`sharpened-stake`, `wandering-scholar`), which is exactly its identity: goodstuff any leader
  could cast.
- **Snowball** — gained `chrysalis-grub` + `emerald-drake`. Metamorphosis is literally this
  deck's thesis (start small, become huge) and it had no access to it.
- **Stall** — `runestone-keeper` is a 0/4 Taunt wall that draws every turn: a wall deck's card
  engine, plus `tremor` for its first AOE.
- **DoT** — `ember-chronicler` (repeating Countdown draw); a slow tick suits its clock.
- **Aggro / Swarm** — `powder-monkey`, a 2/1 that replaces itself when it trades.
- **Attrition** — `ironroot-ward` gives the game's most ground-down deck its only cleanse.

### Still open, deliberately

**Cleanse is in 1 deck of 13.** Burn/Poison/Freeze/Sleep remain effectively unanswerable across
the meta. Blanket-adding `purify`/`rejuvenate` everywhere would homogenise the decks, so it is
left as a design question rather than a silent fix.

Also fixed the audit tool itself: it counted only `damage` as removal, so Snowball read
"no removal" while holding `strangleroot` (Poison kills without ever dealing damage).

**None of this is measured.** Together with the hit-resolution rework, ability-derived pips,
Neutral and Countdown, this is the largest unmeasured stack of the session.

---

## Second deck pass: CURVE and consistency (the first pass only fixed function coverage)

The first pass asked "does this deck have draw/removal/cleanse". It never asked "can this deck
act on turn 2". Curve audit found the more serious problem:

| deck | 0-1 drops | avg cost | before -> after |
|---|---|---|---|
| **Control** | **0** | **4.2** | -> 2 drops, 3.7 |
| **Attrition** | **0** | 4.3 | -> 2 drops, 3.9 |
| Snowball | 5 | 5.4 (17 cards at 6+) | -> 4.8 |
| Stall | 4 | 5.2 (14 at 6+, NONE at cost 3) | -> 4.8 |
| Combo | 3 | 5.2 | -> 4.8 |

For reference the healthy decks sit at 2.3-3.0 (Aggro, Midrange, Lane Control, Deck Out).

**Control's was self-inflicted and I had missed it.** The PIERCE reprice (1.0 -> 2.5) pushed
`abyssal-verdict` to 6 total and `riptide-executioner` to 5, and the deck was never re-examined
afterwards. A deck with zero 0-1 drops cannot act before round 3 — which is exactly when Aggro
(avg 2.3) is killing it. I had also skipped Control in the first pass on the grounds that it
"measured 79%", a number taken BEFORE the pierce reprice, the pip rework, ~35 new cards and
twelve other decks changing. Judging a deck by a stale measurement was the wrong call.

Fixes: trimmed the expensive removal to 2-of, added real early plays (`river-minnow`,
`reef-darter`, `quarry-hand`, `briar-colt` by element), and cut the top end of the heaviest
decks.

### Consistency

Control had drifted to 17 unique cards across 30 slots with four singletons — most of the deck
was a card you might never draw. Consolidated to **15 unique, no singletons**; Stall from 16
unique/4 singletons to 14/2. A singleton in a 30-card deck is a card the deck cannot plan
around.

### Where it ends up

Every deck: 30 cards, no off-cap pips, draw everywhere except Combo (whose hero power IS draw),
removal everywhere except Deck Out (mill by design). Curves 2.3-4.8 apart from Ramp at 6.1,
which is its identity.

Cleanse remains in 1 deck of 13 — still deliberately open.

---

## Pre-flight checks before the long meta

**Smoke test** (`.tuning/deckSmoke.test.ts`, greedy, ~2 min). The new mechanics — Countdown,
Metamorphosis, `amountFrom`, Neutral cards, the hit-resolution rework — were covered in
isolation but had never been played inside a real deck in a full game.

- All 78 deck pairings x 2 seeds played to completion. No crashes.
- **Every card in every deck got played at least once** across the field. No dead cards.

**Two latent bugs found, neither from this session's balance work:**

1. **Midrange was an ILLEGAL deck.** It listed `briar-colt` and `reef-darter` in two entries
   each. `parseDeck` only bounds a SINGLE entry's count, so it passed — but `validateDeck`
   (what the deck builder runs on a player's deck) rejects "Card listed more than once". A
   shipped starter deck failed the game's own validation. Merged, and `deckValidity.test.ts`
   now asserts every starter deck passes `validateDeck`.

2. **MAX_COPIES was 4; intended 3.** Now 3. Midrange's merge had produced a 4-of, so it was
   trimmed. Docs said "Max 4 copies" in two places — corrected. The UI reads the constant
   everywhere, so nothing there needed changing. `registry.test.ts` hardcoded `count: 4` and
   broke; it now derives from `RULES.MAX_COPIES` so the next change cannot silently rot it.

The deck-legality test is the useful residue here: `parseDeck` passing is NOT the same as a
deck being legal, and nothing had been checking the stronger condition.

---

## Meta run (2 full seeds + 5 rows; the process died at 31/39) and the adjustments it drove

| deck | seeds | mean | vs old baseline |
|---|---|---|---|
| **Snowball** | 67/58 | **62.5** | **+15.5** |
| Combo | 55/60/65 | 60.0 | -0.7 |
| **Control** | 59/59/54 | **57.3** | **+20.6** |
| **DoT** | 53/58/58 | **56.3** | **+13.6** |
| Aggro | 56/56/56 | 56.0 | -7.0 |
| Ramp | 51/56 | 53.5 | -9.8 |
| Swarm | 54/52 | 53.0 | -4.0 |
| Guardian | 52/49 | 50.5 | +2.8 |
| Stall | 51/46 | 48.5 | -7.5 |
| Lane Control | 42/40 | 41.0 | -9.3 |
| Midrange | 40/40/40 | 40.0 | -6.3 |
| Attrition | 33/40 | 36.5 | -6.5 |
| Deck Out | 36/36 | 36.0 | -0.7 |

SD 8.63, range 26.5 (was 8.90 / 26.6). The spread did NOT flatten — but the composition
rotated hard. Observed 3-seed spreads: Combo 10, Control 5, DoT 5, Aggro 0, Midrange 0, so the
+-7 band still holds and the two-seed means are the least reliable rows.

**The baseline column conflates deck edits with the engine changes** (hit-resolution, pips),
because that baseline was measured on the old decks AND the old engine. Direction, not
attribution.

### Read

- **Control +20.6, worst deck -> 57.3.** The rebuild plus the curve fix landed, and it is no
  longer the 79% outlier: the pierce reprice and the curve trim pulled it into band. Best
  result of the session.
- **DoT +13.6** — draw and Countdown did their job.
- **Snowball +15.5 to 62.5 — overshot.** Metamorphosis plus a cheaper curve was too much at once.
- **New floor: Attrition 36.5, Midrange 40.0, Lane Control 41.0.** Attrition fell DESPITE
  gaining draw, cleanse and early bodies, which says its plan is weak rather than
  under-supported — spike walls punish attackers without ever killing anything. That is the
  same lesson Control's freeze package taught.

### Adjustments made (not yet measured)

- **Snowball**: trimmed the growth PAYOFFS (bloom-elk 3->2, goreivyne 2->1) rather than the
  identity package — chrysalis/drake stay, they are the thesis and the reason it improved.
- **Lane Control**: cold-spell -> frostbite-harpoon. Same tempo, but it actually removes a body;
  displacement alone does not kill.
- **Attrition**: consolidated singletons into real removal (tremor x2, spiked-base to 2-of).

### Still open

- **Midrange 40.0, perfectly stable at 40/40/40.** The vanilla baseline being second-from-bottom
  is a systemic signal, not a deck problem: it says the ability-pip discount favours ability
  cards over stats. That is a FORMULA question and deliberately not touched here.
- Cleanse remains in 1 deck of 13.
- The adjustments above are unmeasured; the next run should A/B those three decks specifically.
