/**
 * Starter card pool and leaders for hotseat testing / engine development.
 * Archetypes and pre-built decks have been intentionally omitted — they will
 * be designed and added by a dedicated card-creation pass.
 */
import { buildRegistry, type Registry } from '@cards/registry';
import { parseCard, parseLeader, type Card, type Leader } from '@cards/schema';

// prettier-ignore
const rawCards = [
  { id: 'ember-pup', name: 'Ember Pup', element: 'fire', tags: [], wip: false, type: 'unit', cost: { energy: 1 }, attack: 1, hp: 2, keywords: {} },
  { id: 'magma-brute', name: 'Magma Brute', element: 'fire', text: 'Brittle: attacks once then destroys itself.', tags: [], wip: false, type: 'unit', cost: { energy: 1 }, attack: 3, hp: 2, keywords: { brittle: true } },
  { id: 'pyre-fiend', name: 'Pyre Fiend', element: 'fire', text: 'May sacrifice up to 1 ally on play to gain +2/+2.', tags: [], wip: false, type: 'unit', cost: { energy: 2, elements: [{ type: 'fire', amount: 1 }] }, attack: 3, hp: 2, keywords: { sacrifice: { max: 1, buff: { attack: 2, hp: 2 } } } },
  { id: 'pumpkindle', name: 'Pumpkindle', element: 'fire', text: 'On death: inflict Burn 2 on enemies in its lane.', tags: [], wip: false, type: 'unit', cost: { energy: 2, elements: [{ type: 'fire', amount: 1 }] }, attack: 2, hp: 2, keywords: { kamikaze: { kind: 'applyStatus', amount: 2, target: 'enemy', status: 'burn' } } },
  { id: 'revolving-sun', name: 'Revolving Sun', element: 'fire', text: 'Sniper. On hit: inflict Burn 1.', tags: [], wip: false, type: 'unit', cost: { energy: 1, elements: [{ type: 'fire', amount: 2 }] }, attack: 2, hp: 1, keywords: { sniper: true }, onHit: { burn: 1 } },
  { id: 'thorn-beast', name: 'Thorn Beast', element: 'nature', tags: [], wip: false, type: 'unit', cost: { energy: 3, elements: [{ type: 'nature', amount: 1 }] }, attack: 2, hp: 3, keywords: { spike: 1 } },
  { id: 'bloom-elk', name: 'Bloom Elk', element: 'nature', tags: [], wip: false, type: 'unit', cost: { energy: 5, elements: [{ type: 'nature', amount: 1 }] }, attack: 1, hp: 3, keywords: { growth: { attack: 1, hp: 0 } } },
  { id: 'spore-bat', name: 'Spore Bat', element: 'nature', tags: [], wip: false, type: 'unit', cost: { energy: 2, elements: [{ type: 'nature', amount: 1 }] }, attack: 2, hp: 1, keywords: { airborne: true } },
  { id: 'goreivyne', name: 'Goreivyne', element: 'nature', text: 'Bloodlust: gain +0/+2 per kill.', tags: [], wip: false, type: 'unit', cost: { energy: 4, elements: [{ type: 'nature', amount: 1 }] }, attack: 3, hp: 1, keywords: { bloodlust: { buff: { attack: 0, hp: 2 } } } },
  { id: 'fearie', name: 'Fearie', element: 'nature', text: 'Airborne. Can move an enemy unit to this lane.', tags: [], wip: false, type: 'unit', cost: { energy: 2, elements: [{ type: 'nature', amount: 2 }] }, attack: 2, hp: 1, keywords: { airborne: true }, onPlay: [{ kind: 'move', target: 'enemy' }], onAttack: [], endOfTurn: [], startOfTurn: [] },
  { id: 'catpire', name: 'Catpire', element: 'nature', text: 'Sacrifice 1: gains the sacrificed unit\'s stats (approx +2/+2). Bloodlust: +0/+2.', tags: [], wip: false, type: 'unit', cost: { energy: 3, elements: [{ type: 'nature', amount: 2 }] }, attack: 2, hp: 1, keywords: { sacrifice: { max: 1, buff: { attack: 2, hp: 2 } }, bloodlust: { buff: { attack: 0, hp: 2 } } } },
  { id: 'craftbee', name: 'Craftbee', element: 'nature', text: 'Airborne. Branch Shot.', tags: [], wip: false, type: 'unit', cost: { energy: 5, elements: [{ type: 'nature', amount: 2 }] }, attack: 3, hp: 1, keywords: { branchShot: true, airborne: true } },
  { id: 'chemister', name: 'Chemister', element: 'nature', text: 'Sniper. On hit: inflict Poison.', tags: [], wip: false, type: 'unit', cost: { energy: 1, elements: [{ type: 'nature', amount: 2 }] }, attack: 1, hp: 2, keywords: { sniper: true }, onHit: { poison: true } },
  { id: 'lumber-jacko', name: 'Lumber Jacko', element: 'nature', text: 'Bloodlust: +1/0 per kill.', tags: [], wip: false, type: 'unit', cost: { energy: 4, elements: [{ type: 'nature', amount: 1 }] }, attack: 3, hp: 3, keywords: { bloodlust: { buff: { attack: 1, hp: 0 } } } },
  { id: 'tide-serpent', name: 'Tide Serpent', element: 'water', tags: [], wip: false, type: 'unit', cost: { energy: 2, elements: [{ type: 'water', amount: 1 }] }, attack: 3, hp: 3, keywords: { aquatic: [{ kind: 'buff', target: 'self', stat: { attack: 2 } }] } },
  { id: 'frost-imp', name: 'Frost Imp', element: 'water', text: 'Overshot.', tags: [], wip: false, type: 'unit', cost: { energy: 4, elements: [{ type: 'water', amount: 1 }] }, attack: 2, hp: 1, keywords: { overshot: true } },
  { id: 'river-turtle', name: 'River Turtle', element: 'water', tags: [], wip: false, type: 'unit', cost: { energy: 4, elements: [{ type: 'water', amount: 2 }] }, attack: 0, hp: 1, keywords: { shield: 1, doubleTeam: true } },
  { id: 'coral-spear', name: 'Coral Spear', element: 'water', tags: [], wip: false, type: 'unit', cost: { energy: 1, elements: [{ type: 'water', amount: 1 }] }, attack: 3, hp: 1, keywords: { sniper: true } },
  { id: 'fog-creature', name: 'Fog Creature', element: 'water', text: 'Aquatic. On hit: inflict Sleep.', tags: [], wip: false, type: 'unit', cost: { energy: 4, elements: [{ type: 'water', amount: 1 }] }, attack: 2, hp: 1, keywords: { aquatic: true }, onHit: { sleep: 0 } },
  { id: 'frost-king', name: 'Frost King', element: 'water', text: 'On play: freeze all enemies.', tags: [], wip: false, type: 'unit', cost: { energy: 7, elements: [{ type: 'water', amount: 1 }] }, attack: 2, hp: 2, keywords: {}, onPlay: [{ kind: 'applyStatus', target: 'all-enemy', status: 'freeze' }] },
  { id: 'seaweed-octopus', name: 'Seaweed Octopus', element: 'water', text: 'Aquatic. In water: can move an enemy unit to this lane.', tags: [], wip: false, type: 'unit', cost: { energy: 1, elements: [{ type: 'water', amount: 1 }] }, attack: 2, hp: 1, keywords: { aquatic: true }, onPlay: [{ kind: 'move', target: 'enemy' }], onAttack: [], endOfTurn: [], startOfTurn: [] },
  { id: 'mud-crab', name: 'Mud Crab', element: 'earth', text: 'Spike 1.', tags: [], wip: false, type: 'unit', cost: { energy: 2, elements: [{ type: 'earth', amount: 1 }] }, attack: 2, hp: 2, keywords: { spike: 1 } },
  { id: 'bowling-boulder', name: 'Bowling Boulder', element: 'earth', text: 'Growth: +1/0 each turn. Polish: +0/+2 when hit.', tags: [], wip: false, type: 'unit', cost: { energy: 6, elements: [{ type: 'earth', amount: 2 }] }, attack: 1, hp: 3, keywords: { polish: { stat: { attack: 0, hp: 2 } }, growth: { attack: 1, hp: 0 } } },
  { id: 'salt-golem', name: 'Salt Golem', element: 'earth', text: 'Polish: when hit, heals your leader +1.', tags: [], wip: false, type: 'unit', cost: { energy: 4, elements: [{ type: 'earth', amount: 1 }] }, attack: 2, hp: 5, keywords: {}, onPlay: [], onAttack: [], endOfTurn: [{ kind: 'heal', amount: 1, target: 'leader' }], startOfTurn: [] },
  { id: 'mandrake', name: 'Mandrake', element: 'earth', text: 'Polish: when hit, debuffs all enemies −1/0.', tags: [], wip: false, type: 'unit', cost: { energy: 4, elements: [{ type: 'earth', amount: 1 }] }, attack: 1, hp: 4, keywords: { polish: { effects: [{ kind: 'debuff', target: 'enemy', stat: { attack: 1 } }] } } },
  { id: 'pebble-snake', name: 'Pebble Snake', element: 'earth', text: 'Tough 1. Polish: gains +1/0 when hit.', tags: [], wip: false, type: 'unit', cost: { energy: 6, elements: [{ type: 'earth', amount: 2 }] }, attack: 2, hp: 4, keywords: { tough: 1, polish: { stat: { attack: 1, hp: 0 } } } },
  { id: 'galatian-spirit', name: 'Galatian Spirit', element: 'earth', text: 'Taunt. On hit: inflict Poison.', tags: [], wip: false, type: 'unit', cost: { energy: 3, elements: [{ type: 'earth', amount: 2 }] }, attack: 2, hp: 4, keywords: { taunt: true }, onHit: { poison: true } },
  { id: 'shinero', name: 'Spinero', element: 'nature', tags: [], wip: false, type: 'unit', cost: { energy: 6, elements: [{ type: 'nature', amount: 3 }] }, attack: 0, hp: 4, keywords: { taunt: true, spike: 3, tough: 1 } },
  { id: 'sig-living-mountain', name: 'Living Mountain', element: 'earth', text: 'Signature: a massive free defender.', tags: ['signature'], wip: false, type: 'unit', cost: { energy: 0 }, attack: 2, hp: 3, keywords: { taunt: true, tough: 2 } }, // Cleath: no rename needed
  { id: 'firebolt', name: 'Firebolt', element: 'fire', tags: [], wip: false, type: 'spell', cost: { energy: 0, elements: [{ type: 'fire', amount: 1 }] }, effects: [{ kind: 'damage', amount: 2, target: 'enemy' }] },
  { id: 'pyroclasm', name: 'Pyroclasm', element: 'fire', text: 'Deal 4 damage directly to the enemy leader, ignoring all units.', tags: [], wip: false, type: 'spell', cost: { energy: 1, elements: [{ type: 'fire', amount: 1 }] }, effects: [{ kind: 'damage', amount: 4, target: 'leader' }] },
  { id: 'mend', name: 'Mend', element: 'nature', tags: [], wip: false, type: 'spell', cost: { energy: 1, elements: [{ type: 'nature', amount: 1 }] }, effects: [{ kind: 'heal', amount: 3, target: 'ally' }] },
  { id: 'strings-of-heaven', name: 'Strings of Heaven', element: 'nature', text: 'Move an ally unit to another lane and give it +1/+1.', tags: [], wip: false, type: 'spell', cost: { energy: 0, elements: [{ type: 'nature', amount: 2 }] }, effects: [{ kind: 'move', target: 'ally' }, { kind: 'buff', target: 'ally', stat: { attack: 1, hp: 1 } }] },
  { id: 'whistle-blower', name: 'Wilt', element: 'nature', text: 'Reduce an enemy unit by -2/-2.', tags: [], wip: false, type: 'spell', cost: { energy: 2, elements: [{ type: 'nature', amount: 1 }] }, effects: [{ kind: 'debuff', target: 'enemy', stat: { attack: 2, hp: 2 } }] },
  { id: 'mush-room', name: 'Mush Room', element: 'nature', tags: [], wip: false, type: 'spell', cost: { energy: 2, elements: [{ type: 'nature', amount: 1 }] }, effects: [{ kind: 'applyStatus', target: 'ally', status: 'trueShield' }] },
  { id: 'cold-spell', name: 'Cold Spell', element: 'water', text: 'Freeze any unit.', tags: [], wip: false, type: 'spell', cost: { energy: 2, elements: [{ type: 'water', amount: 1 }] }, effects: [{ kind: 'applyStatus', target: 'any', status: 'freeze' }] },
  { id: 'hypnotic-patterns', name: 'Hypnotic Patterns', element: 'water', text: 'Put any unit to Sleep.', tags: [], wip: false, type: 'spell', cost: { energy: 1, elements: [{ type: 'water', amount: 1 }] }, effects: [{ kind: 'applyStatus', amount: 2, target: 'any', status: 'sleep' }] },
  { id: 'tidal-wave', name: 'Tidal Wave', element: 'water', text: 'Deal 2 damage to an enemy in the Water lane and move it to a ground lane.', tags: [], wip: false, type: 'spell', cost: { energy: 0, elements: [{ type: 'water', amount: 2 }] }, effects: [{ kind: 'damage', amount: 2, target: 'enemy' }, { kind: 'move', target: 'enemy' }] },
  { id: 'target-spell', name: 'Target', element: 'earth', text: 'Give Taunt to any unit.', tags: [], wip: false, type: 'spell', cost: { energy: 0, elements: [{ type: 'earth', amount: 1 }] }, effects: [{ kind: 'applyStatus', target: 'any', status: 'taunt' }] },
  { id: 'stone-footing', name: 'Stone Footing', element: 'earth', tags: [], wip: false, type: 'foundation', cost: { energy: 7, elements: [{ type: 'earth', amount: 2 }] }, attack: 2, hp: 4, keywords: {}, grants: { keywords: { tough: 1 } } },
  { id: 'down-under-masks', name: 'Down Under Masks', element: 'fire', tags: [], wip: false, type: 'foundation', cost: { energy: 9, elements: [{ type: 'fire', amount: 3 }] }, attack: 2, hp: 4, keywords: {}, grants: { keywords: { immunity: true, bloodlust: { buff: { attack: 2, hp: 1 } } } } },
  { id: 'freds-boat', name: 'Fred\'s Boat', element: 'water', text: 'Foundation. Grants +1/+2 and Aquatic to the unit on top.', tags: [], wip: false, type: 'foundation', cost: { energy: 3, elements: [{ type: 'water', amount: 1 }] }, attack: 2, hp: 3, keywords: {}, grants: { keywords: { aquatic: true } } },
  { id: 'vent', name: 'Vent', element: 'fire', text: 'All units in this lane gain Overshot.', tags: [], wip: false, type: 'environment', cost: { energy: 3, elements: [{ type: 'fire', amount: 1 }] }, lanes: [], effects: [{ kind: 'custom', note: 'All units gain Overshot' }], grantKeywords: { overshot: true } },
  { id: 'graveyard', name: 'Graveyard', element: 'earth', text: 'All units gain Zombified.', tags: [], wip: false, type: 'environment', cost: { energy: 2, elements: [{ type: 'earth', amount: 1 }] }, lanes: ['ground'], effects: [{ kind: 'custom', note: 'All units gain Zombified' }], grantKeywords: { zombified: true } },
  { id: 'molten-floor', name: 'Molten Floor', element: 'fire', text: 'Units entering this lane gain Burn 1.', tags: [], wip: false, type: 'environment', cost: { energy: 0, elements: [{ type: 'fire', amount: 1 }] }, lanes: [], effects: [{ kind: 'applyStatus', amount: 1, target: 'any', status: 'burn' }] },
  { id: 'sludge-pool', name: 'Sludge Pool', element: 'nature', text: 'Units entering this lane are Poisoned.', tags: [], wip: false, type: 'environment', cost: { energy: 0, elements: [{ type: 'nature', amount: 1 }] }, lanes: [], effects: [{ kind: 'applyStatus', target: 'any', status: 'poison' }] },
  { id: 'watchtowers', name: 'Watchtowers', element: 'earth', text: 'Heights only. All units gain Sniper.', tags: [], wip: false, type: 'environment', cost: { energy: 0 }, lanes: ['heights'], effects: [{ kind: 'custom', note: 'All units gain Sniper' }], grantKeywords: { sniper: true } },
  { id: 'coffee-fields', name: 'Coffee Fields', element: 'nature', text: 'All units gain Double Strike.', tags: [], wip: false, type: 'environment', cost: { energy: 3, elements: [{ type: 'nature', amount: 1 }] }, lanes: [], effects: [{ kind: 'custom', note: 'All units gain Double Strike' }], grantKeywords: { doubleStrike: true } },
  { id: 'perfect-fortress', name: 'Perfect Fortress', element: 'earth', text: 'All units gain True Shield.', tags: [], wip: false, type: 'environment', cost: { energy: 2, elements: [{ type: 'earth', amount: 1 }] }, lanes: [], effects: [{ kind: 'custom', note: 'All units gain True Shield' }], grantKeywords: { trueShield: true } },
  { id: 'pocket-dimension', name: 'Pocket Dimension', element: 'nature', text: 'All units gain Double Team.', tags: [], wip: false, type: 'environment', cost: { energy: 1, elements: [{ type: 'nature', amount: 1 }] }, lanes: [], effects: [{ kind: 'custom', note: 'All units gain Double Team' }], grantKeywords: { doubleTeam: true } },
  { id: 'warehouse', name: 'Warehouse', element: 'earth', text: 'All units gain Growth: +1/+1.', tags: [], wip: false, type: 'environment', cost: { energy: 4, elements: [{ type: 'earth', amount: 1 }] }, lanes: [], effects: [{ kind: 'custom', note: 'All units gain Growth: +1/+1' }], grantKeywords: { growth: { attack: 1, hp: 1 } } },
  { id: 'air-currents', name: 'Air Currents', element: 'nature', text: 'All units gain Airborne.', tags: [], wip: false, type: 'environment', cost: { energy: 1, elements: [{ type: 'nature', amount: 1 }] }, lanes: [], effects: [{ kind: 'custom', note: 'All units gain Airborne' }], grantKeywords: { airborne: true } },
  { id: 'cinder-witch', name: 'Cinder Witch', element: 'fire', text: 'Producer: 1 energy/turn. On hit: inflict Burn 1.', tags: [], wip: false, type: 'unit', cost: { energy: 2, elements: [{ type: 'fire', amount: 2 }] }, attack: 1, hp: 3, keywords: {}, onHit: { burn: 1 }, onPlay: [], onAttack: [], endOfTurn: [{ kind: 'energyNext', amount: 1 }], startOfTurn: [] },
  { id: 'ash-cloud', name: 'Ash Cloud', element: 'fire', text: 'Inflict Burn 1 on an enemy unit.', tags: [], wip: false, type: 'spell', cost: { energy: 0, elements: [{ type: 'fire', amount: 1 }] }, effects: [{ kind: 'applyStatus', amount: 1, target: 'enemy', status: 'burn' }] },
  { id: 'trench-turtle', name: 'Trench Turtle', element: 'earth', text: 'Tough 1.', tags: [], wip: false, type: 'unit', cost: { energy: 4, elements: [{ type: 'earth', amount: 1 }] }, attack: 2, hp: 2, keywords: { tough: 1 } },
  { id: 'guardian-crab', name: 'Guardian Crab', element: 'earth', text: 'Taunt. Tough 2.', tags: [], wip: false, type: 'unit', cost: { energy: 7, elements: [{ type: 'earth', amount: 2 }] }, attack: 0, hp: 5, keywords: { taunt: true, tough: 2 } },
  { id: 'iron-mantis', name: 'Iron Mantis', element: 'earth', text: 'Shield 2.', tags: [], wip: false, type: 'unit', cost: { energy: 5, elements: [{ type: 'earth', amount: 1 }] }, attack: 1, hp: 3, keywords: { shield: 2 } },
  { id: 'ward-spirit', name: 'Ward Spirit', element: 'nature', text: 'Tough 1. At end of turn: heal your leader 1.', tags: [], wip: false, type: 'unit', cost: { energy: 3, elements: [{ type: 'nature', amount: 2 }] }, attack: 0, hp: 2, keywords: { tough: 1 }, onPlay: [], onAttack: [], endOfTurn: [{ kind: 'heal', amount: 1, target: 'leader' }], startOfTurn: [] },
  { id: 'frost-wall', name: 'Frost Wall', element: 'water', text: 'Double Team.', tags: [], wip: false, type: 'unit', cost: { energy: 4, elements: [{ type: 'water', amount: 1 }] }, attack: 0, hp: 5, keywords: { doubleTeam: true } },
  { id: 'sleep-walker', name: 'Sleep Walker', element: 'water', text: 'On hit: inflict Sleep on the attacker.', tags: [], wip: false, type: 'unit', cost: { energy: 4, elements: [{ type: 'water', amount: 1 }] }, attack: 1, hp: 3, keywords: {}, onHit: { sleep: 0 } },
  { id: 'peel-back', name: 'Peel Back', element: 'water', text: 'Return an enemy unit to its owner\'s hand.', tags: [], wip: false, type: 'spell', cost: { energy: 2, elements: [{ type: 'water', amount: 1 }] }, effects: [{ kind: 'expel', target: 'enemy' }] },
  { id: 'displacement-wave', name: 'Displacement Wave', element: 'water', text: 'Return an enemy unit to its owner\'s hand.', tags: [], wip: false, type: 'spell', cost: { energy: 2, elements: [{ type: 'water', amount: 1 }] }, effects: [{ kind: 'expel', target: 'enemy' }] },
  { id: 'root-elder', name: 'Root Elder', element: 'nature', text: 'Producer: 2 energy/turn.', tags: [], wip: false, type: 'unit', cost: { energy: 4, elements: [{ type: 'nature', amount: 1 }] }, attack: 2, hp: 5, keywords: {}, onPlay: [], onAttack: [], endOfTurn: [{ kind: 'energyNext', amount: 2 }], startOfTurn: [] },
  { id: 'iron-seed', name: 'Iron Seed', element: 'nature', text: 'Place beneath a unit: grants +1/+1 and Growth: +1/0.', tags: [], wip: false, type: 'foundation', cost: { energy: 6, elements: [{ type: 'nature', amount: 2 }] }, attack: 2, hp: 3, keywords: {}, grants: { keywords: { growth: { attack: 1, hp: 0 } } } },
  { id: 'war-beast', name: 'War Beast', element: 'nature', text: 'Growth: +1/+1 per turn. Bloodlust: +1/0 per kill.', tags: [], wip: false, type: 'unit', cost: { energy: 6, elements: [{ type: 'nature', amount: 2 }] }, attack: 2, hp: 2, keywords: { bloodlust: { buff: { attack: 1, hp: 0 } }, growth: { attack: 1, hp: 1 } } },
  { id: 'swift-falcon', name: 'Swift Falcon', element: 'fire', text: 'Airborne. Brittle.', tags: [], wip: false, type: 'unit', cost: { energy: 2, elements: [{ type: 'fire', amount: 1 }] }, attack: 3, hp: 1, keywords: { airborne: true, brittle: true } },
  { id: 'surge-sprite', name: 'Surge Sprite', element: 'nature', text: 'Growth: +1/0 per turn. Producer: 1 energy/turn.', tags: [], wip: false, type: 'unit', cost: { energy: 4, elements: [{ type: 'nature', amount: 2 }] }, attack: 1, hp: 2, keywords: { growth: { attack: 1, hp: 0 } }, onPlay: [], onAttack: [], endOfTurn: [{ kind: 'energyNext', amount: 1 }], startOfTurn: [] },
  { id: 'ridge-walker', name: 'Ridge Walker', element: 'earth', text: 'Tough 1.', tags: [], wip: false, type: 'unit', cost: { energy: 5, elements: [{ type: 'earth', amount: 1 }] }, attack: 2, hp: 3, keywords: { tough: 1 } },
  { id: 'chain-spark', name: 'Chain Spark', element: 'fire', text: 'Deal 2 damage to an enemy. If that unit dies, deal 1 to another, and so on.', tags: [], wip: false, type: 'spell', cost: { energy: 1, elements: [{ type: 'fire', amount: 1 }] }, effects: [{ kind: 'damage', amount: 2, target: 'enemy', chainDiminish: true }] },
  { id: 'spike-wall', name: 'Spike Wall', element: 'earth', text: 'Spike 1. Tough 1.', tags: [], wip: false, type: 'unit', cost: { energy: 4, elements: [{ type: 'earth', amount: 2 }] }, attack: 0, hp: 2, keywords: { spike: 1, tough: 1 } },
  { id: 'wind-redirect', name: 'Wind Redirect', element: 'nature', text: 'Move any unit (ally or enemy) to any valid lane.', tags: [], wip: false, type: 'spell', cost: { energy: 0, elements: [{ type: 'nature', amount: 1 }] }, effects: [{ kind: 'move', target: 'any' }] },
  { id: 'colossal-worm', name: 'Colossal Worm', element: 'earth', text: 'Bloodlust: on kill, gain Shield 1 and burrow to another lane.', tags: [], wip: false, type: 'unit', cost: { energy: 10, elements: [{ type: 'earth', amount: 1 }] }, attack: 4, hp: 5, keywords: { bloodlust: { effects: [{ kind: 'applyStatus', amount: 1, target: 'self', status: 'shield' }, { kind: 'move', target: 'self' }] } } },
  { id: 'adrenaline-rush', name: 'Adrenaline Rush', element: 'fire', text: 'An ally unit takes an immediate bonus attack (no retaliation).', tags: [], wip: false, type: 'spell', cost: { energy: 1, elements: [{ type: 'fire', amount: 1 }] }, effects: [{ kind: 'extraAction', target: 'ally' }] },
  { id: 'critter-token', name: 'Mechanical Failure', element: 'nature', text: 'A summoned mechanical failure. Airborne.', tags: [], wip: false, type: 'unit', cost: { energy: 2, elements: [{ type: 'nature', amount: 1 }] }, attack: 1, hp: 2, keywords: { airborne: true } },
  { id: 'critter-elite', name: 'Techtacle', element: 'nature', text: 'A summoned techtacle. Airborne, Lethal, True Shield.', tags: ['token'], wip: false, type: 'unit', cost: { energy: 6 }, attack: 1, hp: 1, keywords: { lethal: true, airborne: true, trueShield: true } },
  // Adventure boss token (False Hydra / "Ignorance is Bliss"): a mindless cult
  // follower. Airborne so it never drowns regardless of which lane it's placed in —
  // its self-sacrifice-and-mill trigger should fire uniformly on every lane.
  { id: 'cult-follower', name: 'Follower', element: 'water', text: 'A mindless follower of the cult. If it survives to the start of its owner\'s next turn, it sacrifices itself and its owner mills a card.', tags: ['token'], wip: false, type: 'unit', cost: { energy: 0 }, attack: 0, hp: 1, keywords: { doubleTeam: true, airborne: true }, startOfTurn: [{ kind: 'damage', amount: 99, target: 'self' }, { kind: 'forget', amount: 1, target: 'self' }] },
  { id: 'dead-weight', name: 'Dead Weight', element: 'nature', text: 'Junk forced into a hand. Hindering to clear — you must bank one of every element to play it away.', tags: ['token'], wip: false, type: 'unit', cost: { energy: 1, elements: [{ type: 'fire', amount: 1 }, { type: 'water', amount: 1 }, { type: 'nature', amount: 1 }, { type: 'earth', amount: 1 }] }, attack: 0, hp: 4, keywords: {} },
  { id: 'flicker-moth', name: 'Flicker Moth', element: 'fire', tags: [], wip: false, type: 'unit', cost: { energy: 1 }, attack: 2, hp: 1, keywords: {} },
  { id: 'coal-runner', name: 'Coal Runner', element: 'fire', tags: [], wip: false, type: 'unit', cost: { energy: 2 }, attack: 3, hp: 2, keywords: {} },
  { id: 'blaze-hound', name: 'Blaze Hound', element: 'fire', tags: [], wip: false, type: 'unit', cost: { energy: 3 }, attack: 4, hp: 2, keywords: {} },
  { id: 'inferno-ox', name: 'Inferno Ox', element: 'fire', tags: [], wip: false, type: 'unit', cost: { energy: 5 }, attack: 5, hp: 4, keywords: {} },
  { id: 'river-minnow', name: 'River Minnow', element: 'water', tags: [], wip: false, type: 'unit', cost: { energy: 1 }, attack: 1, hp: 2, keywords: {} },
  { id: 'reef-darter', name: 'Reef Darter', element: 'water', tags: [], wip: false, type: 'unit', cost: { energy: 2 }, attack: 2, hp: 3, keywords: {} },
  { id: 'current-rider', name: 'Current Rider', element: 'water', tags: [], wip: false, type: 'unit', cost: { energy: 3 }, attack: 3, hp: 3, keywords: {} },
  { id: 'glacial-ray', name: 'Glacial Ray', element: 'water', text: 'Splash: its attack also hits the front unit of each adjacent lane (no retaliation).', tags: [], wip: false, type: 'unit', cost: { energy: 4, elements: [{ type: 'water', amount: 1 }] }, attack: 2, hp: 3, keywords: { splashDamage: true } },
  { id: 'abyss-warden', name: 'Abyss Warden', element: 'water', tags: [], wip: false, type: 'unit', cost: { energy: 5 }, attack: 4, hp: 5, keywords: {} },
  { id: 'field-mouse', name: 'Field Mouse', element: 'nature', tags: [], wip: false, type: 'unit', cost: { energy: 1 }, attack: 1, hp: 2, keywords: {} },
  { id: 'briar-colt', name: 'Briar Colt', element: 'nature', tags: [], wip: false, type: 'unit', cost: { energy: 2 }, attack: 2, hp: 3, keywords: {} },
  { id: 'oak-sentry', name: 'Oak Sentry', element: 'nature', tags: [], wip: false, type: 'unit', cost: { energy: 3 }, attack: 3, hp: 4, keywords: {} },
  { id: 'pebble-pup', name: 'Pebble Pup', element: 'earth', tags: [], wip: false, type: 'unit', cost: { energy: 1 }, attack: 1, hp: 2, keywords: {} },
  { id: 'gravel-hound', name: 'Gravel Hound', element: 'earth', tags: [], wip: false, type: 'unit', cost: { energy: 2 }, attack: 2, hp: 3, keywords: {} },
  { id: 'granite-ox', name: 'Granite Ox', element: 'earth', tags: [], wip: false, type: 'unit', cost: { energy: 4 }, attack: 3, hp: 5, keywords: {} },
  { id: 'mountain-bull', name: 'Mountain Bull', element: 'earth', tags: [], wip: false, type: 'unit', cost: { energy: 5 }, attack: 4, hp: 5, keywords: {} },
  { id: 'razor-charger', name: 'Razor Charger', element: 'fire', text: 'Strike Through.', tags: [], wip: false, type: 'unit', cost: { energy: 4, elements: [{ type: 'fire', amount: 1 }] }, attack: 3, hp: 2, keywords: { strikeThrough: true } },
  { id: 'comet-rider', name: 'Comet Rider', element: 'fire', text: 'Battle Ready.', tags: [], wip: false, type: 'unit', cost: { energy: 3, elements: [{ type: 'fire', amount: 1 }] }, attack: 2, hp: 1, keywords: { battleReady: true } },
  { id: 'twin-blade', name: 'Twin Blade', element: 'fire', text: 'Double Strike.', tags: [], wip: false, type: 'unit', cost: { energy: 5, elements: [{ type: 'fire', amount: 1 }] }, attack: 2, hp: 2, keywords: { doubleStrike: true } },
  { id: 'split-arrow', name: 'Split Arrow', element: 'fire', text: 'Branch Shot.', tags: [], wip: false, type: 'unit', cost: { energy: 4, elements: [{ type: 'fire', amount: 1 }] }, attack: 3, hp: 1, keywords: { branchShot: true } },
  { id: 'ember-tick', name: 'Ember Tick', element: 'fire', text: 'On hit: inflict Burn 1.', tags: [], wip: false, type: 'unit', cost: { energy: 2, elements: [{ type: 'fire', amount: 1 }] }, attack: 1, hp: 2, keywords: {}, onHit: { burn: 1 } },
  { id: 'plague-rat', name: 'Plague Rat', element: 'nature', text: 'On hit: inflict Poison.', tags: [], wip: false, type: 'unit', cost: { energy: 2, elements: [{ type: 'nature', amount: 1 }] }, attack: 1, hp: 2, keywords: {}, onHit: { poison: true } },
  { id: 'ashen-bomber', name: 'Ashen Bomber', element: 'fire', text: 'On death: deal 3 damage to enemies in its lane.', tags: [], wip: false, type: 'unit', cost: { energy: 2, elements: [{ type: 'fire', amount: 1 }] }, attack: 2, hp: 2, keywords: { kamikaze: { kind: 'damage', amount: 3, target: 'enemy' } } },
  { id: 'creeping-blight', name: 'Creeping Blight', element: 'nature', text: 'Inflict Poison on all enemy units.', tags: [], wip: false, type: 'spell', cost: { energy: 2, elements: [{ type: 'nature', amount: 1 }] }, effects: [{ kind: 'applyStatus', target: 'all-enemy', status: 'poison' }] },
  { id: 'wildfire-spread', name: 'Wildfire Spread', element: 'fire', text: 'Inflict Burn 2 on all enemy units.', tags: [], wip: false, type: 'spell', cost: { energy: 4, elements: [{ type: 'fire', amount: 1 }] }, effects: [{ kind: 'applyStatus', amount: 2, target: 'all-enemy', status: 'burn' }] },
  { id: 'dream-eater', name: 'Dream Eater', element: 'water', text: 'Sniper. On hit: inflict Sleep.', tags: [], wip: false, type: 'unit', cost: { energy: 3, elements: [{ type: 'water', amount: 2 }] }, attack: 1, hp: 2, keywords: { sniper: true }, onHit: { sleep: 1 } },
  { id: 'void-caller', name: 'Void Caller', element: 'water', text: 'Deal 2 damage to all enemy units.', tags: [], wip: false, type: 'spell', cost: { energy: 2, elements: [{ type: 'water', amount: 1 }] }, effects: [{ kind: 'damage', amount: 2, target: 'all-enemy' }] },
  { id: 'lull', name: 'Lull', element: 'water', text: 'Put all enemy units to Sleep.', tags: [], wip: false, type: 'spell', cost: { energy: 4, elements: [{ type: 'water', amount: 1 }] }, effects: [{ kind: 'applyStatus', amount: 2, target: 'all-enemy', status: 'sleep' }] },
  { id: 'cursed-gift', name: 'Cursed Gift', element: 'water', text: 'Add a Dead Weight to your opponent\'s hand.', tags: [], wip: false, type: 'spell', cost: { energy: 1, elements: [{ type: 'water', amount: 1 }] }, effects: [{ kind: 'conjure', target: 'enemy', cardId: 'dead-weight' }] },
  { id: 'mind-leech', name: 'Mind Leech', element: 'water', text: 'On hit: inflict Sleep. On death: add a Dead Weight to the enemy hand.', tags: [], wip: false, type: 'unit', cost: { energy: 4, elements: [{ type: 'water', amount: 2 }] }, attack: 1, hp: 3, keywords: { kamikaze: { kind: 'conjure', target: 'enemy', cardId: 'dead-weight' } }, onHit: { sleep: 0 } },
  { id: 'bulwark-toad', name: 'Bulwark Toad', element: 'earth', text: 'Taunt. Shield 1.', tags: [], wip: false, type: 'unit', cost: { energy: 3, elements: [{ type: 'earth', amount: 2 }] }, attack: 0, hp: 3, keywords: { shield: 1, taunt: true } },
  { id: 'barbed-sentinel', name: 'Barbed Sentinel', element: 'earth', text: 'Taunt. Spike 2.', tags: [], wip: false, type: 'unit', cost: { energy: 3, elements: [{ type: 'earth', amount: 2 }] }, attack: 1, hp: 4, keywords: { taunt: true, spike: 2 } },
  { id: 'thornmail-beetle', name: 'Thornmail Beetle', element: 'earth', text: 'Spike 1. On hit: inflict Poison.', tags: [], wip: false, type: 'unit', cost: { energy: 4, elements: [{ type: 'earth', amount: 2 }] }, attack: 1, hp: 4, keywords: { spike: 1 }, onHit: { poison: true } },
  { id: 'aegis-ancient', name: 'Aegis Ancient', element: 'earth', text: 'Taunt. Tough 2. At end of turn: heal your leader 2.', tags: [], wip: false, type: 'unit', cost: { energy: 6, elements: [{ type: 'earth', amount: 3 }] }, attack: 2, hp: 3, keywords: { taunt: true, tough: 2 }, onPlay: [], onAttack: [], endOfTurn: [{ kind: 'heal', amount: 2, target: 'leader' }], startOfTurn: [] },
  { id: 'brood-mother', name: 'Brood Mother', element: 'nature', text: 'On play: summon two Mechanical Failures.', tags: [], wip: false, type: 'unit', cost: { energy: 6, elements: [{ type: 'nature', amount: 2 }] }, attack: 2, hp: 3, keywords: {}, onPlay: [{ kind: 'summon', cardId: 'critter-token' }, { kind: 'summon', cardId: 'critter-token' }] },
  { id: 'hive-spawn', name: 'Hive Spawn', element: 'nature', text: 'On death: summon a Mechanical Failure.', tags: [], wip: false, type: 'unit', cost: { energy: 3, elements: [{ type: 'nature', amount: 1 }] }, attack: 2, hp: 2, keywords: { kamikaze: { kind: 'summon', cardId: 'critter-token' } } },
  { id: 'apex-predator', name: 'Apex Predator', element: 'nature', text: 'Growth: +1/+1 per turn. Bloodlust: +2/0 per kill.', tags: [], wip: false, type: 'unit', cost: { energy: 10, elements: [{ type: 'nature', amount: 2 }] }, attack: 4, hp: 5, keywords: { bloodlust: { buff: { attack: 2, hp: 0 } }, growth: { attack: 1, hp: 1 } } },
  // --- Ramp payoffs: heavy nature pips (cap-locked to nature-4 leaders) with strong mechanics
  //     that Corpselock's banking reaches turns earlier than anyone else. ---
  { id: 'worldheart-wyrm', name: 'Worldheart Wyrm', element: 'nature', text: 'Strike Through. Bloodlust: +1/+1 per kill.', tags: [], wip: false, type: 'unit', cost: { energy: 15, elements: [{ type: 'nature', amount: 2 }] }, attack: 7, hp: 7, keywords: { strikeThrough: true, bloodlust: { buff: { attack: 1, hp: 1 } } } },
  { id: 'grove-elder', name: 'Elder of the Grove', element: 'nature', text: 'Producer: 2 energy/turn. On play: draw a card.', tags: [], wip: false, type: 'unit', cost: { energy: 4, elements: [{ type: 'nature', amount: 2 }] }, attack: 1, hp: 5, keywords: {}, onPlay: [{ kind: 'draw', amount: 1 }], onAttack: [], endOfTurn: [{ kind: 'energyNext', amount: 2 }], startOfTurn: [] },
  { id: 'verdant-cataclysm', name: 'Verdant Cataclysm', element: 'nature', text: 'Deal 3 damage to all enemies and heal all allies 2.', tags: [], wip: false, type: 'spell', cost: { energy: 5, elements: [{ type: 'nature', amount: 2 }] }, effects: [{ kind: 'damage', amount: 3, target: 'all-enemy' }, { kind: 'heal', amount: 2, target: 'all-ally' }] },
  // --- Swarm payoffs: an anthem the wide board rides, and a carry the swarm protects with
  //     bodies (Brood Warlord pumps the team every turn — the swarm keeps it alive). ---
  { id: 'hivemind-surge', name: 'Hivemind Surge', element: 'nature', text: 'Give all allied units +1/+1.', tags: [], wip: false, type: 'spell', cost: { energy: 1, elements: [{ type: 'nature', amount: 1 }] }, effects: [{ kind: 'buff', target: 'all-ally', stat: { attack: 1, hp: 1 } }] },
  { id: 'brood-warlord', name: 'Brood Warlord', element: 'nature', text: 'At end of turn: give all other allied units +1/0.', tags: [], wip: false, type: 'unit', cost: { energy: 4, elements: [{ type: 'nature', amount: 1 }] }, attack: 2, hp: 5, keywords: {}, onPlay: [], onAttack: [], endOfTurn: [{ kind: 'buff', target: 'all-ally', stat: { attack: 1, hp: 0 } }], startOfTurn: [] },
  { id: 'sun-priest', name: 'Sun Priest', element: 'nature', text: 'Producer: 2 energy/turn.', tags: [], wip: false, type: 'unit', cost: { energy: 2, elements: [{ type: 'nature', amount: 1 }] }, attack: 1, hp: 3, keywords: {}, onPlay: [], onAttack: [], endOfTurn: [{ kind: 'energyNext', amount: 2 }], startOfTurn: [] },
  { id: 'reef-raptor', name: 'Reef Raptor', element: 'water', text: 'Aquatic.', tags: [], wip: false, type: 'unit', cost: { energy: 2 }, attack: 3, hp: 2, keywords: { aquatic: true } },
  { id: 'tide-stalker', name: 'Tide Stalker', element: 'water', text: 'Sniper. Aquatic: +2/0 in Water.', tags: [], wip: false, type: 'unit', cost: { energy: 1, elements: [{ type: 'water', amount: 2 }] }, attack: 2, hp: 2, keywords: { sniper: true, aquatic: [{ kind: 'buff', target: 'self', stat: { attack: 2 } }] } },
  { id: 'crag-hawk', name: 'Crag Hawk', element: 'earth', text: 'Airborne. Sniper.', tags: [], wip: false, type: 'unit', cost: { energy: 2, elements: [{ type: 'earth', amount: 2 }] }, attack: 2, hp: 2, keywords: { sniper: true, airborne: true } },
  { id: 'herd-driver', name: 'Herd Driver', element: 'nature', text: 'Each turn: move an enemy unit.', tags: [], wip: false, type: 'unit', cost: { energy: 3, elements: [{ type: 'nature', amount: 1 }] }, attack: 2, hp: 4, keywords: {}, onPlay: [], onAttack: [], endOfTurn: [], startOfTurn: [{ kind: 'move', target: 'enemy' }] },
  { id: 'lullaby-spirit', name: 'Lullaby Spirit', element: 'water', text: 'Double Team. On hit: inflict Sleep.', tags: [], wip: false, type: 'unit', cost: { energy: 5, elements: [{ type: 'water', amount: 2 }] }, attack: 1, hp: 3, keywords: { doubleTeam: true }, onHit: { sleep: 1 } },
  { id: 'spiked-base', name: 'Spiked Base', element: 'earth', text: 'Grants +0/+2 and Spike 1.', tags: [], wip: false, type: 'foundation', cost: { energy: 5, elements: [{ type: 'earth', amount: 2 }] }, attack: 2, hp: 4, keywords: {}, grants: { keywords: { spike: 1 } } },
  { id: 'taunt-totem', name: 'Taunt Totem', element: 'earth', text: 'Grants +0/+2 and Taunt.', tags: [], wip: false, type: 'foundation', cost: { energy: 3, elements: [{ type: 'earth', amount: 2 }] }, attack: 2, hp: 4, keywords: {}, grants: { keywords: { taunt: true } } },
  { id: 'ward-stone', name: 'Ward Stone', element: 'water', text: 'Grants Shield 1.', tags: [], wip: false, type: 'foundation', cost: { energy: 7, elements: [{ type: 'water', amount: 2 }] }, attack: 2, hp: 4, keywords: {}, grants: { keywords: { shield: 1 } } },
  { id: 'lookout-perch', name: 'Lookout Perch', element: 'earth', text: 'Grants Sniper.', tags: [], wip: false, type: 'foundation', cost: { energy: 2, elements: [{ type: 'earth', amount: 2 }] }, attack: 2, hp: 3, keywords: {}, grants: { keywords: { sniper: true } } },
  { id: 'launch-ramp', name: 'Launch Ramp', element: 'fire', text: 'Grants Overshot and +1/0.', tags: [], wip: false, type: 'foundation', cost: { energy: 7, elements: [{ type: 'fire', amount: 2 }] }, attack: 3, hp: 3, keywords: {}, grants: { keywords: { overshot: true } } },
  { id: 'siege-platform', name: 'Siege Platform', element: 'fire', text: 'Grants Strike Through.', tags: [], wip: false, type: 'foundation', cost: { energy: 6, elements: [{ type: 'fire', amount: 2 }] }, attack: 2, hp: 4, keywords: {}, grants: { keywords: { strikeThrough: true } } },
  { id: 'forked-mount', name: 'Forked Mount', element: 'nature', text: 'Grants Branch Shot.', tags: [], wip: false, type: 'foundation', cost: { energy: 7, elements: [{ type: 'nature', amount: 2 }] }, attack: 2, hp: 4, keywords: {}, grants: { keywords: { branchShot: true } } },
  { id: 'undertow-base', name: 'Undertow Base', element: 'water', text: 'Grants Undershot.', tags: [], wip: false, type: 'foundation', cost: { energy: 4, elements: [{ type: 'water', amount: 2 }] }, attack: 2, hp: 4, keywords: {}, grants: { keywords: { undershot: true } } },
  { id: 'whetstone-altar', name: 'Whetstone Altar', element: 'earth', text: 'Grants Lethal.', tags: [], wip: false, type: 'foundation', cost: { energy: 8, elements: [{ type: 'earth', amount: 2 }] }, attack: 2, hp: 4, keywords: {}, grants: { keywords: { lethal: true } } },
  { id: 'springboard', name: 'Springboard', element: 'fire', text: 'Grants Battle Ready and +1/0.', tags: [], wip: false, type: 'foundation', cost: { energy: 5, elements: [{ type: 'fire', amount: 2 }] }, attack: 2, hp: 3, keywords: {}, grants: { keywords: { battleReady: true } } },
  { id: 'twin-perch', name: 'Twin Perch', element: 'water', text: 'Grants Double Team.', tags: [], wip: false, type: 'foundation', cost: { energy: 5, elements: [{ type: 'water', amount: 2 }] }, attack: 2, hp: 4, keywords: {}, grants: { keywords: { doubleTeam: true } } },
  { id: 'roost-nest', name: 'Roost Nest', element: 'nature', text: 'Grants Airborne.', tags: [], wip: false, type: 'foundation', cost: { energy: 4, elements: [{ type: 'nature', amount: 2 }] }, attack: 2, hp: 3, keywords: {}, grants: { keywords: { airborne: true } } },
  { id: 'tidal-dock', name: 'Tidal Dock', element: 'water', text: 'Grants Aquatic and +0/+1.', tags: [], wip: false, type: 'foundation', cost: { energy: 3, elements: [{ type: 'water', amount: 1 }] }, attack: 2, hp: 3, keywords: {}, grants: { keywords: { aquatic: true } } },
  { id: 'reactive-plating', name: 'Reactive Plating', element: 'earth', text: 'Grants Polish: +1/0 when hit.', tags: [], wip: false, type: 'foundation', cost: { energy: 5, elements: [{ type: 'earth', amount: 2 }] }, attack: 2, hp: 4, keywords: {}, grants: { keywords: { polish: { stat: { attack: 1, hp: 0 } } } } },
  { id: 'rally-banner', name: 'Rally Banner', element: 'nature', text: 'Grants Bloodlust: +1/+1 per kill.', tags: [], wip: false, type: 'foundation', cost: { energy: 6, elements: [{ type: 'nature', amount: 2 }] }, attack: 2, hp: 4, keywords: {}, grants: { keywords: { bloodlust: { buff: { attack: 1, hp: 1 } } } } },
  { id: 'fertile-mound', name: 'Fertile Mound', element: 'nature', text: 'Grants Growth: +1/+1 per turn.', tags: [], wip: false, type: 'foundation', cost: { energy: 8, elements: [{ type: 'nature', amount: 2 }] }, attack: 2, hp: 4, keywords: {}, grants: { keywords: { growth: { attack: 1, hp: 1 } } } },
  { id: 'mana-geyser', name: 'Mana Geyser', element: 'nature', text: 'Grants Producer: 1 energy/turn.', tags: [], wip: false, type: 'foundation', cost: { energy: 2, elements: [{ type: 'nature', amount: 3 }] }, attack: 1, hp: 4, keywords: { producer: { amount: 1 } }, grants: { endOfTurn: [{ kind: 'energyNext', amount: 1 }] } },
  { id: 'phylactery', name: 'Phylactery', element: 'earth', text: 'Grants Zombified.', tags: [], wip: false, type: 'foundation', cost: { energy: 6, elements: [{ type: 'earth', amount: 2 }] }, attack: 2, hp: 4, keywords: {}, grants: { keywords: { zombified: true } } },
  { id: 'venom-gland', name: 'Venom Gland', element: 'nature', text: 'Grants On-hit Poison.', tags: [], wip: false, type: 'foundation', cost: { energy: 2, elements: [{ type: 'nature', amount: 3 }] }, attack: 2, hp: 3, keywords: {}, onHit: { poison: true }, grants: { onHit: { poison: true } } },
  { id: 'ember-anvil', name: 'Ember Anvil', element: 'fire', text: 'Grants On-hit Burn 1.', tags: [], wip: false, type: 'foundation', cost: { energy: 2, elements: [{ type: 'fire', amount: 3 }] }, attack: 2, hp: 3, keywords: {}, onHit: { burn: 1 }, grants: { onHit: { burn: 1 } } },
  { id: 'twin-fang-mount', name: 'Twin Fang Mount', element: 'earth', text: 'Grants Double Strike.', tags: [], wip: false, type: 'foundation', cost: { energy: 7, elements: [{ type: 'earth', amount: 2 }] }, attack: 2, hp: 4, keywords: {}, grants: { keywords: { doubleStrike: true } } },
  { id: 'lifewell-base', name: 'Lifewell Base', element: 'nature', text: 'Grants +0/+2 and Healer: heal an ally 1/turn.', tags: [], wip: false, type: 'foundation', cost: { energy: 3, elements: [{ type: 'nature', amount: 2 }] }, attack: 2, hp: 4, keywords: {}, grants: { endOfTurn: [{ kind: 'heal', amount: 1, target: 'ally' }] } },
  { id: 'crows-nest', name: 'Crow\'s Nest', element: 'fire', text: 'Heights only. All units gain Strike Through.', tags: [], wip: false, type: 'environment', cost: { energy: 2, elements: [{ type: 'fire', amount: 1 }] }, lanes: ['heights'], effects: [{ kind: 'custom', note: 'All units gain Strike Through' }], grantKeywords: { strikeThrough: true } },
  { id: 'thornfield', name: 'Thornfield', element: 'earth', text: 'All units gain Spike 1.', tags: [], wip: false, type: 'environment', cost: { energy: 1, elements: [{ type: 'earth', amount: 1 }] }, lanes: [], effects: [{ kind: 'custom', note: 'All units gain Spike 1' }], grantKeywords: { spike: 1 } },
  { id: 'fortified-line', name: 'Fortified Line', element: 'earth', text: 'Ground only. All units gain Taunt.', tags: [], wip: false, type: 'environment', cost: { energy: 0 }, lanes: ['ground'], effects: [{ kind: 'custom', note: 'All units gain Taunt' }], grantKeywords: { taunt: true } },
  { id: 'bunker', name: 'Bunker', element: 'earth', text: 'All units gain Tough 1.', tags: [], wip: false, type: 'environment', cost: { energy: 3, elements: [{ type: 'earth', amount: 1 }] }, lanes: [], effects: [{ kind: 'custom', note: 'All units gain Tough 1' }], grantKeywords: { tough: 1 } },
  { id: 'aegis-veil', name: 'Aegis Veil', element: 'water', text: 'All units gain Shield 1.', tags: [], wip: false, type: 'environment', cost: { energy: 3, elements: [{ type: 'water', amount: 1 }] }, lanes: [], effects: [{ kind: 'custom', note: 'All units gain Shield 1' }], grantKeywords: { shield: 1 } },
  { id: 'sanctified-ground', name: 'Sanctified Ground', element: 'earth', text: 'All units gain Immunity.', tags: [], wip: false, type: 'environment', cost: { energy: 2, elements: [{ type: 'earth', amount: 1 }] }, lanes: [], effects: [{ kind: 'custom', note: 'All units gain Immunity' }], grantKeywords: { immunity: true } },
  { id: 'killing-fields', name: 'Killing Fields', element: 'earth', text: 'All units gain Lethal.', tags: [], wip: false, type: 'environment', cost: { energy: 4, elements: [{ type: 'earth', amount: 1 }] }, lanes: [], effects: [{ kind: 'custom', note: 'All units gain Lethal' }], grantKeywords: { lethal: true } },
  { id: 'thin-air', name: 'Thin Air', element: 'fire', text: 'All units gain Battle Ready.', tags: [], wip: false, type: 'environment', cost: { energy: 2, elements: [{ type: 'fire', amount: 1 }] }, lanes: [], effects: [{ kind: 'custom', note: 'All units gain Battle Ready' }], grantKeywords: { battleReady: true } },
  { id: 'crossfire-range', name: 'Crossfire Range', element: 'fire', text: 'Ground only. All units gain Branch Shot.', tags: [], wip: false, type: 'environment', cost: { energy: 3, elements: [{ type: 'fire', amount: 1 }] }, lanes: ['ground'], effects: [{ kind: 'custom', note: 'All units gain Branch Shot' }], grantKeywords: { branchShot: true } },
  { id: 'high-ground', name: 'High Ground', element: 'fire', text: 'All units gain Overshot and Splash Damage.', tags: [], wip: false, type: 'environment', cost: { energy: 5, elements: [{ type: 'fire', amount: 2 }] }, lanes: [], effects: [{ kind: 'custom', note: 'All units gain Overshot and Splash Damage' }], grantKeywords: { overshot: true, splashDamage: true } },
  { id: 'spawning-pool', name: 'Spawning Pool', element: 'nature', text: 'Ground only. All units gain Bloodlust: +1/0 per kill.', tags: [], wip: false, type: 'environment', cost: { energy: 1, elements: [{ type: 'nature', amount: 1 }] }, lanes: ['ground'], effects: [{ kind: 'custom', note: 'All units gain Bloodlust: +1/0' }], grantKeywords: { bloodlust: { buff: { attack: 1, hp: 0 } } } },
  { id: 'overgrowth', name: 'Overgrowth', element: 'nature', text: 'All units gain Growth: +1/0 per turn.', tags: [], wip: false, type: 'environment', cost: { energy: 3, elements: [{ type: 'nature', amount: 1 }] }, lanes: [], effects: [{ kind: 'custom', note: 'All units gain Growth: +1/0' }], grantKeywords: { growth: { attack: 1, hp: 0 } } },
  { id: 'tundra', name: 'Tundra', element: 'water', text: 'Units entering this lane are Frozen.', tags: [], wip: false, type: 'environment', cost: { energy: 2, elements: [{ type: 'water', amount: 1 }] }, lanes: [], effects: [{ kind: 'applyStatus', target: 'any', status: 'freeze' }] },
  // Water only: the one Environment that opens the Water lane to everyone — units in it
  // gain Aquatic, so non-swimmers stop drowning (see engine/drowning.ts).
  { id: 'shallows', name: 'Shallows', element: 'water', text: 'Water only. All units in this lane gain Aquatic.', tags: [], wip: false, type: 'environment', cost: { energy: 0 }, lanes: ['water'], effects: [{ kind: 'custom', note: 'All units gain Aquatic' }], grantKeywords: { aquatic: true } },
  { id: 'lullaby-grove', name: 'Lullaby Grove', element: 'water', text: 'Units entering this lane fall Asleep.', tags: [], wip: false, type: 'environment', cost: { energy: 1, elements: [{ type: 'water', amount: 1 }] }, lanes: [], effects: [{ kind: 'applyStatus', amount: 1, target: 'any', status: 'sleep' }] },
  { id: 'healing-spring', name: 'Healing Spring', element: 'nature', text: 'Units entering this lane heal 2.', tags: [], wip: false, type: 'environment', cost: { energy: 0, elements: [{ type: 'nature', amount: 1 }] }, lanes: [], effects: [{ kind: 'heal', amount: 2, target: 'any' }] },
  // Recurring-tick hazards: applyEnvironmentEffects re-runs an environment's effects on EVERY
  // unit in the lane (both players) each combat, so these bite/heal once per turn.
  // Cinder Field powers the Polish loop — a Polish unit takes the 1 self-damage each turn and
  // triggers, snowballing (e.g. Pebble Snake +1/0, Bowling Boulder +0/+2). Budget: the symmetric
  // hazards are priced well under the strict all-units ×2.5 multiplier (molten-floor's conditional
  // Burn = fire:1 → 0.5; sludge 1.0; tundra 2.5). A GUARANTEED 1 dmg/turn to all is ~3× molten-floor
  // → energy 1 + fire 1 = 1.5 budget. Symmetric (hits your own bodies too), which is the drawback.
  { id: 'cinder-field', name: 'Cinder Field', element: 'fire', text: 'Deals 1 damage to every unit in this lane each turn.', tags: [], wip: false, type: 'environment', cost: { energy: 0, elements: [{ type: 'fire', amount: 1 }] }, lanes: [], effects: [{ kind: 'damage', amount: 1, target: 'any' }] },
  // Sacred Spring — the mirror of Cinder Field: recurring sustain instead of chip. Same 1.5 budget
  // (heal ≈ damage as a per-turn 1-point swing to all; symmetric, so it tops off enemies too).
  // (Note: healing-spring above already heals lane units each combat too — this is the element-gated, lower-rate sibling.)
  { id: 'sacred-spring', name: 'Sacred Spring', element: 'nature', text: 'Heals every unit in this lane 1 each turn.', tags: [], wip: false, type: 'environment', cost: { energy: 0, elements: [{ type: 'nature', amount: 1 }] }, lanes: [], effects: [{ kind: 'heal', amount: 1, target: 'any' }] },
  { id: 'shifting-sands', name: 'Shifting Sands', element: 'earth', text: 'All units gain Mover (self): wander each turn.', tags: [], wip: false, type: 'environment', cost: { energy: 1, elements: [{ type: 'earth', amount: 1 }] }, lanes: [], effects: [{ kind: 'custom', note: 'All units wander each turn' }], grantKeywords: { mover: { scope: 'self', trigger: 'endOfTurn' } } },
  { id: 'sig-pyre-bloom', name: 'Steam Bath', element: 'fire', text: 'Signature: inflict Burn 2 on all enemy units.', tags: ['signature'], wip: false, type: 'spell', cost: { energy: 0 }, effects: [{ kind: 'applyStatus', amount: 2, target: 'all-enemy', status: 'burn' }] },
  { id: 'sig-final-charge', name: 'Overexert', element: 'fire', text: 'Signature: all allies gain +1/0 and a bonus attack.', tags: ['signature'], wip: false, type: 'spell', cost: { energy: 0 }, effects: [{ kind: 'buff', target: 'all-ally', stat: { attack: 1 } }, { kind: 'extraAction', target: 'all-ally' }] },
  { id: 'sig-deep-freeze', name: 'Masking', element: 'water', text: 'Signature: freeze all enemy units and give one of your units Undershot and Double Strike.', tags: ['signature'], wip: false, type: 'spell', cost: { energy: 0 }, effects: [{ kind: 'applyStatus', target: 'all-enemy', status: 'freeze' }, { kind: 'buff', target: 'ally', keywords: { undershot: true, doubleStrike: true } }] },
  { id: 'sig-time-stop', name: 'Time Stop', element: 'nature', text: 'Signature: put all enemy units to Sleep.', tags: ['signature'], wip: false, type: 'spell', cost: { energy: 0 }, effects: [{ kind: 'applyStatus', amount: 2, target: 'all-enemy', status: 'sleep' }] },
  { id: 'sig-overflow', name: 'Stage 4', element: 'nature', text: 'Signature: fill every element bank to its cap.', tags: ['signature'], wip: false, type: 'spell', cost: { energy: 0 }, effects: [{ kind: 'bankMax' }] },
  { id: 'sig-oblivion', name: 'Happy Hour', element: 'water', text: 'Signature: expel every enemy unit to the opponent\'s hand (overflowing it).', tags: ['signature'], wip: false, type: 'spell', cost: { energy: 0 }, effects: [{ kind: 'expel', target: 'all-enemy' }] },
  { id: 'sig-swarm-call', name: '8Bits', element: 'nature', text: 'Signature: summon a Techtacle (Lethal, True Shield, Airborne) in every lane.', tags: ['signature'], wip: false, type: 'spell', cost: { energy: 0 }, effects: [{ kind: 'summon', cardId: 'critter-elite', lane: 'heights' }, { kind: 'summon', cardId: 'critter-elite', lane: 'ground1' }, { kind: 'summon', cardId: 'critter-elite', lane: 'ground2' }, { kind: 'summon', cardId: 'critter-elite', lane: 'water' }] },
  { id: 'sig-thornburst', name: 'Swift Kill', element: 'earth', text: 'Signature: deal 5 to an enemy; on a kill, chain 4, 3, 2… to the next-weakest enemy.', tags: ['signature'], wip: false, type: 'spell', cost: { energy: 0 }, effects: [{ kind: 'damage', amount: 5, target: 'enemy', chainDiminish: true }] },
  { id: 'sig-equalize', name: 'Reflections of Omniscience', element: 'nature', text: 'Signature: reduce every enemy unit by -2/-2.', tags: ['signature'], wip: false, type: 'spell', cost: { energy: 0 }, effects: [{ kind: 'debuff', target: 'all-enemy', stat: { attack: 2, hp: 2 } }] },
  { id: 'sig-keystone', name: 'Fortune Foretold', element: 'earth', text: 'Signature Foundation: grants +1/+3, Taunt, Tough 1 and Spike 2 to the unit above it.', tags: ['signature'], wip: false, type: 'foundation', cost: { energy: 0 }, attack: 3, hp: 5, keywords: {}, grants: { keywords: { taunt: true, spike: 2, tough: 1 } } },
  { id: 'sig-ascension', name: 'Death Goddess\' Will', element: 'nature', text: 'Signature Foundation: grants Immunity, Zombified and Growth +2/+2 to the unit above it.', tags: ['signature'], wip: false, type: 'foundation', cost: { energy: 0 }, attack: 3, hp: 4, keywords: {}, grants: { keywords: { immunity: true, zombified: true, growth: { attack: 2, hp: 2 } } } },
  { id: 'sig-pathmaker', name: 'Guardian of Ruins', element: 'water', text: 'Signature: give an ally Immunity and Undershot. All environments cost 0 energy this turn. Conjure a Tundra.', tags: ['signature'], wip: false, type: 'spell', cost: { energy: 0 }, effects: [{ kind: 'buff', target: 'ally', keywords: { immunity: true, undershot: true } }, { kind: 'costMod', amount: -99, cardType: 'environment' }, { kind: 'conjure', target: 'self', cardId: 'tundra' }] },
  { id: 'ringleader-avatar', name: 'Ring Leader, Incarnate', element: 'nature', text: 'Leader-unit. Airborne, Taunt, Immunity. If it dies, you lose.', tags: ['signature'], wip: false, type: 'unit', cost: { energy: 0 }, attack: 0, hp: 30, keywords: { airborne: true, taunt: true, immunity: true } },
  { id: 'sig-incarnate', name: 'Core Component', element: 'nature', text: 'Signature: your leader-unit gains Shield 1, Bloodlust +0/+1 and Undershot.', tags: ['signature'], wip: false, type: 'spell', cost: { energy: 0 }, effects: [{ kind: 'applyStatus', amount: 1, target: 'leaderUnit', status: 'shield' }, { kind: 'buff', target: 'leaderUnit', keywords: { undershot: true, bloodlust: { buff: { attack: 0, hp: 1 } } } }] },
  { id: 'iron-ward', name: 'Iron Ward', element: 'water', text: 'Give an ally unit Shield 1.', tags: [], wip: false, type: 'spell', cost: { energy: 2, elements: [{ type: 'water', amount: 1 }] }, effects: [{ kind: 'applyStatus', amount: 1, target: 'ally', status: 'shield' }] },
  { id: 'purify', name: 'Purify', element: 'water', text: 'Remove all status effects from an allied unit.', tags: [], wip: false, type: 'spell', cost: { energy: 0, elements: [{ type: 'water', amount: 1 }] }, effects: [{ kind: 'cleanse', target: 'ally' }] },
];



