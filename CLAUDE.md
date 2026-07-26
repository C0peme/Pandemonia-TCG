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

Four fixed lanes per player: `heights`, `ground1`, `ground2`, `water`. Each lane can hold at most two units (front/back, enabled by `doubleTeam`). A `Foundation` card can be placed standalone in a lane and bonds with the next unit placed there; while standalone it fights as a unit (it takes damage through `mitigate` like any other defender).

All unit relocation — the `moveUnit` action, the Mover keyword (`resolvePending`), the `move`/`expel` effects, and self-Movers (`selfRelocate`) — goes through the single shared `relocateUnit` helper in `board.ts`, which enforces Double-Team capacity, promotes the back-row unit when a front slot empties, recomputes Water `drowning`, and refreshes Environment grants. Add new movement paths through it, not with ad-hoc slot assignment.

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
`resolveCombat(run, registry, won, playerHp)` writes the surviving HP back, clamped to
`[1, maxHp]`. Rest Sites offer a free heal (`restHeal`, `ECON.REST_HEAL_FRACTION` of max,
rounded to an even number) that competes with purge/reforge/train for the single visit.

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

`Rest Sites` (`src/adventure/run.ts`) offer exactly three repeatable services: `restHeal`
(HP), `restTakeCard` (1-of-3 free card), `restKindle` (burn 2 owned cards — `ECON.
KINDLE_BURN_COUNT` — for a bigger heal than plain Rest, `kindleHealAmount` vs
`restHealAmount`; rejected at full HP so the burn is never wasted). Attune (+1 element
cap, for coins, `attuneCost`) lives at **Enhance** nodes instead, as the alternative to
`applyEnhancement`'s card buff (`enhanceAttune`) — NOT at Rest. Attune's cap and any
unique's non-power state mods (e.g. Naife's Environment discount) are collected by
`heroStateMods` and applied via `applyHeroModsToState` in `CombatView`, alongside relic
mods. This whole progression system replaced a generic efficient/empowered/ruthless trio
bought at Rest that reached 13/9/1 leaders respectively and left four leaders with no
upgrade path at all.

### Trial vs Elite battle nodes; act 3+ bosses grant a bonus relic

Trial and Elite are DISTINCT battle nodes (`NodeKind`):
- **Trial** — a NORMAL-strength battle (same HP/deck as a plain combat) under a fixed
  twist condition. `node.twistId` is rolled once at map-gen; `rollEncounter` falls back
  to a random twist for an ad-hoc trial without one. Reward: `TRIAL_MULTIPLIER` (2x) coins
  and a relic choice (`['common','rare']`) — NO card pick, NO stat spike. Its difficulty
  is the twist.
- **Elite** — a beefier battle: `ELITE_HP_BONUS` (`encounters.ts`) and `depth + 4` in
  `encounterDeckSize`, and NO twist. Reward: `ELITE_MULTIPLIER` (2x) coins and a wider
  `ELITE_CARD_CHOICES` (5, vs `DEFAULT_CARD_CHOICES` 3) pick — NO relic. `mapgen.ts`
  guarantees a few per act via a dedicated Elite conversion pass (mid/late layers only);
  Trials are what `rollKind` rolls (~15%).

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
- First player cannot attack on round 1
- Water lane: units without `aquatic` or `airborne` enter the `drowning` state (0 attack) and take `RULES.DROWN_DAMAGE` at the start of their owner's turn — a drowning unit is a temporary body-block on a clock, not permanent dead weight. `engine/drowning.ts` owns the rule (`reconcileDrowning`); it is re-evaluated on play, on relocation, and whenever Environment grants change (an env granting `aquatic` un-drowns).
- Hand cap: 10 cards; excess discarded. Deck-out produces Null cards that damage own leader on death
- Leaders start at 30 HP; Signature unlocks at HALF max HP (≤ 15 HP for the standard leader — dynamic, not fixed)
- Environments grant keywords persistently to all units in their lane; `refreshLaneEnvironment` applies/strips them on enter/exit
- Environment lane legality is decided ONLY by `laneAllowed` (exported from `engine.ts`): an empty `lanes: []` means **Ground only**; Water/Heights must be opted into explicitly (e.g. `shallows` is water-only and grants Aquatic). Never re-implement this rule — Adventure's pre-placed hazards and their tests import it.
- `aquatic` can be `true` (can use Water, no bonus) or an `Effect[]` that fires on entering the Water lane (forfeited if also Airborne)
- `targetScopeSchema` values: `self`, `leader`, `killer`, `any`, `ally`, `enemy`, `all-ally`, `all-enemy`, `lane-ally`, `lane-enemy`, `leaderUnit`
