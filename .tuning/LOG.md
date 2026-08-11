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