const rawLeaders = [
  // Kedou — DoT (merged from the former Vesh). Grinds the board down with Burn/Poison while
  // building a stronger force behind the dying units. Moderate fire-leaning curve.
  { id: 'kedou', name: 'Kedou', element: 'fire', elementCaps: { fire: 3, nature: 3, water: 1, earth: 1 }, heroPower: { name: 'Scald', cost: { energy: 1 }, effects: [{ kind: 'applyStatus', amount: 2, target: 'enemy', status: 'burn' }], text: 'Inflict Burn 2 on an enemy unit.' }, signatureCardId: 'sig-pyre-bloom' }, // DoT — fire+nature dual so Burn AND Poison are live. Scald Burn 1→2 (DoT was field-floor 36%): the repeatable reach is DoT's inevitability engine.
  // Cleath — Stall. Walls every lane and outlasts. Earth endgame, so it keeps its 4-cap.
  { id: 'cleath', name: 'Cleath', element: 'earth', elementCaps: { earth: 4, water: 2, fire: 1, nature: 1 }, heroPower: { name: 'Fortify', cost: { energy: 1 }, effects: [{ kind: 'buff', stat: { hp: 2 }, keywords: { taunt: true }, target: 'ally' }], text: 'Give an allied unit +2 HP and Taunt.' }, signatureCardId: 'sig-living-mountain' }, // Stall — Fortify was +1 HP for 1e (0.6 budget value) against Eksana's 2.4 for the same cost, the weakest power in the pool. +2 HP and Taunt brings it to ~2.4 and gives Stall the tool its plan actually needs: forcing attacks INTO the wall rather than past it.
  // --- One leader per archetype ---
  { id: 'orsyric', name: 'Orsyric', element: 'fire', elementCaps: { fire: 2, water: 2, nature: 2, earth: 2 }, heroPower: { name: 'Mind Whip', cost: { energy: 2 }, effects: [{ kind: 'damage', amount: 1, target: 'any' }], text: 'Deal 1 damage to any unit.' }, signatureCardId: 'sig-final-charge' }, // Aggro — nerfed Mind Whip 2→1 dmg (was 93% field). Target 'any' so it can hit allies too (combo/kamikaze enablement).
  { id: 'aleph', name: 'Aleph', element: 'nature', elementCaps: { nature: 2, earth: 2, fire: 2, water: 2 }, heroPower: { name: 'Disciplinary Power', cost: { energy: 2 }, effects: [{ kind: 'applyStatus', target: 'enemy', status: 'poison' }], text: 'Poison an enemy unit (it can no longer be buffed).' }, signatureCardId: 'sig-equalize' }, // Midrange
  { id: 'phantom', name: 'Phantom', element: 'water', elementCaps: { water: 4, earth: 2, nature: 1, fire: 1 }, heroPower: { name: 'Subdue', cost: { energy: 2 }, effects: [{ kind: 'applyStatus', amount: 1, target: 'enemy', status: 'sleep' }], text: 'Put an enemy unit to Sleep.' }, signatureCardId: 'sig-deep-freeze' }, // Control
  { id: 'screyera', name: 'Screyera', element: 'earth', elementCaps: { earth: 3, nature: 3, fire: 1, water: 1 }, heroPower: { name: 'Scry', cost: { energy: 2 }, effects: [{ kind: 'draw', amount: 2 }], text: 'Draw 2 cards.' }, signatureCardId: 'sig-keystone' }, // Combo — Scry 1e→2e. The 1e cost was set when Combo sat at 35% under the OLD economy, where energy was scarce and pips gated every play. Energy is plentiful now, so repeatable draw-2 became near-free and carried Combo to a 67% / 10W-2L field. grant+body combos.
  { id: 'ringleader', name: 'Ring Leader', element: 'nature', elementCaps: { nature: 2, water: 3, fire: 2, earth: 1 }, heroPower: { name: 'Modification', cost: { energy: 1 }, hpCost: 1, effects: [{ kind: 'buff', target: 'leaderUnit', stat: { attack: 1 } }], text: 'Pay 1 HP: your leader-unit gains +1 attack.' }, signatureCardId: 'sig-incarnate', leaderUnitCardId: 'ringleader-avatar' }, // Guardian
  { id: 'corpselock', name: 'Corpselock', element: 'nature', elementCaps: { nature: 4, earth: 2, fire: 1, water: 1 }, heroPower: { name: 'Cancerous Growth', cost: { energy: 2 }, effects: [{ kind: 'energyNext', amount: 2 }], text: 'Spend 2 energy to gain 2 energy next round.' }, signatureCardId: 'sig-overflow' }, // Ramp — pays for itself in 2 rounds and compounds if re-used (Ramp's bottleneck is survival, not banking speed). Corpselock + nature cards are fine; Ramp's ~40 reflects a greedy archetype, not a primitive fault.
  { id: 'johnpork', name: 'John Pork', element: 'water', elementCaps: { water: 3, nature: 3, fire: 1, earth: 1 }, heroPower: { name: 'Sweet Liquor', cost: { energy: 1 }, effects: [{ kind: 'forget', amount: 2, target: 'enemy' }], text: 'The opponent forgets 2 cards from their deck.' }, signatureCardId: 'sig-oblivion' }, // Deck Out
  { id: 'autopus', name: 'Autopus', element: 'nature', elementCaps: { nature: 3, fire: 2, earth: 2, water: 1 }, heroPower: { name: 'Fallback Code', cost: { energy: 1 }, effects: [{ kind: 'summon', cardId: 'critter-token' }], text: 'Summon a Mechanical Failure.' }, signatureCardId: 'sig-swarm-call' }, // Swarm
  { id: 'eksana', name: 'Eksana', element: 'earth', elementCaps: { earth: 3, nature: 2, water: 2, fire: 1 }, heroPower: { name: 'Exploit', cost: { energy: 1 }, effects: [{ kind: 'debuff', stat: { attack: 1 }, target: 'enemy' }], text: 'Debuff an enemy unit −1 attack.' }, signatureCardId: 'sig-thornburst' }, // Attrition
  { id: 'noctua', name: 'Noctua', element: 'nature', elementCaps: { nature: 4, earth: 2, fire: 1, water: 1 }, heroPower: { name: 'Tinkerer', cost: { energy: 2 }, effects: [{ kind: 'buff', target: 'ally', keywords: { growth: { attack: 1, hp: 1 } } }], text: 'Give an ally Growth: +1/+1 each turn.' }, signatureCardId: 'sig-ascension' }, // Snowball — Tinkerer replaces Nurture: grants permanent Growth (+1/+1/turn) for 2E rather than a one-time +1/+1 for 3E. More thematic snowball engine; requires unit survival to pay off.
  { id: 'naife', name: 'Naife', element: 'water', elementCaps: { water: 3, nature: 2, earth: 2, fire: 1 }, heroPower: { name: 'Misdirect', cost: { energy: 1 }, effects: [{ kind: 'move', target: 'enemy' }], text: 'Move an enemy unit to another lane.' }, signatureCardId: 'sig-pathmaker' }, // Lane Control
];

