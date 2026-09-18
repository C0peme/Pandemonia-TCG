/**
 * Adventure starting decks — the 15 cards a run begins with, per leader.
 *
 * FIFTEEN, half of a full 30-card deck. Hand-authored: starters are a design surface, and
 * deriving them from the archetype decks would silently reshape them on every rebalance. A test
 * guards that every id exists, every leader is covered, no card appears more than
 * `RULES.MAX_COPIES` times, and every pip fits its own leader's caps.
 *
 * BALANCED ON CURVE, NOT ON CARD VALUE. Measured on act-1 layer-1 (the easiest fight in the
 * game), an earlier generation of starters lost an average 17.9 of 30 HP with a spread of 2.5
 * (Orsyric) to 30.0 (Cleath, who LOST 2 of 4 outright). Run HP persists between fights, so a
 * starter that bleeds 27 HP on the opening node has effectively ended the run before it began.
 *
 * The predictor was CURVE, and total formula value was actively misleading — Cleath had the
 * HIGHEST card value of any starter (55.6) and the worst result, because eight of its eleven
 * cards cost 4+ and an early enemy is dead or has won long before a 7e Foundation lands.
 * Orsyric, the cheapest starter and the LOWEST value (18.7), lost 2.5 HP.
 *
 * So each starter aims for: plenty at <= 2 TOTAL cost (energy + pips), at most ~3 at 4+,
 * nothing above 5, and a clear majority bodies. Archetype identity lives in what the cards DO,
 * not in expensive top-end that never gets cast.
 *
 * REBUILT FROM THE CURRENT POOL rather than edited forward. The set has since been through a
 * uniqueness pass and a whole-pool reprice, so the previous lists were selected against cards
 * and prices that no longer exist — several leaned on bodies that had become strictly worse
 * than a newer neighbour, and every cost in them was the old curve's.
 *
 * Every pip is checked against its OWN leader's caps — an audit once caught Screyera holding
 * two Launch Ramps at 2 Fire against a Fire cap of 1: uncastable for an entire run, and
 * unfixable by the player, since Adventure has no deckbuilder to cut them.
 */
