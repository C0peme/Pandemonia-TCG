# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev        # Start Vite dev server
npm run build      # TypeScript check + Vite build
npm run preview    # Preview production build
npm test           # Run all tests (Vitest)
npx vitest run src/engine/combat.test.ts  # Run a single test file
```

## Path Aliases

Three aliases are configured in `vite.config.ts` (also honoured by Vitest):

| Alias | Resolves to |
|-------|-------------|
| `@engine` | `src/engine/` |
| `@cards` | `src/cards/` |
| `@ui` | `src/ui/` |

## Architecture

### Layers

```
src/cards/       Card/leader data: schema (Zod), registry, authored card data
src/engine/      Pure game logic: no React, no side effects
src/ui/          React UI: App, DeckBuilder, CardStudio
```

### Engine design

The engine is a pure reducer: `applyAction(registry, state, action) → { state, events }`.

- **State** (`src/engine/types.ts`) is plain serializable data — no class instances, no Maps.
- **Registry** (`src/cards/registry.ts`) holds static card/leader definitions; it is passed alongside state but never embedded in it.
- Every action clones state via `structuredClone` before mutating the draft.
- Events (`src/engine/events.ts`) are the log of what happened; the UI and tests consume them.

### Card schema

Cards (`src/cards/schema.ts`) are validated by Zod. All engine types are inferred from these schemas — the schema is the single source of truth. Card types: `unit`, `foundation`, `spell`, `environment`.

Leaders have a `heroPower`, per-element banking caps, and a `signatureCardId` — a card delivered to hand when the leader's HP drops to the Signature threshold, which is HALF that leader's own max HP (`signatureThreshold` in `damage.ts`) — 15 for the standard 30 HP leader, but scales correctly for Adventure's reduced-HP enemies and any future non-30-HP leader.

At registry-build time, `expandKeywordEffects` (`src/cards/registry.ts`) rewrites the data-driven "effect" keywords — `healer`, `producer`, `debuff`, `mover` (every scope, including self), and `expel` — into the card's trigger effect arrays (`onPlay`/`endOfTurn`/`startOfTurn`), so the engine runs them all through the normal effect machinery rather than via per-keyword handlers. There is no separate native handling for these. Triggered effects fire at the OWNER's trigger only: `resolveEndOfTurn`/`resolveStartOfTurn` process the active player's units once per round. (CardStudio performs the same migration when authoring custom cards; the testkit `unit()` helper applies it too, so fixtures match in-play units.)

### Board model

Five fixed lanes per player, in PHYSICAL left-to-right order: `heights`, `ground1`, `water`, `ground2`, `heights2`. That order is load-bearing — `adjacentLanes` (combat.ts) derives splash/collateral neighbours from the `LANES` array indices, so the array IS the board layout. Both Heights columns are the same lane TYPE: anything gated on "is this the high ground" (Sniper's free targeting, an Environment's `heights` opt-in) must call `isHeights`/`isGround` from `constants.ts` rather than compare against the string, or the second column silently loses the rule. Water is the only lane with an entry requirement. Each lane can hold at most two units (front/back, enabled by `doubleTeam`). A `Foundation` card can be placed standalone in a lane and bonds with the next unit placed there; while standalone it fights as a unit (it takes damage through `mitigate` like any other defender).

All unit relocation — the `moveUnit` action, the Mover keyword (`resolvePending`), the `move`/`expel` effects, and self-Movers (`selfRelocate`) — goes through the single shared `relocateUnit` helper in `board.ts`, which enforces Double-Team capacity, promotes the back-row unit when a front slot empties, recomputes Water `drowning`, and refreshes Environment grants. Add new movement paths through it, not with ad-hoc slot assignment.

### Foundation grants are DYNAMIC

A Foundation hands the unit bonding on top of it **half of the body it actually has at bond
time** (`foundationGrantStat`, floor of live attack/hp) plus **its own grantable keywords**
(`foundationGrantKeywords` — the same blocklist a `buff` obeys, so `doubleTeam`/`shield`/
effect-carrying keywords stay out) with the authored `grants.keywords` layered on top.

"Live" is the point: a standalone Foundation is a full unit, so buffs, Growth, enhancements
and damage taken while it stands alone all move the grant. `engine.ts` snapshots the
standalone body with `foundationLiveState` and passes it to `applyFoundation`; the snapshot
is stored as `FoundationInstance.live` so a Metamorphosis re-bond (`endOfTurn.ts`) reproduces
the same grant instead of resetting to printed value.

The derived half-stat **supersedes** the authored `grants.stat`, which is now dead data on the
card (`budget.ts` already priced the derived carryover — the engine had simply never applied
it). `App.tsx` renders the derived grant in both the card detail and the standalone-foundation
badge, so a buffed Foundation advertises the bigger grant it now makes.

### A Foundation fights with everything it grants

A Foundation is not a passenger waiting to hand its ability to a host — it is a full unit that
**also** passes that ability on, so it must be able to use it standing alone. `makeFoundationUnit`
(`board.ts`) seeds the standalone body's `keywords`/`onHit` from `card.keywords`/`card.onHit`
**merged with** `card.grants.keywords`/`grants.onHit` (own explicit value wins on conflict), and
seeds `onAttack`/`endOfTurn`/`startOfTurn` directly from `card.grants.*` — the shared unit loops
(`activeUnits` in `endOfTurn.ts`, `resolveFoundationAttacker` in `combat.ts`) already run these
for a standalone Foundation exactly like any other unit, so no further engine work was needed.
A Sniper foundation now aims like Sniper; a Producer foundation now banks energy while standing
alone, not only once bonded. This required **zero card-data edits** — every existing Foundation's
`grants` already stated the ability, it just wasn't reaching the Foundation's own body.

One consequence: **Battle Ready is now redundant as a per-card Foundation grant.** Every
Foundation already gives free Battle Ready to whatever bonds onto it when the ground was placed
a prior turn (`playUnit`'s prepared-position rule, below) — a universal engine rule, not a card
ability. Springboard (the one Foundation that authored `grants.keywords.battleReady`) was
removed as pure duplication; `metamorphCards.test.ts` documents the exclusion.

### Foundation stacking

A Foundation placed on a lane that already holds a standalone Foundation **bonds onto it**,
exactly like a unit would (`playFoundation` in `engine.ts`): the new Foundation inherits the old
one's LIVE body via `foundationLiveState`/`applyFoundation`, remains a full Foundation itself
(still fights standalone, still occupies `Lane.standaloneFoundation`), and can take a further
unit or Foundation bond later — compounding the same way a unit-on-foundation bond does. The
same prepared-position rule applies: stacking onto ground placed a prior turn deploys the new
top Foundation Battle-Ready; stacking same-turn does not. No new state shape was needed — a
Foundation is already a full `UnitInstance` that can itself carry a `.foundation` field once
something bonds onto IT, which is exactly what a unit hosting a Foundation already does.

### Turn flow (see `src/engine/engine.ts` `endTurn`)

1. Declare Attack (combat via `resolveCombat`)
2. Banking (overflow energy into element bank)
3. Hand off to opponent (`beginTurn`)
4. Draw, end-of-turn effects (burn, growth, etc.), check game over

### Metamorphosis

Metamorphosis transforms the UNIT, not the ground beneath it: a Foundation survives the
change and keeps granting to the new form. Because `metamorphose` rebuilds the unit from the
new card (replacing `keywords`/`onHit`/trigger arrays wholesale), it re-runs
`applyFoundation` afterwards to regenerate the grants and their bookkeeping against the new
base, preserving the Foundation's own `hp` and `iid`. Skipping that re-bond leaves the
FoundationInstance claiming grants that are no longer present, and a later revert then
splices triggers off the NEW form and deletes keywords it owns.

### Drowning and unit attack

`engine/drowning.ts` owns the Water rule. While a unit is `drowning`, its live `attack` is
pinned at 0 and its REAL attack is parked in `predrownAttack` — a shadow copy that every
attack-writing path must respect. **Never assign `unit.attack` directly**; call `addAttack`,
which writes to whichever store is live. `buffUnit` and `applyFoundation`/`revertFoundation`
already do. Getting this wrong silently deletes buffs on surfacing, or pushes a submerged
unit above 0 attack and breaks the invariant the model rests on.

Anything that can change water compatibility must re-run `reconcileDrowning` for the unit's
lane: relocation, Environment grants (`refreshLaneEnvironment`), and Foundation bond/revert
(pass the `lane` argument — Tidal Dock, Fred's Boat and Roost Nest all grant Aquatic/Airborne).

### Cost modifiers: two lanes

A player has TWO additive cost-modifier stores, both read together by `costModFor`
(`engine.ts`) at every play/afford site — never read `costMods`/`costBase` directly for
cost math. `costMods` is TEMPORARY (Anti Magic Field etc.) and zeroed at that player's
turn-end; `costBase` is PERSISTENT (never auto-cleared) and holds run-long Adventure
discounts — leader uniques (Naife's Environments) via `applyHeroModsToState`, and
cost-reduction relics via `applyRelicsToState`. Putting a run-long discount on `costMods`
is the bug this split fixes: it silently lasted only turn 1. `costBase` is optional on
`PlayerState` (absent = all-zero) so older/simpler states need no migration.

### Relics: rarity is SCOPE, and `cursed` is where the prices live

Rarity is not magnitude (six relics cutting enemy HP at six percentages), and it is not
"how much drawback comes attached" either. Both were tried. It is now **how much of the
run's state and rules the effect is allowed to manipulate** — the model HSR's curios use,
and the reason a 1-star there can still beat a 3-star in the run that suits it.
`data/relics.ts` states the rule per band and `relicShapes.test.ts` enforces it:

- **common** — ONE small thing, always-on; or one SITUATIONAL thing that is genuinely
  strong when its situation holds. Touches a single number. A situational common's
  condition must be realistically reachable well before the run ends and its payoff must
  hold up next to an unconditional common on the same shelf — a condition almost nothing
  can satisfy (a deck that has never taken a card reward) is a dead relic in a common's
  clothing, not a build-around, and was cut for exactly that reason.
- **rare** — a whole SYSTEM, or several effects combined: an archetype's cost curve, an
  element's keyword toolkit, a build-around you steer the run toward. No relic in ANY
  band rewrites a lane for both sides — a symmetric board rewrite reads as a wash rather
  than as power, and a full band of them once made two rarities feel interchangeable. A
  shared-Environment rewrite still exists in the game, but only as a Trial twist, where
  the player knowingly picks the rule and is paid for its severity.
- **boss** — REWRITES THE RUN: a permanent rule (`energyPerTurn`, `startBank`, a keyword
  or stat grant that reaches every element), a one-shot transformation resolved on claim,
  or — the band's signature — SCALES off something the run has accumulated (`Relic.scale`).
  A boss relic should make the rest of your inventory mean more than it did a moment ago.
- **cursed** — real power with a REAL PRICE. A fourth band, not a fourth rung: a cursed
  relic is a trade, and whether it is good is a question about this run.

Three rules follow, and all three are asserted:

- **Boss relics never carry a drawback.** They are handed out once or twice a run, after
  a fight already paid for in HP; taxing that reward again is taxing the same win twice.
  Splitting `cursed` off is what frees the other three bands from having to carry prices.
- **Cursed relics are never rolled as a reward — they are BOUGHT.** `rollRelicChoices`
  filters the band out of every reward path, and the store's cursed shelf is the only
  source, so taking a curse is always an act rather than something that happens to a run.
- **A curse can always be OVERCOME, never simply endured.** A cursed price must read as
  either a temporary setback natural play repairs (a max-HP loss that a Rest Mend, Oaken
  Heart, or the next act's `ACT_MAX_HP_GAIN` grows back) or a standing challenge the
  player plays around for the rest of the run (a permanent cost curve, a harsher enemy
  multiplier) — **never a system switched off.** Three relics (Hollow Lantern, Dead Anvil,
  The Long Column) used to grant boss-tier power by permanently disabling Rest, the altar,
  or the shop; they were removed, because "this system no longer exists for you" cannot be
  overcome by any amount of skill, so no benefit on the other side of it was ever worth the
  risk. What replaced them is degree-priced instead, and three exported caps —
  `MAX_HP_LOSS` (-8), `MAX_ENEMY_HP_PRICE` (1.15), `MIN_HEAL_BONUS` (-8) — stop a future
  degree-priced curse from drifting back into a de-facto deletion by increments.

Seams the table rides, all on existing machinery except two engine fields:

- `energyPerTurn` — engine field (`PlayerState.energyPerTurn`, read in `beginTurn`).
  Nothing that existed could express "one more energy, every turn": `energy` is
  overwritten each turn, `energyNext` is a one-turn carry, `energyOverride` REPLACES the
  curve. Additive on top of `energyOverride` so a fixed-energy boss cannot silently cancel
  a relic. `aggregateMods` caps the SUM at `ENERGY_PER_TURN_CAP`. The boss band grants it
  clean (Dawn Engine); the cursed band grants it plus a second benefit, for a price — so a
  curse is never simply a worse Dawn Engine.
- `autopilot` — the other engine field (`GameState.autopilot`, predicate
  `autopilotActive`). See the section below.
- `Relic.scale` (`RelicScale`) — the boss band's signature. `scale.mods` is folded once
  per STEP, so additive fields multiply and multiplicative ones compound
  (`enemyHpMult: 0.96` over 8 steps = 0.72, a curve that decelerates rather than racing to
  zero). Sources are live run quantities — `relics`, `coins`, `deckSize`, `act`,
  `enhancements`, `missingHp` — so a scaling relic strengthens and weakens as the run
  does: spending the purse really does give the Hoard-Ledger's ground back. `from`/
  `invert` let one arithmetic reward a quantity going DOWN (a thinned deck). **`maxSteps`
  is required, not optional** — `coins` and `deckSize` are unbounded, and an uncapped
  multiplier off either is how a relic quietly ends the difficulty curve.
- `turnDraw`/`turnMill` — ride `turnCardMod`, the boss-curse seam. Zero engine work.
- `reviveOnce`/`consumedAfterBattle` — one-shots, tracked by `RunState.spentRelics`.
  A spent relic KEEPS its tray slot, greyed. `aggregateMods` skips spent ids in one place.
- `Relic.broken` + `repairWins` — the BROKEN shape (HSR's Error Code curios). While
  `RunState.relicRepair[id] > 0` the relic folds `broken` **instead of** `mods` (never as
  well — folding both makes it a wash rather than a loan). Every battle WON decrements
  every counter; at 0 the entry is deleted and the relic is simply good from then on. A
  loss never deepens the debt: a curse that punishes struggling is the "cannot be
  overcome" failure this shape exists to avoid. It is the only price in the table that
  SHRINKS as the run goes on, which is why a broken relic is exempt from the
  "out-give the clean boss version" rule — reaching bare parity with Dawn Engine *is* the
  deal, since what you bought was access (a shop shelf, not a boss kill) and earliness.
  The tray shows the countdown (`advhud__relic--broken`), or it reads as merely bad.
- `RelicCondition.elementAtLeast` — the EQUATION axis (Divergent Universe). `monoElement`
  demands purity, a single very steep plan most runs abandon; this asks for a two-element
  MIX, which is what most real decks already drift toward, so it rewards steering a draft
  rather than restarting it. Needs a registry to count elements — absent reads as
  unsatisfied, same conservative direction `monoElement` takes.
- `actDelta` — shifts the ACT the run is scaled against, the single biggest difficulty
  dial in Adventure (`actScale` is `1.13^(act-1)` and drives enemy HP *and* deck size).
  Read through `effectiveAct(act, mods)` by BOTH halves of the trade — `rollEncounter`
  for the fight and `combatReward` for the payout — so a run that fights two acts easier
  is paid two acts poorer and the discount can never be taken without its price. NOT
  applied to boss SELECTION: which boss guards act 5 is that act's identity, and swapping
  it would rewrite the run's story as well as its numbers. Floored at act 1.
- **Borrowed time** — a cursed relic may put its price in the `scale` rather than the
  mods: The Borrowed Dawn opens at `enemyHpMult: 0.12` and compounds `1.55` per act, so
  acts 1-2 are nearly free, the curve crosses back through full strength at act 6, and
  `maxSteps` caps the debt at ~1.66x rather than letting it compound to 13x. It is exempt
  from the ordinary 0.5 floor on `enemyHpMult` — that floor exists so a PERMANENT
  discount can never delete an enemy, and a discount that expires by construction is not
  permanent — but must still climb back above the floor within a few acts and stay under
  2x forever, both asserted.
- `coinsPercent` — claim-time proportional coins. Every other coin effect is flat and so
  is worth the same to a broke run and a rich one; this one asks a question about timing.
- `RunState.pendingTrim` — a deck-trim relic (Empty Reliquary) grants the PLAYER a choice
  of which cards leave, not the reducer a random one. That alone is not enough to earn a
  boss slot: a shop already lets you choose which cards to sell, for coins, with no node
  cost, so a relic that only removes cards is strictly worse than that free service the
  moment the run has a shop to walk to. `trimCoinsPerCard`/`trimBuffPerCard` are what a
  shop trade cannot offer — coins AND permanent power on the cards that SURVIVE, resolved
  in one motion without spending a node visit. The buffs are seeded and applied by
  `resolveTrim` AFTER the burn, on the surviving deck only, so a buff can never land on a
  card the player is about to lose. Lives on `RunState` rather than on a phase because the
  relic can be claimed from either `reward` (a boss pick) or `gain` (an event/boon roll),
  and both screens gate their Continue button on the same field rather than each carrying
  their own copy of it.
- `Relic.when` (`RelicCondition`) — build-arounds, re-evaluated every fold. **Production
  callers must use `runMods(run, registry)`, not bare `aggregateMods`** — the bare form has
  no context, and both a conditional relic and a scaling one read as contributing NOTHING
  without one (the safe direction).
- `elementBuffs`/`elementKeywords` are keyed by `CardElement`, not `Element`, so `neutral`
  is addressable. It previously was not, which silently excluded a whole card class.

**The hand cap is a price, and only cursed relics may charge it.** With one draw a turn,
a tighter hand means discarding live cards — the most violent thing in the table. It is
legal because a relic can pay for it, but only in the band where prices belong, only down
to `MIN_HAND_CAP_DELTA` (-3, so a cap of 7), and only against something that changes the
game — a whole-deck discount, a draw engine, a board-wide buff — never a number. All three
conditions are asserted, as is the old rule that every card-GRANTING relic carries
matching room to hold them.

**A relic's `enemyHpMult` is never rounded away.** Enemy HP must stay even and the normal
pool is small (8-16 HP early), so rounding to nearest swallowed relics whole: a 10 HP
enemy under a 10% cut is 9, which rounds back to 10. `scaleEnemyHp` (encounters.ts) rounds
to nearest and nudges one step ONLY when the result would be a no-op, which keeps the
number near the intended proportion instead of flooring a 25% cut into a 40% one. Values
ABOVE 1 are legal and are a PRICE (Covenant Stone), not a bug — but capped at
`MAX_ENEMY_HP_PRICE` (see above), since this is the shape most likely to quietly stack
with the act curve itself rather than sit beside it.

### Autopilot: the price paid in agency

`GameState.autopilot` (`{ player, everyRounds }`) plus the `autopilotActive(state)`
predicate is the whole mechanism: on qualifying rounds the AI plays the human's turn.
Seated by a cursed relic (`RelicMods.autopilotEveryRounds`) or a Trial twist
(`kind: 'autopilot'`), and read by nothing in the pure engine — `useGame` derives one
`autopilot` boolean from the predicate and uses it in three places.

- **The trigger is ROUNDS, not cards played.** A round boundary is on the HUD before you
  commit to a play, so "round 4 is theirs" is a fact you build a hand around. A mid-turn
  seizure keyed off a card count would fire in the middle of a combo with no warning,
  which is a different and much worse thing than a hard rule you can plan against.
- **`dispatch(action, fromAi)` — the bypass is load-bearing.** Human input is refused
  while the commander holds the seat; the AI driver is the one caller allowed through, and
  `commitEndTurn` takes the same flag and threads it to the `dispatch` at the end of the
  combat animation. Without that thread the AI could play cards on a seized turn but never
  END it: its own endTurn hit the input lock, the turn stayed open, and the driver replayed
  the combat animation forever.
- **It is one-sided by nature, not by choice** — the enemy seat is already the AI's, so
  the twist has no enemy half to state. That is compatible with the Trial design rule
  because that rule is STATEDNESS, not symmetry (see the Trial section): the interval is
  named in the blurb and the banner counts down to the next seizure.
- `aggregateMods` takes the MINIMUM interval across relics, never the sum — two relics
  that each seize every few rounds must not compound into a seizure every round and a half.

### Relics are for sale

`storeRelicStock` puts `ECON.STORE_RELIC_SLOTS` (2) ordinary relics plus exactly ONE
cursed relic on every store shelf, derived from `(node.seed, act, storeRerolls)` like the
card stock and read through that one helper by both view and reducer. `buyRelic` charges
`relicPrice(rarity)` and grants through the same `grantRelic` a reward screen uses, so a
bought relic's one-shot payload resolves identically.

- **Bands stop at rare.** A boss relic is what a boss fight pays for; making it buyable
  would make the reward purchasable. So across the whole game: commons and rares are found
  OR bought, boss relics are only ever won, cursed relics are only ever bought.
- **Relics can be UNBOUND — the run's only relic removal.** `unbindRelic` (a store
  service, priced by `ECON.RELIC_UNBIND_PRICE`) exists because a relic can stop fitting a
  run: a draw engine in a deliberately thin deck mills its owner out faster every turn,
  and nothing could undo that. It COSTS rather than pays, and the price rises with the
  band — cheap for a common that no longer fits, dearest of all for a CURSED relic,
  because if shedding a curse were cheap every curse would collapse into "take the
  benefit, pay a small fee, keep the benefit", which is not a trade at all. A one-shot
  that already resolved (`maxHpDelta`, `startCoinsDelta`, `trimDeck`) is never refunded;
  the repair debt and spent flag DO leave with the relic.
- **The cursed slot is always present and always exactly one.** A shop that sometimes has
  a curse is a shop you cannot plan a visit around. It is also the cheapest thing on the
  shelf and the strongest — the price you actually pay is written on the relic, not the tag.
- `storeReroll` clears `boughtRelics` alongside `bought`, since both shelves key off the
  same reroll counter.

### Events: the run REMEMBERS

**Every choice states its exact effect, and that line is DERIVED.** `outcomeSummary` /
`choiceSummary` (events.ts) render an `EventOutcome` into plain English, and `EventView`
prints it under each choice's flavour label. Reading it off the same outcome the reducer
consumes is the whole point: an authored gloss saying "burns 2 cards" silently becomes a
lie the moment the outcome is retuned to 3, whereas this cannot disagree with the effect.
The switch has a `never` exhaustiveness guard, so a new outcome kind fails to compile
until it has a sentence. Nested gambles are BRACKETED — flat, a press-your-luck chain
reads `80%: 60%: X — otherwise Y — otherwise Z`, which gives the reader no way to pair an
outcome with the roll that caused it.

`mendRelics` is the interaction point the broken shape needs: it repairs broken relics
first (they are actively costing you something) and then relights spent ones, up to
`count`. Without it a broken relic's debt is payable in exactly one currency, which makes
the whole family a flat "wait N fights"; with it, taking one late becomes a routing
question. `EventRequirement.mendableAtLeast` hides the offer when there is nothing to
mend — `requirementMet` HIDES a failing choice rather than greying it, so a repair shop
with nothing to repair would otherwise be a dead door. Selling or trading a relic deletes
its repair debt, or re-acquiring it later would inherit a countdown from a life the
player no longer remembers owning.


Every event used to be one screen, one choice, one payout, after which the run forgot it
happened. That single missing capability ruled out the three structures carrying most of
the interest in comparable games. Three fields on `RunState` supply it:

- `eventFlags` — an event both READS flags (`EventChoice.requires`,
  `AdventureEvent.requiresFlag`) and WRITES them (the `flag` outcome). `pickEvent(seed,
  seen, flags)` gates the later parts of a chain behind the earlier ones, so "The Tinker,
  Again" can only be drawn by a run that met the Tinker. A test asserts every
  `requiresFlag` is actually settable by some other event.
- `eventBank` — deposit coins at one event, collect at a LATER one (`deposit`/`withdraw`).
  The first reward in the run that is a reason to ROUTE somewhere.
- `spentRelics` — shared with the relic layer (see above).

`EventChoice.requires` is checked by `requirementMet` (exported from run.ts) and the view
gates the BUTTON on the exact same predicate the reducer gates the transition on — a
choice that fails is HIDDEN, not greyed, since it is not a door the player can work toward
at this node. New outcome kinds beyond the originals: `multi` (a bargain and its price in
one choice; a `combat` inside it short-circuits the rest), `flag`, `deposit`, `withdraw`,
`trimDeck`, `purge`, `temper`, `sellRelic`, `tradeRelic`. `trimDeck`/`purge` both floor at
`ECON.MIN_DECK_SIZE`; `temper` only ever picks cards that have stats.

### Element-conditional deck buffs (Adventure)

Relics that buff a player's cards by element — stats (`RelicMods.elementBuffs`) and/or
keyword grants (`RelicMods.elementKeywords`) — are applied by `applyDeckBuffs` (`relics.ts`)
as TRANSIENT `stat`/`keyword` enhancements on matching owned copies, reusing the enhancement
→ `adv:${uid}` materialization. So they're player-only (the enemy's shared base defs are
untouched), stack with real enhancements, keep any keyword the card already has, and apply
to every draw, not just the opening hand. It must be fed to BOTH `buildRunRegistry({ deck })`
and `playerDeck(...)` in `CombatView` so the materialized defs and the deck-list ids agree.
Only units/foundations have stats/grantable keywords; spells/environments are skipped, as
is `aquatic` (engine-special-cased, not in the grantable subset). The persisted run deck is
never mutated. Per-element keyword identity ("element toolkits") is documented in
`docs/card-creation-guide.txt`. This is the reusable seam for future element-scoped content.

### Multi-target spells

`applyEffects` walks a cursor over `targets`, consuming ONE ref per targeted effect (AOE
scopes and `leaderUnit` resolve themselves and consume none). `targetRefsNeeded(effects)`
(exported from `effects.ts`) is the count, and the UI must ask for exactly that many.

The UI used to dispatch `targets: [ref]` unconditionally, so any card with two targeted
effects was uncastable — and it failed SILENTLY: the second effect found no ref, the cast
was abandoned, and even the first strike was rolled back, so the spell appeared to do
nothing. Eksana's `Double Contract` signature upgrade (which duplicates Swift Kill's
damage) is the case that exposed it.

`useGame` now enters a `spellTargets` selection when `targetRefsNeeded > 1`: the drag
supplies the first ref, clicks supply the rest, and the cast dispatches once enough are
collected. Repeats are allowed — "deal 5 to an enemy, twice" may legitimately be aimed
twice at one body. Any new effect kind added to `TARGETED` is automatically counted.

### Statuses

`src/engine/status.ts` is the single source of truth. Statuses have two backing stores —
`unit.status` (burn/poison/sleep/freeze/drowning) and `unit.keywords`
(shield/zombified/trueShield/taunt) — and `STATUS_SPECS` is the one table saying which is
which, plus `harmful` (blocked by Immunity) and `cleansable`. Use `applyStatus`,
`clearCleansableStatuses`, `isHarmfulStatus`; never hand-roll the classification in a
call site — duplicating it is what caused Purify to permanently destroy a drowning unit's
attack and made Zombified un-appliable to your own Immune unit.

Two rules the table encodes: **Zombified is BENEFICIAL** (it revives at 1 HP, so Immunity
must not block it and cleanse must not strip it), and **drowning is POSITIONAL, not an
affliction** — it is owned by `drowning.ts` (paired with `predrownAttack`) and is never
cleansable. Adding a status = adding a row, then handling its payload in `applyStatus`.

### Adventure run HP

Adventure is an attrition run: `RunState.hp`/`maxHp` persist leader HP BETWEEN fights.
`buildEncounterState` seats the player at the carried `hp` while leaving `leaderMaxHp`
at the leader's undamaged total — so the Signature threshold stays half of MAX and a
wounded player starts nearer their Signature (intended comeback valve, not a bug).
`resolveCombat(run, registry, won, playerHp)` writes the surviving HP back — clamped to
`[1, hpCeiling(maxHp)]`, since carried-in HP may already include temporary HP from an
earlier Rest and must survive a fight it wasn't spent in — then pays the POST-BATTLE
HEAL: `victoryHealAmount(mendLevel)` = `ECON.VICTORY_HEAL_BASE` (10) plus
`ECON.MEND_HEAL_STEP` per Mend taken, clamped to `maxHp` (`Math.max(next.hp, …)`, not a
plain `Math.min`, so it never claws back overheal already carried in). Winning never
manufactures TEMPORARY HP — real HP sitting above `maxHp`, bounded by `ECON.OVERHEAL_MULT`,
which the engine's in-fight `healLeader` will never top back up (it still clamps at
`leaderMaxHp`) — only `restHeal`/`restKindle` do, by clamping to `hpCeiling` instead of
`maxHp` and only rejecting once that ceiling itself is reached. That split is what makes
Rest worth visiting even at full health, instead of being dominated by simply winning the
next fight. `maxHp` itself never moves, so the Signature line never drifts. A `maxHpDelta`
relic still clamps to `hpCeiling`, like Rest, since it is a deliberate one-shot boost, not
combat's per-fight heal.

### Leader progression: boss unlocks + Rest Sites

Leader-defining power is earned from BOSSES, not bought at camps — Rest Sites stay
low-stakes (heal / free card / attune only).

- **Act 1 boss** awards the leader's **unique** upgrade (`LEADER_UPGRADES` in
  `src/adventure/hero.ts`) — one hand-authored upgrade per leader, one-time. Most are a
  pure `(heroPower) => heroPower` transform, so they apply to play AND the AI with no
  engine change (the engine reads the power from the registry leader at cast time, and
  `runRegistry` seats the upgraded leader). Extra targeted effects each consume their own
  target (`targets[cursor++]` in `effects.ts`), so "hits a second unit" needs no engine work.
- **Act 2 boss** awards the **signature buff** (`SIGNATURE_UPGRADES`, same file) — a
  per-leader rewrite of the SIGNATURE card, applied by `runRegistry` when
  `RunState.signatureBuff` is set. Framework only — the 13 per-leader effects are
  authored incrementally, same pattern as `LEADER_UPGRADES`; a leader with no entry
  just keeps their base signature.
- Both are boss-kill reward-screen gates (`RunPhase` `reward.unlock: 'unique' | 'signature'`,
  claimed via `claimUnlock`), resolved the same way as the existing card/relic gates.

`Rest Sites` (`src/adventure/run.ts`) offer three repeatable services, one per
visit: `restHeal` (HP), `restKindle` (burn 2 owned
cards — `ECON.KINDLE_BURN_COUNT` — for a bigger heal than plain Rest, `kindleHealAmount`
vs `restHealAmount`), and `restMend` (+1 `mendLevel`, permanently raising the post-battle
heal). `restHeal`/`restKindle` are Rest's own overheal seam (see "Adventure run HP"
above): both clamp to `hpCeiling`, not `maxHp`, so neither is ever wasted at full health
— they bank temporary HP instead, and are rejected only once the ceiling itself is
reached. Mend is the only service that pays off LATER rather than now: it permanently
raises a heal that itself clamps at `maxHp` (see above), so its value is realised the
next time a win leaves you wounded, not through overheal. Attune (+1 element
cap, for coins, `attuneCost`) lives at **Enhance** nodes instead, as the alternative to
`applyEnhancement`'s card working (`enhanceAttune`) — NOT at Rest. Attune's cap and any
unique's non-power state mods (e.g. Naife's Environment discount) are collected by
`heroStateMods` and applied via `applyHeroModsToState` in `CombatView`, alongside relic
mods. This whole progression system replaced a generic efficient/empowered/ruthless trio
bought at Rest that reached 13/9/1 leaders respectively and left four leaders with no
upgrade path at all.

### The board can be RE-LAID

`LaneId` is a POSITION; `LaneType` (`heights`/`ground`/`water`) is what that position IS.
Splitting the two is what lets a fight change the terrain without touching anything else:
`GameState.laneTypes` (absent = `DEFAULT_LANE_LAYOUT`) overrides the types, the five
columns keep their ids and their left-to-right order, and so adjacency (`adjacentLanes`,
splash/collateral), the state shape, saved encounters, card data and every animation
target are all untouched. No card was edited to support this.

It works because every rule that asks "is this the high ground / the water" already had to
route through `isHeights`/`isGround` rather than compare against a string — the discipline
that was there to stop the second Heights column silently losing rules. `isWater` now
joins them (it was written inline as `lane === 'water'` in eight places), all three take an
optional layout, and `laneAllowed` moved to `constants.ts` (it depends only on lane types,
and leaving it in `engine.ts` made `bossRules.ts` import `engine.ts`, which imports
`bossRules.ts` back).

`applyLaneLayout` (`engine/bossRules.ts`) is the ONE implementation, shared by
`BossRules.laneLayout` and the `laneLayout` Trial twist — the mechanism is identical, only
who chose it differs. Two things it must re-derive, both easy to forget:

- **Drowning, for units already on the board.** A column that becomes Water sinks whatever
  stands in it (attack parked in `predrownAttack`); one that stops being Water surfaces it
  and gives the attack back. Both sides, all three slots.
- **Environment legality, against the NEW layout.** An environment that opts into Ground
  follows the ground wherever the layout puts it; one that does not opt into Water is
  refused if its column just became Water, rather than being silently placed where it
  could never legally go.

Naife's signature is this: he is the LANE CONTROL leader (move x4, a relocating hero
power), so his rule is not moving your units one at a time — it is deciding what the
columns ARE. The Drowned Coast puts Water on both flanks, silts the middle three into
Ground under Tundra, and deletes the Heights (and with them Sniper's free targeting) for
the whole fight.

### Bosses: one signature, and it BREAKS A RULE

**One signature per boss.** `Boss.rule` is REQUIRED — `bosses.test.ts` enforces every boss
has one. Four further channels used to exist: a trial `twistId`, `energyOverride`, an
asymmetric per-turn `curse`, and a `heroPowerOverride`. Every boss originally on one of
those four was eventually redesigned onto `rule`, at which point all four channels
described a shape nothing in the table used any more — `twistId` included, once the last
six bosses still on one were retrofitted onto their own leader's archetype instead — and
were deleted rather than kept "in case": an unused authoring channel is a standing
invitation to reach for the weaker tool. Four bosses used to stack two or three of these
on top of a full 30-card archetype, bonus HP and the act curve — five advantages scaling
together against a player who scales on about two. Bosses caused 23 of 34 measured run
deaths, at every act.

**A boss rule is not a trial twist.** `Boss.rule` (`BossRules` on `GameState`, resolved in
`engine/bossRules.ts`) is the reason a finale reads differently from a mid-act node. Ten of
the thirteen bosses used to carry a `twistId` whose KIND was drawn from the same table
ordinary Trials roll from — `globalBuff`, `globalKeyword`, `globalOnPlayStatus`,
`fixedEnvironments` — so a "boss gimmick" and a "trial condition" were literally the same
object. A twist ADJUSTS the board and is applied once, by rewriting the run registry or
seeding the opening state. A rule BREAKS A RULE and lives for the whole fight, which is why
it needs per-turn and per-event hooks. Every boss in the table now carries one:

| Boss | Rule | Mechanism |
|------|------|-----------|
| Failed Heir (Orsyric, Aggro) | Charge — his whole board attacks TWICE every round | `doubleCombat` |
| Guardian of Ruin (Naife, Lane Control) | The Drowned Coast — the board is re-laid, no Heights | `laneLayout` |
| The Final Stage (Corpselock, Ramp) | Metastasis — every unit you play feeds his next turn | `feedOnPlay` |
| Revolutionist Monk (Kedou, DoT) | The Cauldron — Burn/Poison on you can't be stopped or cured | `cauldron` |
| Infinitude (Aleph, Midrange) | Discipline — your units can't be buffed, healed, or grow | `disciplined` |
| Warlord's Daughter (Phantom, Control) | Behind the Mask — she steals your priciest card | `steal` |
| Screyera, The All-Seeing | Foresight — your best card is sealed every turn | `seal` |
| Ring Leader, Executioner | Execution — your priciest unit dies at end of turn | `execute` |
| False Hydra | False Prophets fill her lanes every odd round | `placements` |
| Cleath, The Architect | His board opens already built | `placements` (`everyRounds: 0`) |
| Autopus, Integer Overflow | The Mirror — every unit you play is copied to his side | `mirror` |
| Eksana, Leader of NICE | Correction — your units enter with 2 less attack | `dampen` |
| Noctua, Death Artificer | Recursion — everything that dies rises under her control | `recursion` |

The first six were retrofitted onto each leader's OWN archetype rather than an unrelated
rule-break, after the same mistake was made once and caught: a rule that does not draw
from what its leader's deck already does reads as generic no matter how well-implemented.
Kedou's deck is 13 Burn/Poison cards, so her rule is not "apply more DoT" — it is the
removal of the two-card answer (Immunity, cleanse) that would otherwise blank her whole
archetype the moment the altar starts selling Immunity. Aleph's hero power already reads
"Poison an enemy unit — it can no longer be buffed"; Discipline is that same growth-lock
generalised to the fight, at the same three chokepoints (`buffUnit`/`healUnit`/
`healLeader`) Poison already used, rather than a new mechanic. Corpselock's hero power
borrows energy from HIS OWN future; Metastasis borrows from YOURS instead, off the thing
Ramp actually does (play bodies). Naife is the LANE CONTROL leader (move x4, a relocating
hero power) — see "The board can be RE-LAID" below. Discipline and the Cauldron are both
gates on machinery that already existed (Poison's growth-lock, the Immunity/cleanse
checks) rather than new state, which is why each took one function-level change apiece.

`battleReady` is the one rule field that is not a boss's whole signature but a rider on
one: it grants Battle Ready to every unit on both sides, applied by rewriting the run
registry the way a `globalKeyword` twist does. The Hydra needs it, because a board-filling
placement that RECURS is only answerable if the board you play in response can act — play
a unit on the odd round and kill a prophet on the even one, and the prophets have already
resolved and been replaced. With it the fight becomes "how many can I clear this round",
which is a decision instead of a wait.

Three properties the table holds to, all asserted:

- **THE ROUND-ONE RULE.** Adventure fights are short and a great many never reach round 3,
  so a signature with a wind-up is a signature that does not exist in the fights that
  decide the run. Two designs were cut for failing exactly this — "your Signature never
  arrives" (most fights never reach half HP) and "from round 3 a lane closes" (most fights
  are over by then). Every rule bites on the first turn.
- **Nothing routed through `applyStatus`.** A late-run deck carries Immunity, so any rule
  expressed as a harmful status is already answered before it is written. Execution is a
  direct destroy, Correction writes the body, Recursion and the placements are board
  operations. That constraint is what makes these rules durable rather than decorative.
- **`minAct` gates the table.** Act-1 withholding softens a SIGNATURE but cannot soften an
  ARCHETYPE, and the decks are not equally lethal against a 15-card starter. `bossForAct`
  assigns a whole cycle in one deterministic greedy pass — each slot takes the first
  unused boss eligible for it — so `minAct` is respected without breaking the
  no-repeat-within-a-cycle guarantee. Eligibility is measured against position in the
  CYCLE, not the absolute act, or a second cycle at act 14 would re-gate a table the run
  has already earned.

**The act-1 gate covers the ONE remaining channel** (`bossSignatureActive`, encounters.ts),
and had to, back when there were several: it used to read `boss.twistId && act > 1`
inline, so bosses whose signature lived on a different channel kept it at full strength in
act 1 — Screyera's mill clock, Autopus's free elite every turn and Ring Leader's hero-power
rewrite all fired against a starter deck, which is precisely the spike the withholding rule
exists to prevent.

**One phase.** A two-phase reveal (boss stands back up with its signature on) was built
and removed: standing the leader back up re-armed its Signature threshold, so the boss got
its Signature card twice — once per bar — and the remount the swap needed fought with the
combat audio. A boss is one fight under one stated rule. The act-1 withholding above is
the early-game relief the phases were reaching for.

**The pre-boss layer is always store or rest** (`mapgen.ts`), never Enhance: an altar
hands out one working on one copy, which is not preparation you can aim at a boss you can
already see. A store buys an answer and sells dead weight; a rest restores the HP the
boss is about to take.

### The act curve is LOGARITHMIC

`actScale` (`encounters.ts`) is `1 + ACT_LOG_GROWTH * ln(act)`: always rising, always
decelerating. The act treadmill is **not** the run's final exam — the Copper Mech is, and
it does not scale at all, so the acts exist to build a deck capable of attempting it. An
exponential curve makes the acts themselves the endgame and walls out every run before
the Mech is ever reached.

Two consequences worth stating rather than rediscovering:
- Late acts DO get easier in real terms, because the player compounds (deck,
  enhancements, relics, leader upgrades, `ECON.ACT_MAX_HP_GAIN`) while this curve
  flattens. That is the deliberate trade.
- A log curve's steepest step is its FIRST one — act 1 -> 2 is the biggest jump and every
  step after is smaller. Early-act relief therefore has to come from act-specific rules
  (the act-1 boss's twist being withheld), never from reshaping the curve.

The curve test measures a PLAIN combat node, not a boss (different bosses carry different
`bonusHp`, so boss totals are not monotonic across acts even when the curve is), and
measures deceleration over SPANS, not single steps (HP is rounded even, so consecutive
acts can tie).

### The act curve: gentle exponential

`actScale` (`encounters.ts`) is `ACT_GROWTH^(act-1)` with **`ACT_GROWTH = 1.13`**.

    act    1     2     3     4     5     6     8    10
    1.13  1.00  1.13  1.28  1.44  1.63  1.84  2.35  3.00
    1.30  1.00  1.30  1.69  2.20  2.86  3.71  6.27 10.60   <- the original

The act treadmill is not the run's final exam — the Copper Mech is, and it does not scale
at all — so growth is deliberately small. A LOGARITHMIC curve was tried for that reason
and rejected: it flattens to ~1.9x forever, and against a player who compounds (deck,
enhancements, relics, leader upgrades, `ECON.ACT_MAX_HP_GAIN`) a plateau means late acts
stop being fights. An endless run needs its acts to keep meaning something.

At 1.13, acts 1-2 are a genuine on-ramp (act 2 costs 13% more than act 1, not 30%) —
which is what MOST RUNS CLEARING ACT 2 requires, and clearing act 2 is what awards both
the leader unique and the signature buff. `.tuning/advRun.ts` prints an ON-RAMP block
measuring exactly that.

The curve test measures a PLAIN combat node, not a boss (different bosses carry different
`bonusHp`, so boss totals are not monotonic across acts even when the curve is), and
measures acceleration over SPANS, not single steps (HP is rounded even, so consecutive
acts can tie).

### Enemy HP: one curve, two multipliers

`normalHp(layer, act)` is the baseline pool, and every kind is a multiple of it
(`encounters.ts`):

| kind | HP |
|------|----|
| combat | `normalHp` |
| **trial** | `normalHp` — identical to a plain fight; a Trial's difficulty is its TWIST, never a bigger body |
| elite | `ELITE_HP_MULT` (1.5x) |
| boss | `BOSS_HP_MULT` (2x) |

Expressed as multipliers of ONE curve rather than three independent formulas, so the
ordering (boss > elite > normal) is true by construction instead of something a cap
enforces afterwards — the previous shape needed exactly such a cap, and a named Elite's
`bonusHp` was being added *after* it, letting an Elite out-tank the boss it precedes.
`NORMAL_HP_BASE` now moves the whole game's difficulty coherently.

The normal pool is deliberately SMALL. Early fights were being won by deck-out — a
trimmed, cheapest-first enemy deck still packs efficient removal — so grinding down a big
HP bar cost the player far more HP than the fight's difficulty warranted.

A named Boss/Elite's own `bonusHp` is still added ON TOP of the curve; it is
per-encounter character, not part of the ratio. `encounterHp` is exported so the ratio
can be asserted on the curve itself rather than on totals that include it.

### Act 1 is the introduction, and is priced off the curve

Two act-1-only rules, both measured with `.tuning/advRun.ts` under the real `planTurn`
AI (two independent 39-run sweeps agreeing: 34/39 runs died, 26-27 in act 1, **23 of
those at a boss**, while ordinary act-1 combat killed 2-3 runs total):

- The act-1 boss's HP falls out of the shared curve above (2x a very small act-1 normal
  pool), so it no longer needs its own constant — `ACT1_BOSS_HP` is gone.
- The act-1 boss fights **without its signature twist** (`act > 1` in `rollEncounter`).
  A boss twist rewrites the whole board; meeting one on a 15-card starter deck, before
  any relic/enhancement/leader upgrade exists to answer it, was the run's biggest spike.

The boss keeps its name, archetype and FULL 30-card deck either way. Softening a boss
through deck size was tried and measured WORSE — the trim is cheapest-first, so a
smaller deck is a *concentrated* one. **HP and the twist are the only legitimate levers
for early bosses.**

### Store nodes: per-visit stock

`rollStoreOffer` returns `StoreSlot[]`, not bare card ids. A slot carries its own
per-visit `discount` and, from act 2 onward, an `enhancement` already worked into the
copy (`storeEnhancedChance`) — the shop was previously the one node whose offer never
varied. Price a slot with `slotPrice`, never `buyPrice`, which knows nothing about
either. Shop enhancements are drawn from the COMMON pool only (`rollShopEnhancement`):
a shop must not undercut the altar's rares.

`storeReroll` restocks for escalating coins (`storeRerollCost`, charged from the first
one — the altar's first reroll is free because it hands you a single working, a shop
already gave you six). It clears `node.bought`, since the indices no longer point at the
same cards.

**Read stock through `storeStock(run, registry, node)`, never `rollStoreOffer` directly.**
The view and the reducer each used to call the roller with their own arguments — the view
omitted `extraStoreSlots` — so a relic that widened the shop desynced the displayed card
from the one an index actually bought.

### Payouts outside battle: the `gain` phase

Anything gained outside a fight resolves on a `gain` phase (`schema.ts`, rendered by
`GainView`) instead of silently landing in the deck or relic tray:

- An event's ROLLED grant becomes a pick-1-of-3 (`relicChoices`/`cardChoices`), the same
  shape a battle reward uses — `pickGainRelic`/`pickGainCard` claim it, and `leaveGain`
  refuses while a choice is still pending.
- A FIXED grant (a named event card, the junk from a `curse`) is shown, not chosen.
- An opening boon's relic is offered the same way, so a run begins on the screen that
  hands it over rather than on the map with an unexplained relic already in the tray.

Events used to resolve straight back to the map, and their authored `result` line was
written, stored and never rendered anywhere.

**Gate on `.length`, never truthiness.** An empty choices array is still truthy, so a roll
that had nothing left to offer (every relic in its bands already owned) rendered an empty
grid with no way forward and no Continue. `pickRelic` likewise deletes an empty bonus roll
rather than storing it.

### Opening boons

A run's first decision is made on the leader-preview screen, not five nodes in: three
boons rolled from the run seed (`data/boons.ts`, `rollBoons`), one taken, applied by
`applyBoon` inside `startRun`. `boonId` is the LAST parameter of `startRun` and is
optional — every pre-boon caller and test fixture keeps working and gets a plain run.

The seed is fixed on the preview screen BEFORE the boons are rolled, and the same seed
is handed to `startRun`; rolling the seed at click time instead would offer one set of
boons and found the run on another.

`Boon` is a bag of optional fields and `applyBoon` is the only thing that reads them, so
**every field must be handled there** — an unhandled field is silently free power. A
test asserts each declared field is exercised by some boon and actually changes the run.
Boons shape a deck, never the road: they must not touch `map`, which is also asserted.

**Every boon is priced at ONE UNIT — about 250-300 coins of value.** The table drifted to
a better-than-5x spread because nothing measured it: `deep-attunement` handed out two
attunes worth ~800 coins (`attuneCost` is `60 * 1.7^cap`, so the 4th and 5th points cost
~295 and ~500), `field-medic` at Mend 2 paid +10 HP on *every* win, and `full-purse` gave
150 — barely a common relic, and only once you had walked to a shop. `boons.test.ts`
now scores each boon on one crude scale and asserts the spread stays within 2x; that
metric immediately caught a Blessed Steel retune that had overshot to ~2x its neighbours.
Three corollaries it encodes:

- **Delayed value must exceed immediate value.** Coins do nothing until the run reaches a
  store, so the coin boon out-pays the boon that hands you the relic directly.
- **A boon that ADDS cards must make them worth having.** Two rolled cards dropped into a
  curated 15-card starter is dilution, not a gift — `conscription` pairs them with a buff.
- **A price is allowed** (`pact-of-ash`, `borrowed-dawn`) as long as the tin says so, and
  benefit-minus-price still lands on one unit.

`Boon.relicIds` grants NAMED relics outright rather than rolling bands. That distinction
is what lets a cursed relic reach a run this way without breaking "a curse is always an
act": the blurb names it, so taking the boon *is* the act. A band roll that could surface
one would not be, and `rollRelicChoices` still filters the cursed band out of every
reward path.

`Boon.coinsPerAct` is the one field that is not a single upfront grant — it pays out
again at the START of every act, read off `run.boonId` by BOTH `applyBoon` (the opening
act) and `nextAct` in run.ts (every act after), so there is exactly one place that says
how much and how often and the two can never drift apart. Priced in `boons.test.ts` with
a discount factor (`PER_ACT_MULTIPLIER`), not the full sum across every act a run could
theoretically reach — permadeath means a later payout is never guaranteed collected.

### Currency mechanics that read the fight, not just the coin count

Researched from HSR's Currency Wars mode ("Investment Environment"/"Investment
Strategy"). Three relic fields and three event outcomes:

- `RelicMods.coinsPerHpLost` — coins per point of HP actually spent to win a fight,
  resolved in `resolveCombat` from HP lost BEFORE the post-battle heal is applied (the
  heal is a separate reward, not a discount on what was spent). Rewards playing
  aggressively rather than conservatively, which was otherwise invisible to the economy.
- `RelicMods.coinsEarnedMult` — multiplies the base combat coin reward, BEFORE
  `coinsPerWin` is added, and stacks multiplicatively with itself and with every other
  multiplicative field (`enemyHpMult`, `storeBuyMult`, ...). The one coin field that
  keeps pace with the run's own payout curve instead of being a flat number.
- `RelicMods.spendAllForBuff` — the one relic where being RICH is the price. On claim,
  spends the whole purse in whole `perCoins` steps (`floor(coins / perCoins)`, capped at
  `maxSteps`) and buffs every eligible owned card by `steps * attack/hp` in one
  enhancement entry. A remainder below one step is kept, not lost. Worth nothing to a
  broke run, a genuine transformation to a hoarding one.
- `EventOutcome.namedRelic` — grants one EXACT relic id, no choice screen, because the
  event choice that led here already was the act (same reasoning as `Boon.relicIds`).
  Used to move a "harder run, better paid" trade OUT of the relic table and into an
  event (`the-adjudicator`), granting `overclock-contract` (`actDelta: 2`) — a player
  request specifically to keep that decision as a one-time event choice, not a shelf
  item carried the rest of the run.
- `EventOutcome.chooseRelic` — offers an EXPLICIT list of relic ids, not a band roll,
  reusing the existing `relicChoices`/'gain' screen (it only ever needed an array of
  ids). Lets an event present two hand-picked, thematically linked relics side by side —
  `the-underwriters` offers `underwriters-bond` (ongoing `coinsEarnedMult`) against
  `underwriters-payout` (a lump sum) as ONE decision. This is the "convert one relic
  shape into another" idea, reframed: a relic that converts a DIFFERENT relic requires
  already owning that other relic, which cannot be guaranteed — so the choice lives on
  the EVENT instead of on either relic, and both halves stay simple, independent,
  foldable relics with no new claim-time state of their own.
- `EventOutcome.coinsPercent` — gain or lose a fraction of the CURRENT purse, resolved
  LIVE at choice-resolution time. Distinct from the relic-level `RelicMods.coinsPercent`
  (a claim-time one-shot); this is what makes a proportional gamble's stakes actually
  rise with how rich the run already is. `the-investment-office` stacks three tiers —
  50% guaranteed, 50/50 at ±50%, 25/75 at ±100% — the percentage-stake escalating gamble
  pattern HSR's Investment Device uses, translated from sequential re-visits (which this
  event model doesn't have) into three parallel-severity choices on one screen.

A win-streak-triggered boon was researched and explicitly REJECTED, not deferred:
permadeath means a streak can never break without ending the run, so it is identical to
a plain win count and the concept doesn't survive translation. A reroll-count-triggered
boon was deferred (not rejected) for a real gap: rerolls are tracked per-node
(`MapNode.storeRerolls`/`enhanceRerolls`), not per-run, and there are two independent
reroll systems — building this needs one new run-level counter, scoped to one system.

### The God Unit, and the Foundry that answers it

Enhancements stack without limit, keywords merge without conflict, cost floors at 0 and
Perfect Copy replicates a whole stack — so a run converges on a **God Unit**: one free,
airborne, immune body carrying every ability in the game, in several copies. That is the
POINT of the mode, not a bug in it, and nothing in the codebase caps it.

The answer is that the enemy runs the same machinery. `adventure/foundry.ts` gives enemy
decks their own workings from `FOUNDRY_START_ACT` (4), through the player's own
`ownedCardDef` materialization in a separate id namespace (`adve:`, `advEnemyCardId`) —
so a boss's Mirror copies an enhanced card at its enhanced size, and an enemy God Unit is
reachable by exactly the path the player's is. **Difficulty comes from the other side
getting better, never from the player being allowed less.** Design levers that capped the
player instead (a per-attack leader damage cap, a cost floor, an enhancement tax at the
altar) were considered and rejected for that reason.

- **DERIVED, NOT STORED, AND CUMULATIVE.** `foundryStack(runSeed, act)` seeds ONE roller
  and takes the first `n` draws, `n` growing with the act — so act 7's stack is literally
  act 6's plus one more working. The enemy's build visibly grows across the run, with no
  `RunState` field and nothing a reload can reroll. Same guarantee `rollEnhanceOffers` and
  `rollStoreOffer` give, used for CONTINUITY rather than only reproducibility. A working's
  rarity is rolled against the act it was ADDED at, not the current one, or the list would
  be a re-roll rather than an extension.
- **Keyed to the RUN seed, not the node seed**, so every fight in an act faces the same
  accumulated build: one opponent that learned, not a series of unrelated ones.
- **They outpace the player on purpose.** The player's curve is one working per Enhance
  node walked to and is capped by what the map offers; `FOUNDRY_ACT_GAIN` (3/act) is
  unconditional and steeper, so the gap opens from act 4 and is wide by act 8.
- **Depth is emergent, not a second dial.** `density(act)` picks how many distinct cards
  may carry workings and the stack is dealt round-robin across them, so as the stack
  outgrows its carriers they simply get deeper. The God Unit on their side falls out of
  the same curve rather than being special-cased.
- Scaled by `scaleAct`, so an act-shifting relic discounts this along with everything else
  it discounts and pays for.

### Both upgrade curves scale: the altar deepens, the shop widens

The altar's rare tier used to be frozen — Tough 3, Growth +3/+3, two-keyword pairs, at act
1 and act 12 alike — so the one node whose whole job is making your deck better stopped
mattering exactly when the Foundry started compounding. Both nodes now scale, on different
axes, which is also what keeps them distinct without needing a rule to separate them:

**Both step EVERY act, not every few.** Clearing an act is itself the upgrade: the altar
and the shop you walk into next act are visibly better than the ones you left. A slower
cadence meant two acts in three changed nothing at either node, and an act that changes
nothing is an act that does not feel like progress.

- **The altar sells DEPTH, free.** `masterworkStep(act)` (enhance.ts) grows the rare tier
  by one every act from `MASTERWORK_ACT` (3): high magnitudes climb (Tough 3 -> 4 -> 5...),
  fixed stat rares climb, and the keyword PAIR becomes a TRIPLE — capped there, because a
  four-keyword working is most of a God Unit handed over in one visit. It opens one act
  BEFORE the Foundry (act 4), so the player takes the first step on the curve and the
  enemy then out-accelerates them. Cost and Perfect Copy deliberately do not scale — cost
  already floors at 0, and Perfect Copy's value is the stack it duplicates, which grows on
  its own.
- **The shop sells BREADTH, for coins.** `StoreSlot.enhancements` is now an ARRAY;
  `storeEnhancedDepth(act)` is simply the act, capped at `STORE_ENHANCED_DEPTH_MAX` (4),
  and a slot rolls uniformly in `[1, that]`, so a late shelf holds a mix rather than every
  worked copy being maxed. It SATURATES early on purpose — that ceiling is what keeps the
  shop the breadth node and leaves the late run to the altar. `slotPrice` COMPOUNDS
  `STORE_ENHANCED_PREMIUM` per working, so a deep copy is never better value per working
  than a shallow one. Individual workings are still drawn from the COMMON pool only — the
  shop can hand you a half-built God Unit without ever being the cheaper route to a rare,
  which is the rule that pool has always enforced.

### Enhance nodes: free workings, paid rerolls

An Enhance node shows `ECON.ENHANCE_OFFERS` (3) offers and the working itself is FREE.
Coins buy SELECTION, not the upgrade: `enhanceReroll` redraws the row, the first reroll
at a node is free (`rerollCost(0) === 0`, so a wholly irrelevant row is never a dead
node) and each one after escalates. Rerolling does not consume the visit — only
`applyEnhancement`/`enhanceAttune` set `enhanceUsed`.

**Offers are derived, not stored.** `rollEnhanceOffers(seed, act, rerolls)` is pure in
its three inputs and `node.enhanceRerolls` is the only one the player can move, so a
reload reproduces the row exactly and rerolling is the only thing that can change it.
Never persist the rolled offers; that would reintroduce the reroll-on-reload hole the
single-offer version was written to avoid.

`EnhanceOffer` is a UNION on `sort`, not a wrapper around `Enhancement`: `duplicate`
adds a card to the deck (its own `uid`, so the copies enhance apart; `full` carries the
original's enhancements across) rather than modifying one, so every reader must branch.
`rarity` picks the pool — `rareChance(act)` is near-zero in act 1 on purpose, since the
early game is deliberately the easy stretch (see `encounters.ts`) and a turn-one rare
would flatten exactly the curve that was retuned.

Rare keyword offers are PAIRS **rolled** from `RARE_KEYWORD_POOL`, not an authored menu,
so the tier stays worth rerolling toward past the first time you see it. `canApply`
requires the card to be missing EVERY keyword in the pair — half a rare is not what was
advertised — and `DEAD_PAIRS` blocks the combinations where the second keyword cannot
fire at all (Overshot bypasses the lane's units, so Lethal/Pierce/Strike Through have
nothing to act on; Branch Shot returns before Splash Damage is checked). Adding a
keyword to the pool means checking it against the attack-type dispatch in `combat.ts`
for the same kind of cancellation.

### Trial vs Elite battle nodes; act 3+ bosses grant a bonus relic

Trial and Elite are DISTINCT battle nodes (`NodeKind`):
- **Trial** — a NORMAL-strength battle (same HP/deck as a plain combat) under a twist the
  PLAYER CHOOSES. Map-gen rolls a shortlist of `TRIAL_TWIST_CHOICES` (3) into
  `node.twistChoices`; entering the node opens the `trial` phase, and `chooseTrialTwist`
  writes the pick to `node.twistId` and starts the fight. A node that already has a
  `twistId` and no shortlist (older map, event-spawned trial, test fixture) skips straight
  to combat. Reward: `TRIAL_MULTIPLIER` (2x) coins and a relic choice — NO card pick, NO
  stat spike. Its difficulty is the twist.

  **The twist is a WAGER, priced by `TrialTwist.severity` (1-3).** A flat payout made a
  Trial a strictly BETTER combat node — identical enemy HP and deck size, double coins AND
  a relic, for a rule the player picked themselves — so the shortlist was only ever a
  search for the least inconvenient option. `trialRewardBands(severity)` and
  `trialCoinMult(severity)` (trials.ts) scale the payout: sev 1 pays `['common']` at 0.75x
  coins, sev 2 `['common','rare']` at 1x, sev 3 `['rare','boss']` at 1.35x. `mapgen.ts`
  `pickTwists` deliberately draws ONE TWIST PER SEVERITY RUNG rather than three blind
  draws, so the choice is always "how much risk do I want" instead of "which of these
  three near-identical rules is marginally better". `TrialView` states the band and the
  coin multiplier on the button, before the player commits.

  **Why a choice and not a roll:** a twist is symmetric as a RULE but not in EFFECT.
  "Every unit has Immunity" is a shrug for a stat deck and deletes a poison deck's whole
  game plan, and the enemy archetype is random — so a single rolled twist was a coin flip
  on the player's own deck, with routing around the node the only response. Trials
  measured as the second-deadliest node kind in the run, behind only bosses. The condition
  still binds both sides; which condition is now the player's call. `chooseTrialTwist`
  validates the pick against the node's own shortlist — otherwise a client could fight a
  Trial under any twist, boss signatures included.

  **STATED, not necessarily SYMMETRIC.** The original rule was that a twist must bind both
  sides identically. The property that actually makes a twist plannable is that it is
  fully stated before the player commits, which an asymmetric rule is equally capable of —
  so the rule is now statedness, and the `sided` twist kind exists for twists that name
  both halves of a bargain ("the enemy draws 2 extra cards every turn; you open with 3
  extra cards and 2 extra energy"). Only `sided` and `autopilot` can be one-sided: stat
  and keyword rules are applied by rewriting the SHARED run registry and so cannot be
  aimed at a seat, while draws, opening cards and energy are plain state and can.
  `autopilot` is one-sided by NATURE rather than by choice — the enemy seat is already
  played by the AI, so "the commander takes your turn" has no enemy half to state.

  **Twist kinds beyond the original three.** `fixedEnergy` (rides `energyOverride`),
  `globalDraw` and `sided` (ride `turnCardMod`), `shortDecks`, and `autopilot` (rides
  `GameState.autopilot` — see the Autopilot section) all change the SHAPE of
  the fight rather than a stat on every unit, and every one of them runs on a seam the
  engine already had for boss curses — a whole new category of Trial cost no engine work.
  `shortDecks` touches only `GameState.players[n].deck`, which is rebuilt per encounter,
  so a Trial can never cost the player a card they own.
- **Elite** — a beefier battle: `ELITE_HP_BONUS` (`encounters.ts`) and `depth + 4` in
  `encounterDeckSize`. Reward: `ELITE_MULTIPLIER` (2x) coins and a wider
  `ELITE_CARD_CHOICES` (5, vs `DEFAULT_CARD_CHOICES` 3) pick — NO relic. `mapgen.ts`
  guarantees a few per act via a dedicated Elite conversion pass (mid/late layers only);
  Trials are what `rollKind` rolls (~15%). Elites are NAMED (`data/elites.ts`, chosen by
  `eliteForNode` from the node seed) and reuse the `Boss` data shape at a smaller scale:
  name, icon, gimmick, an authored `leaderId` whose archetype they play, and a small
  `bonusHp`. A named Elite may carry its own MILD `twistId`; that is separate from
  `node.twistId`, which stays a Trial-only channel (mapgen never puts one on an Elite),
  so the two systems cannot collide. Like a boss, an Elite's `leaderId` must resolve to a
  real archetype deck — `rollEncounter` throws rather than silently substituting.

Boss kills grant progression: act 1 → leader unique, act 2 → signature buff (both via
the `unlock` reward-phase gate). Act 3+ bosses have no unlock left to award, so they
instead grant a SECOND relic pick — `RunPhase.reward.bonusRelic` (schema.ts) is an
internal-only flag `pickRelic` (run.ts) checks: after the first relic is claimed and
`relicChoices` would normally clear, if `bonusRelic` is set it instead rolls a fresh
`relicChoices` (same `['rare','boss']` bands, excluding what's now owned) and consumes
the flag so it only chains once. No new UI or relic content needed — same screen fires
twice.

### Test conventions

Tests use the helpers in `src/engine/testkit.ts`:
- `makeState()` / `withUnits()` / `withHand()` — build precise `GameState` fixtures
- `applySeq(registry, state, actions[])` — apply a sequence of actions, assert no errors
- Tests live alongside source files as `*.test.ts`

### Key source files

| File | Purpose |
|------|---------|
| `src/cards/schema.ts` | Zod schemas — single source of truth for all card/leader types |
| `src/cards/registry.ts` | Builds the card/leader lookup Maps; `expandKeywordEffects` folds `mover`/`expel`/`debuff` keywords into trigger effects at build time |
| `src/cards/data/starter.ts` | All authored cards, leaders, and pre-built archetype decks |
| `src/cards/abilities.ts` | Keyword/status labels, icons (`ABILITY_INFO`/`STATUS_INFO`/`ELEMENT_ICON`), and tooltip text |
| `src/cards/store.ts` | localStorage persistence: custom cards, card overrides, leader overrides |
| `src/engine/types.ts` | `GameState`, `PlayerState`, `UnitInstance`, `LaneId`, etc. |
| `src/engine/constants.ts` | All numeric rules constants (`RULES`, `LANES`, `ELEMENTS`) |
| `src/engine/engine.ts` | `applyAction`, `legalActions`, `endTurn`, `beginTurn` |
| `src/engine/effects.ts` | `applyEffects`, `applyTriggeredEffects`, `processDeaths`, `firePolish`, `fireBloodlust` |
| `src/engine/combat.ts` | `resolveCombat`, `dealAttack`, `applyOnHit` |
| `src/engine/environment.ts` | `refreshLaneEnvironment` — applies/strips env keyword grants |
| `src/engine/board.ts` | `locateUnit`, `buffUnit`, `createUnitInstance`, `applyStatusEffect`, `relocateUnit`/`vacateSlot` (shared move/back-promotion) |
| `src/engine/damage.ts` | `mitigate`, `damageLeader`, `healUnit`, `healLeader` |
| `src/engine/draw.ts` | `drawCard` — handles deck-out Null cards |
| `src/engine/hand.ts` | `addCardToHand`, `forgetCard` — enforces hand cap |
| `src/engine/testkit.ts` | Test fixtures: `blankState`, `unit`, `place`, `testRegistry` |
| `src/ui/App.tsx` | Top-level React shell: game board, tabs, event log, card detail, debug/sandbox panel. Exports `MiniCard`, `CardDetail`, `cardAbilityLine`, `effectLine`. |
| `src/ui/useGame.ts` | Central UI hook: dispatches actions, orchestrates the combat animation, holds sandbox/hint state |
| `src/ui/combatFx.ts` | DOM-driven combat/ability animations (attack lunges, sniper tracer, status/keyword flourishes) |
| `src/ui/DeckBuilder.tsx` | Deck construction UI (filters, grouping, mana-curve insights) |
| `src/ui/CardStudio.tsx` | Combined Cards tab: Leaders section (rich LeaderCard grid) + Cards section (list/grid toggle). Also houses all card/leader editors. |
| `src/engine/ai.ts` | AI opponent — 2-ply beam search with lethal check. `chooseAction` / `greedyAction` / `endTurnChoices`. `foundationGrantValue` in `evaluate()` credits standalone foundation grants so the AI understands combo setup. |

## UI Layout

### Tab navigation
Four top-nav tabs: `🎮 Game`, `🃏 Deck Builder`, `📖 Cards`, `⚗️ Balance Lab`. There is no separate Collection tab — it was merged into Cards.

### Game screen (`.play`)
Three-column grid: `250px 1fr 190px`
- **Left — `LogPanel`**: stats block (Round, Energy, Hand, Deck, HP — both players) above a scrolling event log. Sticky.
- **Center — `.board`**: vertical field (opponent leader bar → 4-lane grid → player leader bar) + hand + debug panel
- **Right — `Controls`**: element bank comparison view (mirrored bars, yours vs opponent's) → banking tiles (2×2 +/− per element) → end turn. Sticky.

### Leader bars
Horizontal strips at top (opponent) and bottom (player) of the field. The active player's bar includes the leader skill button inline. Leaders carry `data-leader={player.id}` for animation targeting.

### Cards tab (CardStudio)
`Leaders | Cards` segment toggle at top.
- **Leaders section**: `LeaderCard` grid — element-coloured header, HP, 4-element caps grid, hero power block (name + ⚡cost + text), signature chip, Edit button.
- **Cards section**: filters + sort (unchanged) + `☰ list / ⊞ grid` view toggle. List = `StudioRow`; grid = `StudioGridCard` (MiniCard + action buttons).

## Game Rules Summary

Full rules are in `docs/rules-reference.txt`. Card/leader authoring guide is in `docs/card-creation-guide.txt`. Key constraints the engine enforces:
- Water lane: units without `aquatic` or `airborne` enter the `drowning` state (0 attack) and take `RULES.DROWN_DAMAGE` at the start of their owner's turn — a drowning unit is a temporary body-block on a clock, not permanent dead weight. `engine/drowning.ts` owns the rule (`reconcileDrowning`); it is re-evaluated on play, on relocation, and whenever Environment grants change (an env granting `aquatic` un-drowns).
- Hand cap: 10 cards; excess discarded. `addCardToHand` (`engine/hand.ts`) is the ONLY way a
  card may enter a hand — draw, conjure, expel, deck raid, Signature and the debug injector all
  go through it, and it forgets the overflow to the discard pile. Never push onto `player.hand`
  directly; that is exactly how the injector used to carry a player past the cap. Deck-out
  produces Null cards that damage own leader on death
- Leaders start at 30 HP; Signature unlocks at HALF max HP (≤ 15 HP for the standard leader — dynamic, not fixed)
- Environments grant keywords persistently to all units in their lane; `refreshLaneEnvironment` applies/strips them on enter/exit
- Environment lane legality is decided ONLY by `laneAllowed` (exported from `engine.ts`): an empty `lanes: []` means **Ground only**; Water/Heights must be opted into explicitly (e.g. `shallows` is water-only and grants Aquatic). Never re-implement this rule — Adventure's pre-placed hazards and their tests import it.
- `aquatic` can be `true` (can use Water, no bonus) or an `Effect[]` that fires on entering the Water lane (forfeited if also Airborne)
- **`EVASIVE_HP_CAP`** (`schema.ts`, currently 5): a unit/foundation with `airborne` or `aquatic` cannot exceed this HP, enforced by a `superRefine` at parse time. Design rationale: such a unit sits in a lane (Heights/Water) that only a same-domain unit or a removal spell can contest, so high HP compounds two advantages the cost formula prices independently into a body that's disproportionately hard to remove — capped, not priced up. Exempt only via `leaderUnit: true` (leader-unit avatars carry the leader's own HP by design). **Known gap**: this only sees a card's own keywords — a grounded high-HP body gaining Aquatic/Airborne at runtime via a Foundation grant (Fred's Boat, Tidal Dock) or an Environment's `grantKeywords` is invisible to this check; authors granting evasion onto an existing body must respect the cap by hand.
- `targetScopeSchema` values: `self`, `leader`, `killer`, `any`, `ally`, `enemy`, `all-ally`, `all-enemy`, `lane-ally`, `lane-enemy`, `leaderUnit`