export const starterCards: Card[] = rawCards.map(parseCard);
export const starterLeaders: Leader[] = rawLeaders.map(parseLeader);
export const starterRegistry: Registry = buildRegistry(starterCards, starterLeaders);

// ============================================================
//  ARCHETYPE DECKS — one 40-card demonstrator per leader/archetype
//
//  Design notes (the "cost algorithm"): every deck is built to a curve that stays
//  effective the whole game rather than clumping at one cost. The rough template is
//  ~6 one-drops / ~10 two-drops / ~8 three-drops / ~7 four-drops / ~5 five-drops /
//  ~4 six+ — shifted cheaper for fast decks (Aggro/Swarm) and heavier for payoff decks
//  (Ramp/Control), but always with enough early plays to not stall out. Copy counts are
//  varied (1–4) to weight consistency toward the cards that define each plan, and each
//  deck splashes off-element cards (every leader can pay a single off-element pip).
// ============================================================
import { parseDeck } from '@cards/schema';

// DoT plan: stack Burn/Poison on everything and let tick damage do the killing.
// Flame Guard (Taunt) sits in front so on-hit units (Ember Tick, Plague Rat, Revolving Sun)
// can swing freely without dying — Midrange bodies are forced to attack the Taunt wall and
// get burnt/poisoned in retaliation. Wildfire Spread + Creeping Blight mass-apply DoT as a
// finisher when the board is already ticking. Cinder Golem (Tough + on-hit Burn) is the
// durable mid-game core. Molten Floor punishes any unit that enters the lane. Inferno Ox is
// the late vanilla threat.
// DoT leans on BOTH damage-over-time elements: Burn (fire) AND Poison (nature/earth), enabled by
// Kedou's fire:3/nature:3 caps + an earth:1 splash. The linchpin is Galatian Spirit (Taunt +
// on-hit Poison): it forces the opponent to attack into it and poisons them for the trouble —
// the wall DoT lost when Flame Guard was cut. Behind it, on-hit tickers (Ember Tick) survive;
// Revolving Sun (Sniper) ticks Burn from range without needing the wall. Wildfire Spread +
// Creeping Blight are the AoE finishers; pumpkindle/ashen-bomber death-ticks and molten-floor
// punish the board. Plague Rat trimmed (weak without a wall — Galatian is the poison delivery now).
export const deckDoT = parseDeck({ name: 'DoT', leaderId: 'kedou', cards: [
  { cardId: 'ash-cloud', count: 3 }, { cardId: 'firebolt', count: 3 }, { cardId: 'pyroclasm', count: 2 },
  { cardId: 'ember-tick', count: 3 }, { cardId: 'coal-runner', count: 1 }, { cardId: 'ashen-bomber', count: 2 }, { cardId: 'pumpkindle', count: 2 }, { cardId: 'wildfire-spread', count: 2 },
  { cardId: 'plague-rat', count: 2 }, { cardId: 'creeping-blight', count: 2 }, { cardId: 'galatian-spirit', count: 2 },
  { cardId: 'cinder-witch', count: 2 }, { cardId: 'revolving-sun', count: 2 },
  { cardId: 'whistle-blower', count: 2 },
] });

