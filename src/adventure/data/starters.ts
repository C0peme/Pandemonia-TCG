/**
 * Adventure starting decks — the 18 cards a run begins with, per leader.
 *
 * Hand-authored (seeded from the cheap core of each leader's archetype deck, then
 * curated so every starter has real bodies to play): starters are a design surface,
 * and deriving them from the archetype decks would silently reshape them on every
 * rebalance. A test guards that every id exists and every leader is covered.
 *
 * SIZE IS A RULE, NOT A TASTE. A starter must outlast the fight it is taken into.
 * These were 11 cards, which is 4 in the opening hand plus 7 draws: every Adventure
 * fight decked the player out on turn 14 while the fights themselves ran 17-21 turns,
 * so the back third of every fight was spent drawing Nulls — a 0-cost 4/4 the AI
 * happily plays and which bleeds its OWN leader for 4 when it dies (special.ts).
 * Measured over 15 act-1 fights, 45% of ALL leader damage the player took was that
 * self-inflicted Null bleed, and since run HP carries between fights while the
 * enemy's resets, that bleed compounded into a dead run by fight 2-3.
 *
 * 18 = 4 opening + 14 draws, so deck-out moves from turn 14 to turn 28. Note that
 * removing the bleed LENGTHENS fights (neither side is killing itself any more), so
 * this does not abolish deck-out — the longest fights still reach it. Re-measured over
 * the same 15 fights it takes the player's post-deck-out share of damage from 45% to
 * 10%, which is the point: deck-out becomes a rare late-fight pressure instead of the
 * thing that decides every fight. Keep any future starter at or above 18, and treat a
 * starter that shrinks as a balance change, not a content tweak. See `encounterDeckSize`
 * in encounters.ts, which sizes the ENEMY's trimmed deck against the same fight length.
 */
export const ADVENTURE_STARTERS: Record<string, string[]> = {
  // DoT — cheap tickers + burn reach.
  kedou: ['ash-cloud', 'ash-cloud', 'ash-cloud', 'firebolt', 'firebolt', 'firebolt', 'ember-tick', 'ember-tick', 'ember-tick', 'coal-runner', 'ashen-bomber', 'ashen-bomber', 'pumpkindle', 'pumpkindle', 'plague-rat', 'ember-chronicler', 'ember-chronicler', 'whistle-blower'],
  // Aggro — glass cannons and direct damage.
  orsyric: ['flicker-moth', 'flicker-moth', 'flicker-moth', 'firebolt', 'firebolt', 'magma-brute', 'magma-brute', 'powder-monkey', 'powder-monkey', 'chain-spark', 'chain-spark', 'adrenaline-rush', 'coal-runner', 'coal-runner', 'swift-falcon', 'swift-falcon', 'reef-raptor', 'pyre-fiend'],
  // Midrange — the vanilla stat-stick curve.
  aleph: ['field-mouse', 'field-mouse', 'field-mouse', 'ember-pup', 'ember-pup', 'ember-pup', 'mend', 'frost-imp', 'frost-imp', 'briar-colt', 'briar-colt', 'briar-colt', 'gravel-hound', 'gravel-hound', 'gravel-hound', 'reef-darter', 'reef-darter', 'sharpened-stake'],
  // Control — stall tools plus enough walls to hide behind.
  phantom: ['river-minnow', 'river-minnow', 'target-spell', 'cold-spell', 'cold-spell', 'peel-back', 'peel-back', 'reef-darter', 'reef-darter', 'current-rider', 'current-rider', 'tide-serpent', 'tidecaller-adept', 'dream-eater', 'river-turtle', 'river-turtle', 'sleep-walker', 'frost-wall'],
  // Combo — grant-foundations and bodies to bond onto them.
  screyera: ['pebble-pup', 'pebble-pup', 'pebble-pup', 'quarry-hand', 'quarry-hand', 'launch-ramp', 'launch-ramp', 'reprisal', 'mud-crab', 'mud-crab', 'mud-crab', 'gravel-hound', 'gravel-hound', 'gravel-hound', 'oak-sentry', 'oak-sentry', 'ridge-walker', 'twin-fang-mount'],
  // Guardian — protection for the avatar plus a few sponges.
  ringleader: ['mend', 'mend', 'wind-redirect', 'peel-back', 'peel-back', 'iron-ward', 'iron-ward', 'iron-ward', 'cold-spell', 'field-mouse', 'field-mouse', 'mush-room', 'mush-room', 'mush-room', 'fog-creature', 'tidecaller-adept', 'crag-hawk', 'crag-hawk'],
  // Ramp — producers and groundwork.
  corpselock: ['mend', 'mend', 'briar-colt', 'briar-colt', 'mana-geyser', 'mana-geyser', 'mana-geyser', 'sun-priest', 'sun-priest', 'sun-priest', 'surge-sprite', 'surge-sprite', 'oak-sentry', 'oak-sentry', 'bulwark-toad', 'bulwark-toad', 'ward-spirit', 'root-elder'],
  // Deck Out — burden tools plus sleepy walls.
  johnpork: ['river-minnow', 'river-minnow', 'hypnotic-patterns', 'hypnotic-patterns', 'cursed-gift', 'cursed-gift', 'cold-spell', 'cold-spell', 'peel-back', 'peel-back', 'displacement-wave', 'mind-leech', 'mind-leech', 'mind-leech', 'river-turtle', 'river-turtle', 'sleep-walker', 'sleep-walker'],
  // Stall — walls, spikes, and sustain.
  cleath: ['target-spell', 'target-spell', 'mend', 'mend', 'quarry-hand', 'quarry-hand', 'tremor', 'stone-footing', 'trench-turtle', 'trench-turtle', 'trench-turtle', 'spike-wall', 'spike-wall', 'spike-wall', 'bulwark-toad', 'iron-mantis', 'pebble-snake', 'ridge-walker'],
  // Swarm — cheap bodies that refill themselves.
  autopus: ['field-mouse', 'field-mouse', 'field-mouse', 'firebolt', 'firebolt', 'powder-monkey', 'powder-monkey', 'pocket-dimension', 'spore-bat', 'spore-bat', 'spore-bat', 'pyre-fiend', 'pyre-fiend', 'hive-spawn', 'hive-spawn', 'hive-spawn', 'swift-falcon', 'swift-falcon'],
  // Attrition — spiky bodies the enemy bleeds on.
  eksana: ['quarry-hand', 'quarry-hand', 'mud-crab', 'mud-crab', 'mud-crab', 'reprisal', 'tremor', 'gravel-hound', 'gravel-hound', 'ashen-bomber', 'ashen-bomber', 'plague-rat', 'plague-rat', 'whistle-blower', 'thorn-beast', 'thorn-beast', 'spike-wall', 'spike-wall'],
  // Snowball — growth seeds and heals to keep them alive.
  noctua: ['field-mouse', 'field-mouse', 'field-mouse', 'mend', 'mend', 'briar-colt', 'briar-colt', 'mush-room', 'mush-room', 'strangleroot', 'chrysalis-grub', 'bloom-elk', 'bloom-elk', 'bloom-elk', 'surge-sprite', 'iron-seed', 'iron-seed', 'strings-of-heaven'],
  // Lane Control — displacement plus an evasive clock.
  naife: ['wind-redirect', 'wind-redirect', 'wind-redirect', 'coral-spear', 'coral-spear', 'displacement-wave', 'reef-raptor', 'reef-raptor', 'reef-raptor', 'seaweed-octopus', 'tidal-wave', 'tidal-wave', 'cold-spell', 'tide-stalker', 'tide-stalker', 'fearie', 'frost-imp', 'crag-hawk'],
};