export const ADVENTURE_STARTERS: Record<string, string[]> = {
  // DoT (fire F3 / nature N3) — every cheap body carries a status rider, so even a losing trade
  // leaves burn or poison behind. Ash Cloud is 0 energy + 1 Fire: reach on turn one.
  kedou: ['ash-cloud', 'ash-cloud', 'ash-cloud', 'ember-tick', 'ember-tick', 'ember-tick', 'plague-rat', 'plague-rat', 'firebolt', 'firebolt', 'pumpkindle', 'pumpkindle', 'coal-runner', 'coal-runner', 'strangleroot'],

  // Aggro (fire F3 / nature N3) — the BENCHMARK starter, and still the cheapest in the game.
  // Eleven bodies, nothing above 3 total, so no energy is ever left unspent.
  orsyric: ['flicker-moth', 'flicker-moth', 'flicker-moth', 'magma-brute', 'magma-brute', 'magma-brute', 'ember-pup', 'ember-pup', 'coal-runner', 'coal-runner', 'firebolt', 'firebolt', 'pyre-fiend', 'pyre-fiend', 'swift-falcon'],

  // Midrange (an even 2/2/2/2 cap) — the leader with nothing to commit to plays the cards that
  // ask for no commitment. Pure vanilla curve, twelve bodies; the control group of the set.
  aleph: ['field-mouse', 'field-mouse', 'field-mouse', 'ember-pup', 'ember-pup', 'briar-colt', 'briar-colt', 'briar-colt', 'reef-darter', 'reef-darter', 'gravel-hound', 'gravel-hound', 'mercenary', 'mercenary', 'mend'],

  // Control (water W4) — cheap answers plus enough bodies to survive using them. Cold Spell and
  // Hypnotic Patterns are 1 energy + 1 Water each, which is what makes stalling affordable at
  // act-1 energy levels; the expensive lockdown pieces are all reward-screen upgrades later.
  phantom: ['river-minnow', 'river-minnow', 'river-minnow', 'cold-spell', 'cold-spell', 'hypnotic-patterns', 'hypnotic-patterns', 'reef-darter', 'reef-darter', 'reef-darter', 'coral-spear', 'coral-spear', 'frostbite-harpoon', 'frostbite-harpoon', 'current-rider'],

  // Combo (earth E3 / nature N3) — a Foundation is a full unit that also hands its body up to
  // whatever bonds on top, so the starter carries the two CHEAP ones and the bodies to bond.
  // Smuggler's Cache at 4 total is ground you can actually lay in act 1.
  screyera: ['pebble-pup', 'pebble-pup', 'pebble-pup', 'quarry-hand', 'quarry-hand', 'the-fence', 'the-fence', 'mud-crab', 'mud-crab', 'gravel-hound', 'gravel-hound', 'dead-drop', 'dead-drop', 'smugglers-cache', 'lookout-perch'],

  // Guardian (water W3 / earth E2) — the leader IS a unit and losing it loses the run, so this
  // buys time: Shield on the avatar, walls in front, a heal behind. Riptide Shepherd is the one
  // piece that repositions an ALLY every turn, which is how the avatar leaves a targeted lane.
  ringleader: ['river-minnow', 'river-minnow', 'river-minnow', 'iron-ward', 'iron-ward', 'reef-darter', 'reef-darter', 'reef-darter', 'riptide-shepherd', 'riptide-shepherd', 'mud-crab', 'mud-crab', 'gravel-hound', 'gravel-hound', 'mend'],

  // Ramp (nature N4) — buy energy you have not earned yet, then land what nobody else can.
  // Deep Roots is the piece that makes this work at 15 cards: every other ramp in the game is a
  // BODY that must survive a turn first, and a 1-cost spell cannot be answered at all.
  corpselock: ['field-mouse', 'field-mouse', 'field-mouse', 'deep-roots', 'deep-roots', 'deep-roots', 'briar-colt', 'briar-colt', 'gravel-hound', 'gravel-hound', 'sun-priest', 'sun-priest', 'surge-sprite', 'surge-sprite', 'spore-matron'],

  // Deck Out (water W4) — the opponent's DECK is the target, so everything either mills or buys
  // the turns milling needs. Plunder replaces itself, which is what stops the plan from being a
  // race the miller is also losing; against an act-1 enemy deck it is a genuine win condition.
  johnpork: ['river-minnow', 'river-minnow', 'river-minnow', 'cursed-gift', 'cursed-gift', 'plunder', 'plunder', 'plunder', 'hypnotic-patterns', 'hypnotic-patterns', 'reef-darter', 'reef-darter', 'memory-siphon', 'memory-siphon', 'archive-eel'],

  // Stall (earth E4) — the starter that used to lose 30 HP and 2 runs of 4 outright, rebuilt as
  // the CHEAPEST wall package rather than the biggest. Nothing here costs more than 3 total:
  // a 7e wall that arrives on round 7 has already let six turns of damage through.
  cleath: ['pebble-pup', 'pebble-pup', 'pebble-pup', 'quarry-hand', 'quarry-hand', 'quarry-hand', 'target-spell', 'target-spell', 'gravel-hound', 'gravel-hound', 'mud-crab', 'mud-crab', 'the-fence', 'bulwark', 'bulwark'],

  // Swarm (nature N4 / fire F2) — go wide and stay wide. Hive Spawn replaces itself on death,
  // so the board does not thin out through the trades act 1 is made of.
  autopus: ['field-mouse', 'field-mouse', 'field-mouse', 'critter-token', 'critter-token', 'critter-token', 'spore-bat', 'spore-bat', 'spore-bat', 'briar-colt', 'briar-colt', 'briar-colt', 'hive-spawn', 'hive-spawn', 'plague-rat'],

  // The Fixer (earth E4) — her power costs 1 less per card played since she last used it, so
  // the currency is CARD COUNT, not card quality. This is the one starter where a cheap,
  // unimpressive card is doing exactly its job; the two Dead Drops buy more plays, not better ones.
  eksana: ['quarry-hand', 'quarry-hand', 'quarry-hand', 'pebble-pup', 'pebble-pup', 'pebble-pup', 'stray-cur', 'stray-cur', 'dead-drop', 'dead-drop', 'target-spell', 'target-spell', 'the-fence', 'the-fence', 'reprisal'],

  // Snowball (nature N4) — Growth compounds per turn, so what matters is having a body down
  // EARLY and keeping it. Cocoon absorbs one attack and heals while Growth keeps ticking, so the
  // cheap growing bodies are what the power is for. Thistle Cub is a 1-drop that becomes a
  // threat if it survives, which is exactly the thing Cocoon buys.
  noctua: ['field-mouse', 'field-mouse', 'field-mouse', 'thistle-cub', 'thistle-cub', 'thistle-cub', 'overgrowth', 'overgrowth', 'briar-colt', 'briar-colt', 'gravel-hound', 'gravel-hound', 'bloom-elk', 'surge-sprite', 'surge-sprite'],

  // Lane Control (water W4) — decide who stands where. The Aquatic bodies own the Water lane
  // outright (nothing without Aquatic or Airborne can contest it), and the movement spells drag
  // the enemy's answers out of position for a turn each.
  naife: ['river-minnow', 'river-minnow', 'river-minnow', 'wind-redirect', 'wind-redirect', 'strings-of-heaven', 'coral-spear', 'coral-spear', 'coral-spear', 'reef-raptor', 'reef-raptor', 'reef-raptor', 'tidal-wave', 'tidal-wave', 'crag-hawk'],
};