// Aggro uses Orsyric's even 2/2/2/2 caps to splash beyond fire: Water supplies the cheap glass
// cannons (Coral Spear 3/1, Reef Raptor 3/2) and Nature a sticky 2/3 (Briar Colt) to carry War
// Cry / Adrenaline Rush buffs. Fire stays the backbone (reach + burn) but the over-saturated
// 1-drops (coal-runner, blaze-hound) were trimmed. Earth has no aggressive bodies, so it's the
// one cap left unused — by design, not oversight.
export const deckAggro = parseDeck({ name: 'Aggro', leaderId: 'orsyric', cards: [
  { cardId: 'flicker-moth', count: 3 }, { cardId: 'magma-brute', count: 2 }, { cardId: 'firebolt', count: 2 }, { cardId: 'chain-spark', count: 3 }, { cardId: 'coal-runner', count: 3 },
  { cardId: 'swift-falcon', count: 3 }, { cardId: 'comet-rider', count: 2 }, { cardId: 'pyre-fiend', count: 2 }, { cardId: 'coral-spear', count: 1 }, { cardId: 'reef-raptor', count: 2 }, { cardId: 'briar-colt', count: 1 },
  { cardId: 'razor-charger', count: 2 }, { cardId: 'adrenaline-rush', count: 2 }, { cardId: 'split-arrow', count: 1 }, { cardId: 'twin-blade', count: 1 },
] });

