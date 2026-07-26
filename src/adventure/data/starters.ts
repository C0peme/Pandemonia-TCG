/**
 * Adventure starting decks — the ~11 cards a run begins with, per leader.
 *
 * Hand-authored (seeded from the cheap core of each leader's archetype deck, then
 * curated so every starter has real bodies to play): starters are a design surface,
 * and deriving them from the archetype decks would silently reshape them on every
 * rebalance. A test guards that every id exists and every leader is covered.
 */
export const ADVENTURE_STARTERS: Record<string, string[]> = {
  // DoT — cheap tickers + burn reach.
  kedou: ['ash-cloud', 'ash-cloud', 'firebolt', 'firebolt', 'ember-tick', 'ember-tick', 'ember-tick', 'coal-runner', 'ashen-bomber', 'pumpkindle', 'plague-rat'],
  // Aggro — glass cannons and direct damage.
  orsyric: ['flicker-moth', 'flicker-moth', 'firebolt', 'firebolt', 'magma-brute', 'magma-brute', 'chain-spark', 'chain-spark', 'coal-runner', 'swift-falcon', 'reef-raptor'],
  // Midrange — the vanilla stat-stick curve.
  aleph: ['field-mouse', 'field-mouse', 'ember-pup', 'ember-pup', 'mend', 'frost-imp', 'frost-imp', 'briar-colt', 'briar-colt', 'gravel-hound', 'gravel-hound'],
  // Control — stall tools plus enough walls to hide behind.
  phantom: ['river-minnow', 'target-spell', 'cold-spell', 'cold-spell', 'peel-back', 'current-rider', 'current-rider', 'river-turtle', 'river-turtle', 'sleep-walker', 'frost-wall'],
  // Combo — grant-foundations and bodies to bond onto them.
  screyera: ['pebble-pup', 'pebble-pup', 'launch-ramp', 'launch-ramp', 'mud-crab', 'mud-crab', 'gravel-hound', 'gravel-hound', 'oak-sentry', 'ridge-walker', 'twin-fang-mount'],
  // Guardian — protection for the avatar plus a few sponges.
  ringleader: ['mend', 'mend', 'iron-ward', 'iron-ward', 'cold-spell', 'wind-redirect', 'field-mouse', 'field-mouse', 'mush-room', 'mush-room', 'crag-hawk'],
  // Ramp — producers and groundwork.
  corpselock: ['mend', 'briar-colt', 'briar-colt', 'mana-geyser', 'mana-geyser', 'sun-priest', 'sun-priest', 'surge-sprite', 'surge-sprite', 'bulwark-toad', 'oak-sentry'],
  // Deck Out — burden tools plus sleepy walls.
  johnpork: ['river-minnow', 'river-minnow', 'cursed-gift', 'cursed-gift', 'cold-spell', 'cold-spell', 'hypnotic-patterns', 'mind-leech', 'mind-leech', 'river-turtle', 'sleep-walker'],
  // Stall — walls, spikes, and sustain.
  cleath: ['target-spell', 'mend', 'stone-footing', 'trench-turtle', 'trench-turtle', 'spike-wall', 'spike-wall', 'bulwark-toad', 'iron-mantis', 'pebble-snake', 'ridge-walker'],
  // Swarm — cheap bodies that refill themselves.
  autopus: ['field-mouse', 'field-mouse', 'field-mouse', 'firebolt', 'spore-bat', 'spore-bat', 'spore-bat', 'hive-spawn', 'hive-spawn', 'hive-spawn', 'swift-falcon'],
  // Attrition — spiky bodies the enemy bleeds on.
  eksana: ['mud-crab', 'mud-crab', 'ashen-bomber', 'ashen-bomber', 'gravel-hound', 'gravel-hound', 'plague-rat', 'plague-rat', 'whistle-blower', 'thorn-beast', 'spike-wall'],
  // Snowball — growth seeds and heals to keep them alive.
  noctua: ['field-mouse', 'field-mouse', 'mend', 'mend', 'iron-seed', 'iron-seed', 'strings-of-heaven', 'bloom-elk', 'bloom-elk', 'mush-room', 'surge-sprite'],
  // Lane Control — displacement plus an evasive clock.
  naife: ['wind-redirect', 'wind-redirect', 'cold-spell', 'fearie', 'tidal-wave', 'frost-imp', 'coral-spear', 'reef-raptor', 'reef-raptor', 'tide-stalker', 'crag-hawk'],
};