// Midrange is the deliberate VANILLA BASELINE: an efficient stat-stick curve with minimal
// abilities. Its weakness is exactly that lack of abilities — ability decks that play well
// should exploit it. War Beast (the snowball engine) is gone (now nature-pip-locked out of
// Aleph's 2/2/2/2 caps), and the universal glue (Mend/Wind Redirect/Wilt) is trimmed to one
// flex slot, so Midrange can no longer answer everything.
export const deckMidrange = parseDeck({ name: 'Midrange', leaderId: 'aleph', cards: [
  { cardId: 'field-mouse', count: 3 }, { cardId: 'frost-imp', count: 2 }, { cardId: 'ember-pup', count: 2 }, { cardId: 'mend', count: 1 }, { cardId: 'briar-colt', count: 3 },
  { cardId: 'gravel-hound', count: 3 }, { cardId: 'reef-darter', count: 2 }, { cardId: 'spore-bat', count: 2 }, { cardId: 'wind-redirect', count: 1 }, { cardId: 'current-rider', count: 2 },
  { cardId: 'mud-crab', count: 2 }, { cardId: 'chemister', count: 1 }, { cardId: 'craftbee', count: 1 }, { cardId: 'granite-ox', count: 2 }, { cardId: 'lumber-jacko', count: 1 }, { cardId: 'briar-colt', count: 1 }, { cardId: 'reef-darter', count: 1 },
] });

// Control plan: wall behind Frost Wall + River Turtle (Double Team), stall with Cold Spell /
// Hypnotic Patterns / Phantom's Subdue, then dominate with Sleep Walker + Target (Taunt) — once
// Sleep Walker has Taunt, every Midrange attacker is forced to hit it and goes to Sleep.
// Current Rider, Tide Serpent, Dream Eater, and Coral Spear apply pressure once the board
// is locked. Frost King (freeze all on play) is the panic-button board wipe. Abyss Warden
// closes out once the opponent's board is exhausted.
export const deckControl = parseDeck({ name: 'Control', leaderId: 'phantom', cards: [
  { cardId: 'river-minnow', count: 1 }, { cardId: 'target-spell', count: 2 },
  { cardId: 'cold-spell', count: 3 }, { cardId: 'hypnotic-patterns', count: 1 }, { cardId: 'peel-back', count: 2 },
  { cardId: 'river-turtle', count: 2 }, { cardId: 'current-rider', count: 2 }, { cardId: 'tide-serpent', count: 2 }, { cardId: 'sleep-walker', count: 2 },
  { cardId: 'frost-wall', count: 2 }, { cardId: 'dream-eater', count: 2 }, { cardId: 'crag-hawk', count: 2 },
  { cardId: 'lull', count: 1 }, { cardId: 'frost-king', count: 2 }, { cardId: 'abyss-warden', count: 1 },
  { cardId: 'glacial-ray', count: 3 },
] });

// Combo plan: assemble Lethal carriers to cut through anything. Whetstone Altar (grants
// Lethal) bonded under Crag Hawk (airborne reach) or Stone Golem (durable body) = instakill
// anything it touches. Venom Sniper (Lethal+Sniper built-in) picks off key threats from
// heights. Deathspike Lancer (Lethal+Undershot) reaches back-row targets through walls.
// Boulder Titan (printed Lethal+Tough) is the standalone midrange closer. Target Spell gives
// Barbed Sentinel (Spike 2) Taunt so the opponent bleeds on every forced attack. Screyera's
// Scry draws into whichever combo half is missing. Real bodies on curve (Gravel Hound,
// Granite Ox, Mountain Bull) mean the deck has pressure even without the combo assembled.
// Combo plan: Screyera's Scry hero draws into nature3 war-beasts and earth2 boulder-titans
// that Midrange/Attrition can't run (Aleph earth2/nature2, Eksana nature2). Whetstone Altar
// grants Lethal to bonded units; Crag Hawk (airborne) + lethal = instakill air threats.
// Goreivyne (nature2) snowballs kills into a giant body. The deck wins with card quality over
// quantity — Screyera draws ahead with Scry and closes with threats the opponent's stat sticks
// can't efficiently trade into.
export const deckCombo = parseDeck({ name: 'Combo', leaderId: 'screyera', cards: [
  // Tempo-combo: pre-place a grant-foundation, then bond a high-attack body that deploys ready
  // to swing (Battle Ready on bond) for an immediate Overshot / Double Strike / Growth threat.
  // Concentrated into 3 grant lines (8 copies) so a working combo reliably shows up, rather than
  // a pile of singletons that never align. Scry digs for the matching piece + body.
  // Bodies (22) — front-loaded curve with real-attack beaters to power the clock.
  { cardId: 'pebble-pup', count: 3 }, { cardId: 'mud-crab', count: 3 },
  { cardId: 'gravel-hound', count: 3 }, { cardId: 'briar-colt', count: 2 }, { cardId: 'war-beast', count: 2 },
  { cardId: 'oak-sentry', count: 3 }, { cardId: 'ridge-walker', count: 3 }, { cardId: 'mountain-bull', count: 3 },
  // Grant-foundations (8) — three clean lines: launch-ramp (Overshot, face clock),
  // twin-fang-mount (Double Strike, burst), fertile-mound (Growth, snowball).
  { cardId: 'launch-ramp', count: 3 }, { cardId: 'twin-fang-mount', count: 3 }, { cardId: 'fertile-mound', count: 2 },
] });

// Guardian plan: survive early (Ring Leader starts at 0 attack — purely a sponge), stack attack via
// the Modification skill each turn, then ride Bloodlust + Undershot after the Signature fires at ≤15 HP.
// Protection (shield, heal, True Shield) and freeze/sleep control buy the turns needed; Lull is the
// panic-button "survive to Signature" finisher.
export const deckTempo = parseDeck({ name: 'Guardian', leaderId: 'ringleader', cards: [
  { cardId: 'mend', count: 2 }, { cardId: 'field-mouse', count: 2 },
  { cardId: 'iron-ward', count: 3 }, { cardId: 'cold-spell', count: 2 }, { cardId: 'peel-back', count: 2 },
  { cardId: 'wind-redirect', count: 2 },
  { cardId: 'frost-wall', count: 2 }, { cardId: 'river-turtle', count: 2 },
  { cardId: 'mush-room', count: 3 }, { cardId: 'lullaby-spirit', count: 2 }, { cardId: 'crag-hawk', count: 3 }, { cardId: 'fog-creature', count: 2 },
  { cardId: 'hypnotic-patterns', count: 1 },
  { cardId: 'ward-stone', count: 2 },
] });

// Ramp plan: tier the nature-pip curve — 1N producers lay the groundwork, 2N support holds
// the board, 3N War Beasts / Grove Elders apply mid-game pressure, 4N cap-locked payoffs
// (Verdant Cataclysm / Apex Predator / Worldheart Wyrm) close the game. Mana Geyser (×3)
// compounds the ramp; Bulwark Toad walls the early game. Ward Spirit (2N, Tough 1, heals the
// leader 1/turn) buys life while ramping. A unit bonding onto a pre-placed Mana Geyser deploys
// ready to fight (free Battle Ready) — layer a War Beast on a Geyser dropped last turn
// for an immediate Growth+Bloodlust threat.
export const deckRamp = parseDeck({ name: 'Ramp', leaderId: 'corpselock', cards: [
  // 1N — early producers and bodies
  { cardId: 'mend', count: 1 }, { cardId: 'briar-colt', count: 2 },
  { cardId: 'sun-priest', count: 3 }, { cardId: 'surge-sprite', count: 2 },
  // No-pip walls & ramp foundations
  { cardId: 'mana-geyser', count: 3 }, { cardId: 'bulwark-toad', count: 2 },
  // 2N — mid-game support and producers
  { cardId: 'ward-spirit', count: 2 }, { cardId: 'root-elder', count: 2 }, { cardId: 'oak-sentry', count: 2 },
  // 3N — threats
  { cardId: 'war-beast', count: 3 }, { cardId: 'grove-elder', count: 2 },
  // 4N — cap-locked payoffs
  { cardId: 'verdant-cataclysm', count: 3 }, { cardId: 'apex-predator', count: 2 }, { cardId: 'worldheart-wyrm', count: 1 },
] });

// Deck Out plan: never let the opponent attack freely while John Pork's Sweet Liquor hero power and
// Cursed Gift fill their deck with Dead Weights and burn through their cards. Cold Spell /
// Hypnotic Patterns / Peel Back neutralise individual threats; Sleep Walker and Fog Creature
// put attackers to Sleep on-hit; Lullaby Spirit (Double Team + on-hit Sleep) and Frost Wall
// (Double Team) wall every lane. Tundra + Lullaby Grove environments freeze or sleep every
// new unit that enters. Mind Leech is the double-threat: on-hit Sleep buys turns, and on-
// death it plants another Dead Weight in the opponent's hand. The win is pure attrition:
// once the opponent's deck runs out, Null cards deal damage to their own leader on death.
export const deckDeckOut = parseDeck({ name: 'Deck Out', leaderId: 'johnpork', cards: [
  { cardId: 'cursed-gift', count: 3 }, { cardId: 'river-minnow', count: 2 },
  { cardId: 'cold-spell', count: 3 }, { cardId: 'hypnotic-patterns', count: 2 }, { cardId: 'peel-back', count: 2 }, { cardId: 'whistle-blower', count: 2 }, { cardId: 'displacement-wave', count: 2 },
  { cardId: 'river-turtle', count: 2 }, { cardId: 'fog-creature', count: 1 },
  { cardId: 'sleep-walker', count: 2 }, { cardId: 'lull', count: 2 },
  { cardId: 'frost-wall', count: 1 }, { cardId: 'mind-leech', count: 3 }, { cardId: 'lullaby-spirit', count: 1 },
  { cardId: 'tundra', count: 1 }, { cardId: 'lullaby-grove', count: 1 },
] });

// Stall plan: wall every lane and let Cleath's Fortify (+2 HP/turn) make the walls
// unkillable; sustain with Salt Golem / Aegis Ancient leader-heals; then close with the
// raw endgame bodies — Mountain Bull and especially Colossal Worm, which becomes
// near-impossible to remove once it starts killing (Bloodlust: shield + burrow).
export const deckStall = parseDeck({ name: 'Stall', leaderId: 'cleath', cards: [
  { cardId: 'target-spell', count: 2 }, { cardId: 'mend', count: 2 }, { cardId: 'trench-turtle', count: 3 }, { cardId: 'spike-wall', count: 3 }, { cardId: 'frost-wall', count: 2 },
  { cardId: 'bulwark-toad', count: 2 }, { cardId: 'iron-mantis', count: 2 }, { cardId: 'stone-footing', count: 2 }, { cardId: 'salt-golem', count: 1 }, { cardId: 'guardian-crab', count: 1 },
  { cardId: 'aegis-ancient', count: 1 }, { cardId: 'granite-ox', count: 1 }, { cardId: 'mountain-bull', count: 1 }, { cardId: 'colossal-worm', count: 1 }, { cardId: 'pebble-snake', count: 2 },
  { cardId: 'mandrake', count: 1 }, { cardId: 'ridge-walker', count: 3 },
] });

// Swarm plan: flood every lane faster than the opponent can clear, then win with anthem
// buffs. Autopus's Fallback Code + Hive Spawn (leaves a Mechanical Failure on death) + Brood Mother (summons 2
// Critters) provide constant refill. Hivemind Surge (+1/+1 all allies) pumps the whole board
// before a killing blow. Brood Warlord is the carry: every end of turn all other allies gain
// +1/0, compounding fast with a wide board. War Beast (nature:3, Autopus's cap) and Goreivyne
// grow off kills, turning the swarm's kill pressure into self-buffing threats. Spore Bat and
// Swift Falcon give evasive reach in heights. Rally Banner and Pocket Dimension are the late
// finishers: Bloodlust on the warlord + double board slots = lethal from nowhere.
export const deckSwarm = parseDeck({ name: 'Swarm', leaderId: 'autopus', cards: [
  { cardId: 'field-mouse', count: 3 },
  { cardId: 'spore-bat', count: 3 }, { cardId: 'hive-spawn', count: 3 }, { cardId: 'swift-falcon', count: 2 }, { cardId: 'hivemind-surge', count: 2 },
  { cardId: 'goreivyne', count: 2 }, { cardId: 'war-beast', count: 1 }, { cardId: 'rally-banner', count: 2 }, { cardId: 'pyre-fiend', count: 2 }, { cardId: 'briar-colt', count: 1 },
  { cardId: 'brood-mother', count: 3 },
  { cardId: 'brood-warlord', count: 2 }, { cardId: 'pocket-dimension', count: 1 }, { cardId: 'firebolt', count: 2 }, { cardId: 'mush-room', count: 1 },
] });

// Attrition plan: wall the board with Spike/Taunt bodies the enemy must attack into,
// punish every swing (Spike retaliation, Kamikaze blasts, Polish growth) while Eksana's
// Wither and Wilt grind attackers down. Poison/on-hit is a supplement, not the main plan.
// Granite Ox is the closer once the enemy board has bled itself out.
export const deckAttrition = parseDeck({ name: 'Attrition', leaderId: 'eksana', cards: [
  { cardId: 'mud-crab', count: 3 }, { cardId: 'ashen-bomber', count: 2 }, { cardId: 'gravel-hound', count: 2 }, { cardId: 'plague-rat', count: 2 }, { cardId: 'thorn-beast', count: 2 },
  { cardId: 'whistle-blower', count: 2 }, { cardId: 'spiked-base', count: 2 }, { cardId: 'spike-wall', count: 2 }, { cardId: 'mandrake', count: 2 }, { cardId: 'thornfield', count: 1 },
  { cardId: 'thornmail-beetle', count: 2 }, { cardId: 'pebble-snake', count: 2 }, { cardId: 'barbed-sentinel', count: 2 }, { cardId: 'galatian-spirit', count: 1 }, { cardId: 'creeping-blight', count: 1 },
  { cardId: 'shinero', count: 1 }, { cardId: 'reactive-plating', count: 1 },
] });

export const deckSnowball = parseDeck({ name: 'Snowball', leaderId: 'noctua', cards: [
  { cardId: 'mend', count: 3 }, { cardId: 'field-mouse', count: 3 }, { cardId: 'iron-seed', count: 3 }, { cardId: 'strings-of-heaven', count: 2 }, { cardId: 'bloom-elk', count: 3 },
  { cardId: 'war-beast', count: 3 }, { cardId: 'surge-sprite', count: 2 }, { cardId: 'goreivyne', count: 2 }, { cardId: 'mush-room', count: 2 }, { cardId: 'fertile-mound', count: 2 },
  { cardId: 'rally-banner', count: 2 }, { cardId: 'catpire', count: 1 }, { cardId: 'lumber-jacko', count: 1 }, { cardId: 'bowling-boulder', count: 1 },
] });

// Lane Control plan: dictate WHERE the enemy's units stand. Naife's Misdirect plus Wind Redirect,
// Fearie, Seaweed Octopus, Herd Driver and Tidal Wave shove attackers into dead ground — the
// Water lane (non-aquatic units Drown to 0 attack) or a hazard Environment: Tundra freezes
// anything that enters, Molten Floor burns it. Displacement Wave bounces a built-up threat back
// to hand for a full tempo reset. Meanwhile our own evasive bodies — aquatic, airborne, snipers —
// attack freely across the hazards we set. The Pathmaker signature (free environments + an
// Immune/Undershot finisher + a conjured Tundra) seals a lane for good.
// Consolidated from a pile of 8 singletons into a tight two-package list: a DISRUPTION core
// (Wind Redirect / Fearie / Tidal Wave / Displacement Wave shove attackers into dead ground;
// Cold Spell + Tundra freeze; Seaweed Octopus drags enemies into the Water lane to Drown) and
// an EVASIVE CLOCK that actually wins while the enemy is displaced — snipers (Coral Spear, Tide
// Stalker, Crag Hawk), aquatic bodies (Reef Raptor), and Overshot (Frost Imp) attack freely
// across the hazards we set. The old chaff singletons (herd-driver, molten-floor, air-currents,
// watchtowers, river-minnow) are cut for consistency; the clock is doubled up.
export const deckLaneControl = parseDeck({ name: 'Lane Control', leaderId: 'naife', cards: [
  { cardId: 'wind-redirect', count: 3 }, { cardId: 'fearie', count: 2 }, { cardId: 'tidal-wave', count: 2 }, { cardId: 'displacement-wave', count: 2 }, { cardId: 'cold-spell', count: 2 },
  { cardId: 'tundra', count: 2 }, { cardId: 'strings-of-heaven', count: 2 }, { cardId: 'seaweed-octopus', count: 2 }, { cardId: 'sleep-walker', count: 2 },
  { cardId: 'frost-imp', count: 2 }, { cardId: 'coral-spear', count: 2 }, { cardId: 'reef-raptor', count: 3 }, { cardId: 'tide-stalker', count: 2 }, { cardId: 'crag-hawk', count: 2 },
] });

export const starterDecks = [
  deckDoT, deckAggro, deckMidrange, deckControl, deckCombo, deckTempo, deckRamp,
  deckDeckOut, deckStall, deckSwarm, deckAttrition, deckSnowball, deckLaneControl,
];
