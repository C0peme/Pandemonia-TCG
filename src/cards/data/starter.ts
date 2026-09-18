/**
 * Starter card pool and leaders for hotseat testing / engine development.
 * Archetypes and pre-built decks have been intentionally omitted — they will
 * be designed and added by a dedicated card-creation pass.
 */
import { buildRegistry, type Registry } from '@cards/registry';
import { parseCard, parseLeader, type Card, type Leader } from '@cards/schema';
import { NULL_CARD_ID } from '@cards/special';

// prettier-ignore
const rawCards = [
<<<<<<< Updated upstream
  { id: 'ember-pup', name: 'Ember Pup', element: 'fire', tags: [], wip: false, type: 'unit', cost: { energy: 1, elements: [] }, attack: 1, hp: 2, keywords: {} },
  { id: 'magma-brute', name: 'Magma Brute', element: 'fire', text: 'Brittle: attacks once then destroys itself.', tags: [], wip: false, type: 'unit', cost: { energy: 2, elements: [{ type: 'fire', amount: 1 }] }, attack: 3, hp: 2, keywords: { brittle: true } },
  { id: 'pyre-fiend', name: 'Pyre Fiend', element: 'fire', text: 'May sacrifice up to 1 ally on play to gain +2/+2.', tags: [], wip: false, type: 'unit', cost: { energy: 3, elements: [{ type: 'fire', amount: 1 }] }, attack: 3, hp: 2, keywords: { sacrifice: { max: 1, buff: { attack: 2, hp: 2 } } } },
  { id: 'pumpkindle', name: 'Pumpkindle', element: 'fire', text: 'On death: inflict Burn 2 on enemies in its lane.', tags: [], wip: false, type: 'unit', cost: { energy: 2, elements: [{ type: 'fire', amount: 2 }] }, attack: 2, hp: 2, keywords: { kamikaze: { kind: 'applyStatus', amount: 2, target: 'enemy', status: 'burn' } } },
  { id: 'revolving-sun', name: 'Revolving Sun', element: 'fire', text: 'Sniper. On hit: inflict Burn 1.', tags: [], wip: false, type: 'unit', cost: { energy: 3, elements: [{ type: 'fire', amount: 1 }] }, attack: 2, hp: 1, keywords: { sniper: true }, onHit: { burn: 1 } },
  { id: 'thorn-beast', name: 'Thorn Beast', element: 'nature', tags: [], wip: false, type: 'unit', cost: { energy: 4, elements: [{ type: 'nature', amount: 1 }] }, attack: 2, hp: 3, keywords: { spike: 1 } },
  { id: 'bloom-elk', name: 'Bloom Elk', element: 'nature', tags: [], wip: false, type: 'unit', cost: { energy: 3, elements: [{ type: 'nature', amount: 1 }] }, attack: 1, hp: 3, keywords: { growth: { attack: 1, hp: 0 } } },
  { id: 'spore-bat', name: 'Spore Bat', element: 'nature', tags: [], wip: false, type: 'unit', cost: { energy: 2, elements: [{ type: 'nature', amount: 1 }] }, attack: 2, hp: 1, keywords: { airborne: true } },
  { id: 'goreivyne', name: 'Goreivyne', element: 'nature', text: 'Bloodlust: gain +0/+2 per kill.', tags: [], wip: false, type: 'unit', cost: { energy: 3, elements: [{ type: 'nature', amount: 2 }] }, attack: 3, hp: 1, keywords: { bloodlust: { buff: { attack: 0, hp: 2 } } } },
  { id: 'fearie', name: 'Fearie', element: 'nature', text: 'Airborne. Can move an enemy unit to this lane.', tags: [], wip: false, type: 'unit', cost: { energy: 2, elements: [{ type: 'nature', amount: 1 }] }, attack: 2, hp: 1, keywords: { airborne: true }, onPlay: [{ kind: 'move', target: 'enemy' }], onAttack: [], endOfTurn: [], startOfTurn: [] },
  { id: 'catpire', name: 'Catpire', element: 'nature', text: 'Sacrifice 1: gains the sacrificed unit\'s stats (approx +2/+2). Bloodlust: +0/+2.', tags: [], wip: false, type: 'unit', cost: { energy: 3, elements: [{ type: 'nature', amount: 1 }] }, attack: 2, hp: 1, keywords: { sacrifice: { max: 1, buff: { attack: 2, hp: 2 } }, bloodlust: { buff: { attack: 0, hp: 2 } } } },
  { id: 'craftbee', name: 'Craftbee', element: 'nature', text: 'Airborne. Branch Shot.', tags: [], wip: false, type: 'unit', cost: { energy: 4, elements: [{ type: 'nature', amount: 1 }] }, attack: 3, hp: 1, keywords: { branchShot: true, airborne: true } },
  { id: 'chemister', name: 'Chemister', element: 'nature', text: 'Sniper. On hit: inflict Poison.', tags: [], wip: false, type: 'unit', cost: { energy: 3, elements: [{ type: 'nature', amount: 1 }] }, attack: 1, hp: 2, keywords: { sniper: true }, onHit: { poison: true } },
  { id: 'lumber-jacko', name: 'Lumber Jacko', element: 'nature', text: 'Bloodlust: +1/0 per kill.', tags: [], wip: false, type: 'unit', cost: { energy: 4, elements: [{ type: 'nature', amount: 1 }] }, attack: 3, hp: 3, keywords: { bloodlust: { buff: { attack: 1, hp: 0 } } } },
  { id: 'tide-serpent', name: 'Tide Serpent', element: 'water', tags: [], wip: false, type: 'unit', cost: { energy: 3, elements: [{ type: 'water', amount: 1 }] }, attack: 3, hp: 3, keywords: { aquatic: [{ kind: 'buff', target: 'self', stat: { attack: 2 } }] } },
  { id: 'frost-imp', name: 'Frost Imp', element: 'water', text: 'Overshot.', tags: [], wip: false, type: 'unit', cost: { energy: 2, elements: [{ type: 'water', amount: 1 }] }, attack: 2, hp: 1, keywords: { overshot: true } },
  { id: 'river-turtle', name: 'River Turtle', element: 'water', tags: [], wip: false, type: 'unit', cost: { energy: 3, elements: [{ type: 'water', amount: 1 }] }, attack: 0, hp: 1, keywords: { shield: 1, doubleTeam: true } },
  { id: 'coral-spear', name: 'Coral Spear', element: 'water', tags: [], wip: false, type: 'unit', cost: { energy: 2, elements: [{ type: 'water', amount: 1 }] }, attack: 3, hp: 1, keywords: { sniper: true } },
  { id: 'fog-creature', name: 'Fog Creature', element: 'water', text: 'Aquatic. On hit: inflict Sleep.', tags: [], wip: false, type: 'unit', cost: { energy: 3, elements: [{ type: 'water', amount: 1 }] }, attack: 2, hp: 1, keywords: { aquatic: true }, onHit: { sleep: 0 } },
  { id: 'frost-king', name: 'Frost King', element: 'water', text: 'On play: freeze all enemies.', tags: [], wip: false, type: 'unit', cost: { energy: 5, elements: [{ type: 'water', amount: 3 }] }, attack: 2, hp: 2, keywords: {}, onPlay: [{ kind: 'applyStatus', target: 'all-enemy', status: 'freeze' }] },
  { id: 'seaweed-octopus', name: 'Seaweed Octopus', element: 'water', text: 'Aquatic. In water: can move an enemy unit to this lane.', tags: [], wip: false, type: 'unit', cost: { energy: 1, elements: [{ type: 'water', amount: 2 }] }, attack: 2, hp: 1, keywords: { aquatic: true }, onPlay: [{ kind: 'move', target: 'enemy' }], onAttack: [], endOfTurn: [], startOfTurn: [] },
  { id: 'mud-crab', name: 'Mud Crab', element: 'earth', text: 'Spike 1.', tags: [], wip: false, type: 'unit', cost: { energy: 2, elements: [{ type: 'earth', amount: 1 }] }, attack: 2, hp: 2, keywords: { spike: 1 } },
  { id: 'bowling-boulder', name: 'Bowling Boulder', element: 'earth', text: 'Growth: +1/0 each turn. Polish: +0/+2 when hit.', tags: [], wip: false, type: 'unit', cost: { energy: 5, elements: [{ type: 'earth', amount: 1 }] }, attack: 1, hp: 3, keywords: { polish: { stat: { attack: 0, hp: 2 } }, growth: { attack: 1, hp: 0 } } },
  { id: 'salt-golem', name: 'Salt Golem', element: 'earth', text: 'Polish: when hit, heals your leader +1.', tags: [], wip: false, type: 'unit', cost: { energy: 5, elements: [{ type: 'earth', amount: 1 }] }, attack: 2, hp: 5, keywords: {}, onPlay: [], onAttack: [], endOfTurn: [{ kind: 'heal', amount: 1, target: 'leader' }], startOfTurn: [] },
  { id: 'mandrake', name: 'Mandrake', element: 'earth', text: 'Polish: when hit, debuffs all enemies −1/0.', tags: [], wip: false, type: 'unit', cost: { energy: 4, elements: [{ type: 'earth', amount: 1 }] }, attack: 1, hp: 4, keywords: { polish: { effects: [{ kind: 'debuff', target: 'enemy', stat: { attack: 1 } }] } } },
  { id: 'pebble-snake', name: 'Pebble Snake', element: 'earth', text: 'Tough 1. Polish: gains +1/0 when hit.', tags: [], wip: false, type: 'unit', cost: { energy: 5, elements: [{ type: 'earth', amount: 2 }] }, attack: 2, hp: 4, keywords: { tough: 1, polish: { stat: { attack: 1, hp: 0 } } } },
  { id: 'galatian-spirit', name: 'Galatian Spirit', element: 'earth', text: 'Taunt. On hit: inflict Poison.', tags: [], wip: false, type: 'unit', cost: { energy: 5, elements: [{ type: 'earth', amount: 1 }] }, attack: 2, hp: 4, keywords: { taunt: true }, onHit: { poison: true } },
  { id: 'shinero', name: 'Spinero', element: 'nature', tags: [], wip: false, type: 'unit', cost: { energy: 6, elements: [{ type: 'earth', amount: 2 }] }, attack: 0, hp: 4, keywords: { taunt: true, spike: 3, tough: 1 } },
  { id: 'sig-living-mountain', name: 'Living Mountain', element: 'earth', text: 'Signature: a massive free defender.', tags: ['signature'], wip: false, type: 'unit', cost: { energy: 0 }, attack: 2, hp: 3, keywords: { taunt: true, tough: 2 } }, // Cleath: no rename needed
  { id: 'firebolt', name: 'Firebolt', element: 'fire', tags: [], wip: false, type: 'spell', cost: { energy: 1, elements: [{ type: 'fire', amount: 1 }] }, effects: [{ kind: 'damage', amount: 2, target: 'enemy' }] },
  { id: 'pyroclasm', name: 'Pyroclasm', element: 'fire', text: 'Deal 3 damage directly to the enemy leader, ignoring all units.', tags: [], wip: false, type: 'spell', cost: { energy: 2, elements: [{ type: 'fire', amount: 2 }] }, effects: [{ kind: 'damage', amount: 3, target: 'leader' }] },
  { id: 'mend', name: 'Mend', element: 'nature', tags: [], wip: false, type: 'spell', cost: { energy: 1, elements: [{ type: 'nature', amount: 1 }] }, effects: [{ kind: 'heal', amount: 3, target: 'ally' }] },
  { id: 'strings-of-heaven', name: 'Strings of Heaven', element: 'nature', text: 'Move an ally unit to another lane and give it +1/+1.', tags: [], wip: false, type: 'spell', cost: { energy: 1, elements: [{ type: 'nature', amount: 1 }] }, effects: [{ kind: 'move', target: 'ally' }, { kind: 'buff', target: 'ally', stat: { attack: 1, hp: 1 } }] },
  { id: 'whistle-blower', name: 'Wilt', element: 'nature', text: 'Reduce an enemy unit by -2/-2.', tags: [], wip: false, type: 'spell', cost: { energy: 2, elements: [{ type: 'nature', amount: 1 }] }, effects: [{ kind: 'debuff', target: 'enemy', stat: { attack: 2, hp: 2 } }] },
  { id: 'mush-room', name: 'Mush Room', element: 'nature', tags: [], wip: false, type: 'spell', cost: { energy: 2, elements: [{ type: 'nature', amount: 1 }] }, effects: [{ kind: 'applyStatus', target: 'ally', status: 'trueShield' }] },
  { id: 'cold-spell', name: 'Cold Spell', element: 'water', text: 'Freeze any unit.', tags: [], wip: false, type: 'spell', cost: { energy: 2, elements: [{ type: 'water', amount: 1 }] }, effects: [{ kind: 'applyStatus', target: 'any', status: 'freeze' }] },
  { id: 'hypnotic-patterns', name: 'Hypnotic Patterns', element: 'water', text: 'Put any unit to Sleep.', tags: [], wip: false, type: 'spell', cost: { energy: 2, elements: [{ type: 'water', amount: 1 }] }, effects: [{ kind: 'applyStatus', amount: 2, target: 'any', status: 'sleep' }] },
  { id: 'tidal-wave', name: 'Tidal Wave', element: 'water', text: 'Deal 2 damage to an enemy in the Water lane and move it to a ground lane.', tags: [], wip: false, type: 'spell', cost: { energy: 2, elements: [{ type: 'water', amount: 1 }] }, effects: [{ kind: 'damage', amount: 2, target: 'enemy' }, { kind: 'move', target: 'enemy' }] },
  { id: 'target-spell', name: 'Target', element: 'earth', text: 'Give Taunt to any unit.', tags: [], wip: false, type: 'spell', cost: { energy: 1, elements: [{ type: 'earth', amount: 1 }] }, effects: [{ kind: 'applyStatus', target: 'any', status: 'taunt' }] },
  { id: 'stone-footing', name: 'Stone Footing', element: 'earth', tags: [], wip: false, type: 'foundation', cost: { energy: 3 }, attack: 1, hp: 3, keywords: {}, grants: { stat: { hp: 1 }, keywords: { tough: 1 } } },
  { id: 'down-under-masks', name: 'Down Under Masks', element: 'fire', tags: [], wip: false, type: 'foundation', cost: { energy: 3, elements: [{ type: 'fire', amount: 1 }] }, attack: 1, hp: 3, keywords: {}, grants: { keywords: { immunity: true, bloodlust: { buff: { attack: 2, hp: 1 } } } } },
  { id: 'freds-boat', name: 'Fred\'s Boat', element: 'water', text: 'Foundation. Grants +1/+2 and Aquatic to the unit on top.', tags: [], wip: false, type: 'foundation', cost: { energy: 2 }, attack: 1, hp: 2, keywords: {}, grants: { stat: { attack: 1, hp: 2 }, keywords: { aquatic: true } } },
  { id: 'vent', name: 'Vent', element: 'fire', text: 'All units in this lane gain Overshot.', tags: [], wip: false, type: 'environment', cost: { energy: 2 }, lanes: [], effects: [{ kind: 'custom', note: 'All units gain Overshot' }], grantKeywords: { overshot: true } },
  { id: 'graveyard', name: 'Graveyard', element: 'earth', text: 'All units gain Zombified.', tags: [], wip: false, type: 'environment', cost: { energy: 6 }, lanes: ['ground'], effects: [{ kind: 'custom', note: 'All units gain Zombified' }], grantKeywords: { zombified: true } },
  { id: 'molten-floor', name: 'Molten Floor', element: 'fire', text: 'Units entering this lane gain Burn 1.', tags: [], wip: false, type: 'environment', cost: { energy: 0, elements: [{ type: 'fire', amount: 1 }] }, lanes: [], effects: [{ kind: 'applyStatus', amount: 1, target: 'any', status: 'burn' }] },
  { id: 'sludge-pool', name: 'Sludge Pool', element: 'nature', text: 'Units entering this lane are Poisoned.', tags: [], wip: false, type: 'environment', cost: { energy: 1 }, lanes: [], effects: [{ kind: 'applyStatus', target: 'any', status: 'poison' }] },
  { id: 'watchtowers', name: 'Watchtowers', element: 'earth', text: 'Heights only. All units gain Sniper.', tags: [], wip: false, type: 'environment', cost: { energy: 2 }, lanes: ['heights'], effects: [{ kind: 'custom', note: 'All units gain Sniper' }], grantKeywords: { sniper: true } },
  { id: 'coffee-fields', name: 'Coffee Fields', element: 'nature', text: 'All units gain Double Strike.', tags: [], wip: false, type: 'environment', cost: { energy: 3 }, lanes: [], effects: [{ kind: 'custom', note: 'All units gain Double Strike' }], grantKeywords: { doubleStrike: true } },
  { id: 'perfect-fortress', name: 'Perfect Fortress', element: 'earth', text: 'All units gain True Shield.', tags: [], wip: false, type: 'environment', cost: { energy: 6 }, lanes: [], effects: [{ kind: 'custom', note: 'All units gain True Shield' }], grantKeywords: { trueShield: true } },
  { id: 'pocket-dimension', name: 'Pocket Dimension', element: 'nature', text: 'All units gain Double Team.', tags: [], wip: false, type: 'environment', cost: { energy: 2 }, lanes: [], effects: [{ kind: 'custom', note: 'All units gain Double Team' }], grantKeywords: { doubleTeam: true } },
  { id: 'warehouse', name: 'Warehouse', element: 'earth', text: 'All units gain Growth: +1/+1.', tags: [], wip: false, type: 'environment', cost: { energy: 5 }, lanes: [], effects: [{ kind: 'custom', note: 'All units gain Growth: +1/+1' }], grantKeywords: { growth: { attack: 1, hp: 1 } } },
  { id: 'air-currents', name: 'Air Currents', element: 'nature', text: 'All units gain Airborne.', tags: [], wip: false, type: 'environment', cost: { energy: 2 }, lanes: [], effects: [{ kind: 'custom', note: 'All units gain Airborne' }], grantKeywords: { airborne: true } },
  { id: 'cinder-witch', name: 'Cinder Witch', element: 'fire', text: 'Producer: 1 Fire/turn. On hit: inflict Burn 1.', tags: [], wip: false, type: 'unit', cost: { energy: 3, elements: [{ type: 'fire', amount: 2 }] }, attack: 1, hp: 3, keywords: {}, onHit: { burn: 1 }, onPlay: [], onAttack: [], endOfTurn: [{ kind: 'energy', amount: 1, element: 'fire' }], startOfTurn: [] },
  { id: 'ash-cloud', name: 'Ash Cloud', element: 'fire', text: 'Inflict Burn 1 on an enemy unit.', tags: [], wip: false, type: 'spell', cost: { energy: 1, elements: [{ type: 'fire', amount: 1 }] }, effects: [{ kind: 'applyStatus', amount: 1, target: 'enemy', status: 'burn' }] },
  { id: 'trench-turtle', name: 'Trench Turtle', element: 'earth', text: 'Tough 1.', tags: [], wip: false, type: 'unit', cost: { energy: 3, elements: [{ type: 'earth', amount: 1 }] }, attack: 2, hp: 2, keywords: { tough: 1 } },
  { id: 'guardian-crab', name: 'Guardian Crab', element: 'earth', text: 'Taunt. Tough 2.', tags: [], wip: false, type: 'unit', cost: { energy: 7, elements: [{ type: 'earth', amount: 2 }] }, attack: 0, hp: 5, keywords: { taunt: true, tough: 2 } },
  { id: 'iron-mantis', name: 'Iron Mantis', element: 'earth', text: 'Shield 2.', tags: [], wip: false, type: 'unit', cost: { energy: 4, elements: [{ type: 'earth', amount: 1 }] }, attack: 1, hp: 3, keywords: { shield: 2 } },
  { id: 'ward-spirit', name: 'Ward Spirit', element: 'nature', text: 'Tough 1. At end of turn: heal your leader 1.', tags: [], wip: false, type: 'unit', cost: { energy: 2, elements: [{ type: 'nature', amount: 2 }] }, attack: 0, hp: 2, keywords: { tough: 1 }, onPlay: [], onAttack: [], endOfTurn: [{ kind: 'heal', amount: 1, target: 'leader' }], startOfTurn: [] },
  { id: 'frost-wall', name: 'Frost Wall', element: 'water', text: 'Double Team.', tags: [], wip: false, type: 'unit', cost: { energy: 4, elements: [{ type: 'water', amount: 2 }] }, attack: 0, hp: 5, keywords: { doubleTeam: true } },
  { id: 'sleep-walker', name: 'Sleep Walker', element: 'water', text: 'On hit: inflict Sleep on the attacker.', tags: [], wip: false, type: 'unit', cost: { energy: 4, elements: [{ type: 'water', amount: 3 }] }, attack: 1, hp: 3, keywords: {}, onHit: { sleep: 0 } },
  { id: 'peel-back', name: 'Peel Back', element: 'water', text: 'Return an enemy unit to its owner\'s hand.', tags: [], wip: false, type: 'spell', cost: { energy: 2, elements: [{ type: 'water', amount: 1 }] }, effects: [{ kind: 'expel', target: 'enemy' }] },
  { id: 'displacement-wave', name: 'Displacement Wave', element: 'water', text: 'Return an enemy unit to its owner\'s hand.', tags: [], wip: false, type: 'spell', cost: { energy: 2, elements: [{ type: 'water', amount: 1 }] }, effects: [{ kind: 'expel', target: 'enemy' }] },
  { id: 'root-elder', name: 'Root Elder', element: 'nature', text: 'Producer: 2 Nature/turn.', tags: [], wip: false, type: 'unit', cost: { energy: 5, elements: [{ type: 'nature', amount: 2 }] }, attack: 2, hp: 5, keywords: {}, onPlay: [], onAttack: [], endOfTurn: [{ kind: 'energy', amount: 2, element: 'nature' }], startOfTurn: [] },
  { id: 'iron-seed', name: 'Iron Seed', element: 'nature', text: 'Place beneath a unit: grants +1/+1 and Growth: +1/0.', tags: [], wip: false, type: 'foundation', cost: { energy: 2 }, attack: 1, hp: 2, keywords: {}, grants: { stat: { attack: 1, hp: 1 }, keywords: { growth: { attack: 1, hp: 0 } } } },
  { id: 'war-beast', name: 'War Beast', element: 'nature', text: 'Growth: +1/+1 per turn. Bloodlust: +1/0 per kill.', tags: [], wip: false, type: 'unit', cost: { energy: 3, elements: [{ type: 'nature', amount: 3 }] }, attack: 2, hp: 2, keywords: { bloodlust: { buff: { attack: 1, hp: 0 } }, growth: { attack: 1, hp: 1 } } },
  { id: 'swift-falcon', name: 'Swift Falcon', element: 'fire', text: 'Airborne. Brittle.', tags: [], wip: false, type: 'unit', cost: { energy: 2, elements: [{ type: 'fire', amount: 1 }] }, attack: 3, hp: 1, keywords: { airborne: true, brittle: true } },
  { id: 'surge-sprite', name: 'Surge Sprite', element: 'nature', text: 'Growth: +1/0 per turn. Producer: 1 Nature/turn.', tags: [], wip: false, type: 'unit', cost: { energy: 3, elements: [{ type: 'nature', amount: 1 }] }, attack: 1, hp: 2, keywords: { growth: { attack: 1, hp: 0 } }, onPlay: [], onAttack: [], endOfTurn: [{ kind: 'energy', amount: 1, element: 'nature' }], startOfTurn: [] },
  { id: 'ridge-walker', name: 'Ridge Walker', element: 'earth', text: 'Tough 1.', tags: [], wip: false, type: 'unit', cost: { energy: 4, elements: [{ type: 'earth', amount: 1 }] }, attack: 2, hp: 3, keywords: { tough: 1 } },
  { id: 'chain-spark', name: 'Chain Spark', element: 'fire', text: 'Deal 2 damage to an enemy. If that unit dies, deal 1 to another, and so on.', tags: [], wip: false, type: 'spell', cost: { energy: 2, elements: [{ type: 'fire', amount: 1 }] }, effects: [{ kind: 'damage', amount: 2, target: 'enemy', chainDiminish: true }] },
  { id: 'spike-wall', name: 'Spike Wall', element: 'earth', text: 'Spike 1. Tough 1.', tags: [], wip: false, type: 'unit', cost: { energy: 3, elements: [{ type: 'earth', amount: 1 }] }, attack: 0, hp: 2, keywords: { spike: 1, tough: 1 } },
  { id: 'wind-redirect', name: 'Wind Redirect', element: 'nature', text: 'Move any unit (ally or enemy) to any valid lane.', tags: [], wip: false, type: 'spell', cost: { energy: 1, elements: [{ type: 'nature', amount: 1 }] }, effects: [{ kind: 'move', target: 'any' }] },
  { id: 'colossal-worm', name: 'Colossal Worm', element: 'earth', text: 'Bloodlust: on kill, gain Shield 1 and burrow to another lane.', tags: [], wip: false, type: 'unit', cost: { energy: 8, elements: [{ type: 'earth', amount: 4 }] }, attack: 4, hp: 5, keywords: { bloodlust: { effects: [{ kind: 'applyStatus', amount: 1, target: 'self', status: 'shield' }, { kind: 'move', target: 'self' }] } } },
  { id: 'adrenaline-rush', name: 'Adrenaline Rush', element: 'fire', text: 'An ally unit takes an immediate bonus attack (no retaliation).', tags: [], wip: false, type: 'spell', cost: { energy: 2, elements: [{ type: 'fire', amount: 1 }] }, effects: [{ kind: 'extraAction', target: 'ally' }] },
  { id: 'critter-token', name: 'Mechanical Failure', element: 'nature', text: 'A summoned mechanical failure. Airborne.', tags: [], wip: false, type: 'unit', cost: { energy: 1 }, attack: 1, hp: 2, keywords: { airborne: true } },
  { id: 'critter-elite', name: 'Techtacle', element: 'nature', text: 'A summoned techtacle. Airborne, Lethal, True Shield.', tags: [], wip: false, type: 'unit', cost: { energy: 6 }, attack: 1, hp: 1, keywords: { lethal: true, airborne: true, trueShield: true } },
  // Adventure boss token (False Hydra / "Ignorance is Bliss"): a mindless cult
  // follower. Airborne so it never drowns regardless of which lane it's placed in —
  // its self-sacrifice-and-mill trigger should fire uniformly on every lane.
  { id: 'cult-follower', name: 'Follower', element: 'water', text: 'A mindless follower of the cult. If it survives to the start of its owner\'s next turn, it sacrifices itself and its owner mills a card.', tags: [], wip: false, type: 'unit', cost: { energy: 0 }, attack: 0, hp: 1, keywords: { doubleTeam: true, airborne: true }, startOfTurn: [{ kind: 'damage', amount: 99, target: 'self' }, { kind: 'forget', amount: 1, target: 'self' }] },
  { id: 'dead-weight', name: 'Dead Weight', element: 'nature', text: 'Junk forced into a hand. Hindering to clear — you must bank one of every element to play it away.', tags: [], wip: false, type: 'unit', cost: { energy: 1, elements: [{ type: 'fire', amount: 1 }, { type: 'water', amount: 1 }, { type: 'nature', amount: 1 }, { type: 'earth', amount: 1 }] }, attack: 0, hp: 4, keywords: {} },
  { id: 'flicker-moth', name: 'Flicker Moth', element: 'fire', tags: [], wip: false, type: 'unit', cost: { energy: 1, elements: [] }, attack: 2, hp: 1, keywords: {} },
  { id: 'coal-runner', name: 'Coal Runner', element: 'fire', tags: [], wip: false, type: 'unit', cost: { energy: 2, elements: [{ type: 'fire', amount: 1 }] }, attack: 3, hp: 2, keywords: {} },
  { id: 'blaze-hound', name: 'Blaze Hound', element: 'fire', tags: [], wip: false, type: 'unit', cost: { energy: 3, elements: [{ type: 'fire', amount: 2 }] }, attack: 4, hp: 2, keywords: {} },
  { id: 'inferno-ox', name: 'Inferno Ox', element: 'fire', tags: [], wip: false, type: 'unit', cost: { energy: 5, elements: [{ type: 'fire', amount: 3 }] }, attack: 5, hp: 4, keywords: {} },
  { id: 'river-minnow', name: 'River Minnow', element: 'water', tags: [], wip: false, type: 'unit', cost: { energy: 1, elements: [] }, attack: 1, hp: 2, keywords: {} },
  { id: 'reef-darter', name: 'Reef Darter', element: 'water', tags: [], wip: false, type: 'unit', cost: { energy: 3, elements: [] }, attack: 2, hp: 3, keywords: {} },
  { id: 'current-rider', name: 'Current Rider', element: 'water', tags: [], wip: false, type: 'unit', cost: { energy: 3, elements: [] }, attack: 3, hp: 3, keywords: {} },
  { id: 'glacial-ray', name: 'Glacial Ray', element: 'water', text: 'Splash: its attack also hits the front unit of each adjacent lane (no retaliation).', tags: [], wip: false, type: 'unit', cost: { energy: 4, elements: [{ type: 'water', amount: 2 }] }, attack: 2, hp: 3, keywords: { splashDamage: true } },
  { id: 'abyss-warden', name: 'Abyss Warden', element: 'water', tags: [], wip: false, type: 'unit', cost: { energy: 5, elements: [{ type: 'water', amount: 4 }] }, attack: 4, hp: 5, keywords: {} },
  { id: 'field-mouse', name: 'Field Mouse', element: 'nature', tags: [], wip: false, type: 'unit', cost: { energy: 1, elements: [] }, attack: 1, hp: 2, keywords: {} },
  { id: 'briar-colt', name: 'Briar Colt', element: 'nature', tags: [], wip: false, type: 'unit', cost: { energy: 3, elements: [] }, attack: 2, hp: 3, keywords: {} },
  { id: 'oak-sentry', name: 'Oak Sentry', element: 'nature', tags: [], wip: false, type: 'unit', cost: { energy: 3, elements: [{ type: 'nature', amount: 3 }] }, attack: 3, hp: 4, keywords: {} },
  { id: 'pebble-pup', name: 'Pebble Pup', element: 'earth', tags: [], wip: false, type: 'unit', cost: { energy: 1, elements: [] }, attack: 1, hp: 2, keywords: {} },
  { id: 'gravel-hound', name: 'Gravel Hound', element: 'earth', tags: [], wip: false, type: 'unit', cost: { energy: 3, elements: [] }, attack: 2, hp: 3, keywords: {} },
  { id: 'granite-ox', name: 'Granite Ox', element: 'earth', tags: [], wip: false, type: 'unit', cost: { energy: 6, elements: [] }, attack: 3, hp: 5, keywords: {} },
  { id: 'mountain-bull', name: 'Mountain Bull', element: 'earth', tags: [], wip: false, type: 'unit', cost: { energy: 6, elements: [{ type: 'earth', amount: 2 }] }, attack: 4, hp: 5, keywords: {} },
  { id: 'razor-charger', name: 'Razor Charger', element: 'fire', text: 'Strike Through.', tags: [], wip: false, type: 'unit', cost: { energy: 3, elements: [{ type: 'fire', amount: 1 }] }, attack: 3, hp: 2, keywords: { strikeThrough: true } },
  { id: 'comet-rider', name: 'Comet Rider', element: 'fire', text: 'Battle Ready.', tags: [], wip: false, type: 'unit', cost: { energy: 2, elements: [{ type: 'fire', amount: 1 }] }, attack: 2, hp: 1, keywords: { battleReady: true } },
  { id: 'twin-blade', name: 'Twin Blade', element: 'fire', text: 'Double Strike.', tags: [], wip: false, type: 'unit', cost: { energy: 3, elements: [{ type: 'fire', amount: 1 }] }, attack: 2, hp: 2, keywords: { doubleStrike: true } },
  { id: 'split-arrow', name: 'Split Arrow', element: 'fire', text: 'Branch Shot.', tags: [], wip: false, type: 'unit', cost: { energy: 3, elements: [{ type: 'fire', amount: 1 }] }, attack: 3, hp: 1, keywords: { branchShot: true } },
  { id: 'ember-tick', name: 'Ember Tick', element: 'fire', text: 'On hit: inflict Burn 1.', tags: [], wip: false, type: 'unit', cost: { energy: 2, elements: [{ type: 'fire', amount: 1 }] }, attack: 1, hp: 2, keywords: {}, onHit: { burn: 1 } },
  { id: 'plague-rat', name: 'Plague Rat', element: 'nature', text: 'On hit: inflict Poison.', tags: [], wip: false, type: 'unit', cost: { energy: 2, elements: [{ type: 'nature', amount: 1 }] }, attack: 1, hp: 2, keywords: {}, onHit: { poison: true } },
  { id: 'ashen-bomber', name: 'Ashen Bomber', element: 'fire', text: 'On death: deal 3 damage to enemies in its lane.', tags: [], wip: false, type: 'unit', cost: { energy: 2, elements: [{ type: 'fire', amount: 1 }] }, attack: 2, hp: 2, keywords: { kamikaze: { kind: 'damage', amount: 3, target: 'enemy' } } },
  { id: 'creeping-blight', name: 'Creeping Blight', element: 'nature', text: 'Inflict Poison on all enemy units.', tags: [], wip: false, type: 'spell', cost: { energy: 2, elements: [{ type: 'nature', amount: 2 }] }, effects: [{ kind: 'applyStatus', target: 'all-enemy', status: 'poison' }] },
  { id: 'wildfire-spread', name: 'Wildfire Spread', element: 'fire', text: 'Inflict Burn 2 on all enemy units.', tags: [], wip: false, type: 'spell', cost: { energy: 3, elements: [{ type: 'fire', amount: 2 }] }, effects: [{ kind: 'applyStatus', amount: 2, target: 'all-enemy', status: 'burn' }] },
  { id: 'dream-eater', name: 'Dream Eater', element: 'water', text: 'Sniper. On hit: inflict Sleep.', tags: [], wip: false, type: 'unit', cost: { energy: 3, elements: [{ type: 'water', amount: 3 }] }, attack: 1, hp: 2, keywords: { sniper: true }, onHit: { sleep: 1 } },
  { id: 'void-caller', name: 'Void Caller', element: 'water', text: 'Deal 2 damage to all enemy units.', tags: [], wip: false, type: 'spell', cost: { energy: 1, elements: [{ type: 'water', amount: 2 }] }, effects: [{ kind: 'damage', amount: 2, target: 'all-enemy' }] },
  { id: 'lull', name: 'Lull', element: 'water', text: 'Put all enemy units to Sleep.', tags: [], wip: false, type: 'spell', cost: { energy: 3, elements: [{ type: 'water', amount: 3 }] }, effects: [{ kind: 'applyStatus', amount: 2, target: 'all-enemy', status: 'sleep' }] },
  { id: 'cursed-gift', name: 'Cursed Gift', element: 'water', text: 'Add a Dead Weight to your opponent\'s hand.', tags: [], wip: false, type: 'spell', cost: { energy: 1, elements: [{ type: 'water', amount: 1 }] }, effects: [{ kind: 'conjure', target: 'enemy', cardId: 'dead-weight' }] },
  { id: 'mind-leech', name: 'Mind Leech', element: 'water', text: 'On hit: inflict Sleep. On death: add a Dead Weight to the enemy hand.', tags: [], wip: false, type: 'unit', cost: { energy: 5, elements: [{ type: 'water', amount: 1 }] }, attack: 1, hp: 3, keywords: { kamikaze: { kind: 'conjure', target: 'enemy', cardId: 'dead-weight' } }, onHit: { sleep: 0 } },
  { id: 'bulwark-toad', name: 'Bulwark Toad', element: 'earth', text: 'Taunt. Shield 1.', tags: [], wip: false, type: 'unit', cost: { energy: 3, elements: [{ type: 'earth', amount: 2 }] }, attack: 0, hp: 3, keywords: { shield: 1, taunt: true } },
  { id: 'barbed-sentinel', name: 'Barbed Sentinel', element: 'earth', text: 'Taunt. Spike 2.', tags: [], wip: false, type: 'unit', cost: { energy: 5, elements: [{ type: 'earth', amount: 1 }] }, attack: 1, hp: 4, keywords: { taunt: true, spike: 2 } },
  { id: 'thornmail-beetle', name: 'Thornmail Beetle', element: 'earth', text: 'Spike 1. On hit: inflict Poison.', tags: [], wip: false, type: 'unit', cost: { energy: 5, elements: [{ type: 'earth', amount: 1 }] }, attack: 1, hp: 4, keywords: { spike: 1 }, onHit: { poison: true } },
  { id: 'aegis-ancient', name: 'Aegis Ancient', element: 'earth', text: 'Taunt. Tough 2. At end of turn: heal your leader 2.', tags: [], wip: false, type: 'unit', cost: { energy: 6, elements: [{ type: 'earth', amount: 3 }] }, attack: 2, hp: 3, keywords: { taunt: true, tough: 2 }, onPlay: [], onAttack: [], endOfTurn: [{ kind: 'heal', amount: 2, target: 'leader' }], startOfTurn: [] },
  { id: 'brood-mother', name: 'Brood Mother', element: 'nature', text: 'On play: summon two Mechanical Failures.', tags: [], wip: false, type: 'unit', cost: { energy: 3, elements: [{ type: 'nature', amount: 3 }] }, attack: 2, hp: 3, keywords: {}, onPlay: [{ kind: 'summon', cardId: 'critter-token' }, { kind: 'summon', cardId: 'critter-token' }] },
  { id: 'hive-spawn', name: 'Hive Spawn', element: 'nature', text: 'On death: summon a Mechanical Failure.', tags: [], wip: false, type: 'unit', cost: { energy: 2, elements: [{ type: 'nature', amount: 1 }] }, attack: 2, hp: 1, keywords: { kamikaze: { kind: 'summon', cardId: 'critter-token' } } },
  { id: 'apex-predator', name: 'Apex Predator', element: 'nature', text: 'Growth: +1/+1 per turn. Bloodlust: +2/0 per kill.', tags: [], wip: false, type: 'unit', cost: { energy: 5, elements: [{ type: 'nature', amount: 4 }] }, attack: 4, hp: 5, keywords: { bloodlust: { buff: { attack: 2, hp: 0 } }, growth: { attack: 1, hp: 1 } } },
  // --- Ramp payoffs: heavy nature pips (cap-locked to nature-4 leaders) with strong mechanics
  //     that Corpselock's banking reaches turns earlier than anyone else. ---
  { id: 'worldheart-wyrm', name: 'Worldheart Wyrm', element: 'nature', text: 'Strike Through. Bloodlust: +1/+1 per kill.', tags: [], wip: false, type: 'unit', cost: { energy: 7, elements: [{ type: 'nature', amount: 4 }] }, attack: 7, hp: 7, keywords: { strikeThrough: true, bloodlust: { buff: { attack: 1, hp: 1 } } } },
  { id: 'grove-elder', name: 'Elder of the Grove', element: 'nature', text: 'Producer: 2 Nature/turn. On play: draw a card.', tags: [], wip: false, type: 'unit', cost: { energy: 5, elements: [{ type: 'nature', amount: 3 }] }, attack: 1, hp: 5, keywords: {}, onPlay: [{ kind: 'draw', amount: 1 }], onAttack: [], endOfTurn: [{ kind: 'energy', amount: 2, element: 'nature' }], startOfTurn: [] },
  { id: 'verdant-cataclysm', name: 'Verdant Cataclysm', element: 'nature', text: 'Deal 3 damage to all enemies and heal all allies 2.', tags: [], wip: false, type: 'spell', cost: { energy: 3, elements: [{ type: 'nature', amount: 4 }] }, effects: [{ kind: 'damage', amount: 3, target: 'all-enemy' }, { kind: 'heal', amount: 2, target: 'all-ally' }] },
  // --- Swarm payoffs: an anthem the wide board rides, and a carry the swarm protects with
  //     bodies (Brood Warlord pumps the team every turn — the swarm keeps it alive). ---
  { id: 'hivemind-surge', name: 'Hivemind Surge', element: 'nature', text: 'Give all allied units +1/+1.', tags: [], wip: false, type: 'spell', cost: { energy: 2, elements: [{ type: 'nature', amount: 2 }] }, effects: [{ kind: 'buff', target: 'all-ally', stat: { attack: 1, hp: 1 } }] },
  { id: 'brood-warlord', name: 'Brood Warlord', element: 'nature', text: 'At end of turn: give all other allied units +1/0.', tags: [], wip: false, type: 'unit', cost: { energy: 5, elements: [{ type: 'nature', amount: 2 }] }, attack: 2, hp: 5, keywords: {}, onPlay: [], onAttack: [], endOfTurn: [{ kind: 'buff', target: 'all-ally', stat: { attack: 1, hp: 0 } }], startOfTurn: [] },
  { id: 'sun-priest', name: 'Sun Priest', element: 'nature', text: 'Producer: 2 Nature/turn.', tags: [], wip: false, type: 'unit', cost: { energy: 3, elements: [{ type: 'nature', amount: 1 }] }, attack: 1, hp: 3, keywords: {}, onPlay: [], onAttack: [], endOfTurn: [{ kind: 'energy', amount: 2, element: 'nature' }], startOfTurn: [] },
  { id: 'reef-raptor', name: 'Reef Raptor', element: 'water', text: 'Aquatic.', tags: [], wip: false, type: 'unit', cost: { energy: 2, elements: [{ type: 'water', amount: 1 }] }, attack: 3, hp: 2, keywords: { aquatic: true } },
  { id: 'tide-stalker', name: 'Tide Stalker', element: 'water', text: 'Sniper. Aquatic: +2/0 in Water.', tags: [], wip: false, type: 'unit', cost: { energy: 2, elements: [{ type: 'water', amount: 2 }] }, attack: 2, hp: 2, keywords: { sniper: true, aquatic: [{ kind: 'buff', target: 'self', stat: { attack: 2 } }] } },
  { id: 'crag-hawk', name: 'Crag Hawk', element: 'earth', text: 'Airborne. Sniper.', tags: [], wip: false, type: 'unit', cost: { energy: 2, elements: [{ type: 'earth', amount: 1 }] }, attack: 2, hp: 2, keywords: { sniper: true, airborne: true } },
  { id: 'herd-driver', name: 'Herd Driver', element: 'nature', text: 'Each turn: move an enemy unit.', tags: [], wip: false, type: 'unit', cost: { energy: 4, elements: [{ type: 'nature', amount: 2 }] }, attack: 2, hp: 4, keywords: {}, onPlay: [], onAttack: [], endOfTurn: [], startOfTurn: [{ kind: 'move', target: 'enemy' }] },
  { id: 'lullaby-spirit', name: 'Lullaby Spirit', element: 'water', text: 'Double Team. On hit: inflict Sleep.', tags: [], wip: false, type: 'unit', cost: { energy: 4, elements: [{ type: 'water', amount: 2 }] }, attack: 1, hp: 3, keywords: { doubleTeam: true }, onHit: { sleep: 1 } },
  { id: 'spiked-base', name: 'Spiked Base', element: 'earth', text: 'Grants +0/+2 and Spike 1.', tags: [], wip: false, type: 'foundation', cost: { energy: 3 }, attack: 1, hp: 3, keywords: {}, grants: { stat: { hp: 2 }, keywords: { spike: 1 } } },
  { id: 'taunt-totem', name: 'Taunt Totem', element: 'earth', text: 'Grants +0/+2 and Taunt.', tags: [], wip: false, type: 'foundation', cost: { energy: 3 }, attack: 1, hp: 3, keywords: {}, grants: { stat: { hp: 2 }, keywords: { taunt: true } } },
  { id: 'ward-stone', name: 'Ward Stone', element: 'water', text: 'Grants Shield 1.', tags: [], wip: false, type: 'foundation', cost: { energy: 3 }, attack: 1, hp: 3, keywords: {}, grants: { keywords: { shield: 1 } } },
  { id: 'lookout-perch', name: 'Lookout Perch', element: 'earth', text: 'Grants Sniper.', tags: [], wip: false, type: 'foundation', cost: { energy: 2 }, attack: 1, hp: 2, keywords: {}, grants: { keywords: { sniper: true } } },
  { id: 'launch-ramp', name: 'Launch Ramp', element: 'fire', text: 'Grants Overshot and +1/0.', tags: [], wip: false, type: 'foundation', cost: { energy: 2 }, attack: 2, hp: 2, keywords: {}, grants: { stat: { attack: 1 }, keywords: { overshot: true } } },
  { id: 'siege-platform', name: 'Siege Platform', element: 'fire', text: 'Grants Strike Through.', tags: [], wip: false, type: 'foundation', cost: { energy: 3 }, attack: 1, hp: 3, keywords: {}, grants: { keywords: { strikeThrough: true } } },
  { id: 'forked-mount', name: 'Forked Mount', element: 'nature', text: 'Grants Branch Shot.', tags: [], wip: false, type: 'foundation', cost: { energy: 3 }, attack: 1, hp: 3, keywords: {}, grants: { keywords: { branchShot: true } } },
  { id: 'undertow-base', name: 'Undertow Base', element: 'water', text: 'Grants Undershot.', tags: [], wip: false, type: 'foundation', cost: { energy: 3 }, attack: 1, hp: 3, keywords: {}, grants: { keywords: { undershot: true } } },
  { id: 'whetstone-altar', name: 'Whetstone Altar', element: 'earth', text: 'Grants Lethal.', tags: [], wip: false, type: 'foundation', cost: { energy: 3 }, attack: 1, hp: 3, keywords: {}, grants: { keywords: { lethal: true } } },
  { id: 'springboard', name: 'Springboard', element: 'fire', text: 'Grants Battle Ready and +1/0.', tags: [], wip: false, type: 'foundation', cost: { energy: 2 }, attack: 1, hp: 2, keywords: {}, grants: { stat: { attack: 1 }, keywords: { battleReady: true } } },
  { id: 'twin-perch', name: 'Twin Perch', element: 'water', text: 'Grants Double Team.', tags: [], wip: false, type: 'foundation', cost: { energy: 3 }, attack: 1, hp: 3, keywords: {}, grants: { keywords: { doubleTeam: true } } },
  { id: 'roost-nest', name: 'Roost Nest', element: 'nature', text: 'Grants Airborne.', tags: [], wip: false, type: 'foundation', cost: { energy: 2 }, attack: 1, hp: 2, keywords: {}, grants: { keywords: { airborne: true } } },
  { id: 'tidal-dock', name: 'Tidal Dock', element: 'water', text: 'Grants Aquatic and +0/+1.', tags: [], wip: false, type: 'foundation', cost: { energy: 2 }, attack: 1, hp: 2, keywords: {}, grants: { stat: { hp: 1 }, keywords: { aquatic: true } } },
  { id: 'reactive-plating', name: 'Reactive Plating', element: 'earth', text: 'Grants Polish: +1/0 when hit.', tags: [], wip: false, type: 'foundation', cost: { energy: 3 }, attack: 1, hp: 3, keywords: {}, grants: { keywords: { polish: { stat: { attack: 1, hp: 0 } } } } },
  { id: 'rally-banner', name: 'Rally Banner', element: 'nature', text: 'Grants Bloodlust: +1/+1 per kill.', tags: [], wip: false, type: 'foundation', cost: { energy: 3 }, attack: 1, hp: 3, keywords: {}, grants: { keywords: { bloodlust: { buff: { attack: 1, hp: 1 } } } } },
  { id: 'fertile-mound', name: 'Fertile Mound', element: 'nature', text: 'Grants Growth: +1/+1 per turn.', tags: [], wip: false, type: 'foundation', cost: { energy: 3 }, attack: 1, hp: 3, keywords: {}, grants: { keywords: { growth: { attack: 1, hp: 1 } } } },
  { id: 'mana-geyser', name: 'Mana Geyser', element: 'nature', text: 'Grants Producer: 1 Nature/turn.', tags: [], wip: false, type: 'foundation', cost: { energy: 3 }, attack: 0, hp: 3, keywords: { producer: { amount: 1, element: 'nature' } }, grants: { endOfTurn: [{ kind: 'energy', amount: 1, element: 'nature' }] } },
  { id: 'phylactery', name: 'Phylactery', element: 'earth', text: 'Grants Zombified.', tags: [], wip: false, type: 'foundation', cost: { energy: 3 }, attack: 1, hp: 3, keywords: {}, grants: { keywords: { zombified: true } } },
  { id: 'venom-gland', name: 'Venom Gland', element: 'nature', text: 'Grants On-hit Poison.', tags: [], wip: false, type: 'foundation', cost: { energy: 3 }, attack: 1, hp: 2, keywords: {}, onHit: { poison: true }, grants: { onHit: { poison: true } } },
  { id: 'ember-anvil', name: 'Ember Anvil', element: 'fire', text: 'Grants On-hit Burn 1.', tags: [], wip: false, type: 'foundation', cost: { energy: 2, elements: [{ type: 'fire', amount: 1 }] }, attack: 1, hp: 2, keywords: {}, onHit: { burn: 1 }, grants: { onHit: { burn: 1 } } },
  { id: 'twin-fang-mount', name: 'Twin Fang Mount', element: 'earth', text: 'Grants Double Strike.', tags: [], wip: false, type: 'foundation', cost: { energy: 2, elements: [{ type: 'earth', amount: 1 }] }, attack: 1, hp: 3, keywords: {}, grants: { keywords: { doubleStrike: true } } },
  { id: 'lifewell-base', name: 'Lifewell Base', element: 'nature', text: 'Grants +0/+2 and Healer: heal an ally 1/turn.', tags: [], wip: false, type: 'foundation', cost: { energy: 3 }, attack: 1, hp: 3, keywords: {}, grants: { stat: { hp: 2 }, endOfTurn: [{ kind: 'heal', amount: 1, target: 'ally' }] } },
  { id: 'crows-nest', name: 'Crow\'s Nest', element: 'fire', text: 'Heights only. All units gain Strike Through.', tags: [], wip: false, type: 'environment', cost: { energy: 3 }, lanes: ['heights'], effects: [{ kind: 'custom', note: 'All units gain Strike Through' }], grantKeywords: { strikeThrough: true } },
  { id: 'thornfield', name: 'Thornfield', element: 'earth', text: 'All units gain Spike 1.', tags: [], wip: false, type: 'environment', cost: { energy: 3 }, lanes: [], effects: [{ kind: 'custom', note: 'All units gain Spike 1' }], grantKeywords: { spike: 1 } },
  { id: 'fortified-line', name: 'Fortified Line', element: 'earth', text: 'Ground only. All units gain Taunt.', tags: [], wip: false, type: 'environment', cost: { energy: 2 }, lanes: ['ground'], effects: [{ kind: 'custom', note: 'All units gain Taunt' }], grantKeywords: { taunt: true } },
  { id: 'bunker', name: 'Bunker', element: 'earth', text: 'All units gain Tough 1.', tags: [], wip: false, type: 'environment', cost: { energy: 4 }, lanes: [], effects: [{ kind: 'custom', note: 'All units gain Tough 1' }], grantKeywords: { tough: 1 } },
  { id: 'aegis-veil', name: 'Aegis Veil', element: 'water', text: 'All units gain Shield 1.', tags: [], wip: false, type: 'environment', cost: { energy: 5 }, lanes: [], effects: [{ kind: 'custom', note: 'All units gain Shield 1' }], grantKeywords: { shield: 1 } },
  { id: 'sanctified-ground', name: 'Sanctified Ground', element: 'earth', text: 'All units gain Immunity.', tags: [], wip: false, type: 'environment', cost: { energy: 4 }, lanes: [], effects: [{ kind: 'custom', note: 'All units gain Immunity' }], grantKeywords: { immunity: true } },
  { id: 'killing-fields', name: 'Killing Fields', element: 'earth', text: 'All units gain Lethal.', tags: [], wip: false, type: 'environment', cost: { energy: 6 }, lanes: [], effects: [{ kind: 'custom', note: 'All units gain Lethal' }], grantKeywords: { lethal: true } },
  { id: 'thin-air', name: 'Thin Air', element: 'fire', text: 'All units gain Battle Ready.', tags: [], wip: false, type: 'environment', cost: { energy: 1 }, lanes: [], effects: [{ kind: 'custom', note: 'All units gain Battle Ready' }], grantKeywords: { battleReady: true } },
  { id: 'crossfire-range', name: 'Crossfire Range', element: 'fire', text: 'Ground only. All units gain Branch Shot.', tags: [], wip: false, type: 'environment', cost: { energy: 3 }, lanes: ['ground'], effects: [{ kind: 'custom', note: 'All units gain Branch Shot' }], grantKeywords: { branchShot: true } },
  { id: 'high-ground', name: 'High Ground', element: 'fire', text: 'All units gain Overshot and Splash Damage.', tags: [], wip: false, type: 'environment', cost: { energy: 5 }, lanes: [], effects: [{ kind: 'custom', note: 'All units gain Overshot and Splash Damage' }], grantKeywords: { overshot: true, splashDamage: true } },
  { id: 'spawning-pool', name: 'Spawning Pool', element: 'nature', text: 'Ground only. All units gain Bloodlust: +1/0 per kill.', tags: [], wip: false, type: 'environment', cost: { energy: 3 }, lanes: ['ground'], effects: [{ kind: 'custom', note: 'All units gain Bloodlust: +1/0' }], grantKeywords: { bloodlust: { buff: { attack: 1, hp: 0 } } } },
  { id: 'overgrowth', name: 'Overgrowth', element: 'nature', text: 'All units gain Growth: +1/0 per turn.', tags: [], wip: false, type: 'environment', cost: { energy: 4 }, lanes: [], effects: [{ kind: 'custom', note: 'All units gain Growth: +1/0' }], grantKeywords: { growth: { attack: 1, hp: 0 } } },
  { id: 'tundra', name: 'Tundra', element: 'water', text: 'Units entering this lane are Frozen.', tags: [], wip: false, type: 'environment', cost: { energy: 2, elements: [{ type: 'water', amount: 1 }] }, lanes: [], effects: [{ kind: 'applyStatus', target: 'any', status: 'freeze' }] },
  // Water only: the one Environment that opens the Water lane to everyone — units in it
  // gain Aquatic, so non-swimmers stop drowning (see engine/drowning.ts).
  { id: 'shallows', name: 'Shallows', element: 'water', text: 'Water only. All units in this lane gain Aquatic.', tags: [], wip: false, type: 'environment', cost: { energy: 2, elements: [{ type: 'water', amount: 1 }] }, lanes: ['water'], effects: [{ kind: 'custom', note: 'All units gain Aquatic' }], grantKeywords: { aquatic: true } },
=======
  { id: 'ember-pup', name: 'Ember Pup', element: 'fire', tags: [], wip: false, type: 'unit', cost: { energy: 1 }, attack: 1, hp: 2, keywords: {} },
  { id: 'magma-brute', name: 'Magma Brute', element: 'fire', text: 'Brittle: attacks once then destroys itself.', tags: [], wip: false, type: 'unit', cost: { energy: 2 }, attack: 3, hp: 2, keywords: { brittle: true } },
  { id: 'pyre-fiend', name: 'Pyre Fiend', element: 'fire', text: 'May sacrifice up to 1 ally on play to gain +2/+2.', tags: [], wip: false, type: 'unit', cost: { energy: 1, elements: [{ type: 'nature', amount: 2 }] }, attack: 3, hp: 2, keywords: { sacrifice: { max: 1, buff: { attack: 2, hp: 2 } } } },
  { id: 'pumpkindle', name: 'Pumpkindle', element: 'fire', text: 'On death: inflict Burn 2 on enemies in its lane.', tags: [], wip: false, type: 'unit', cost: { energy: 2, elements: [{ type: 'fire', amount: 2 }] }, attack: 2, hp: 2, keywords: { kamikaze: { kind: 'applyStatus', amount: 2, target: 'enemy', status: 'burn' } } },
  { id: 'revolving-sun', name: 'Revolving Sun', element: 'fire', text: 'Sniper. On hit: inflict Burn 1.', tags: [], wip: false, type: 'unit', cost: { energy: 2, elements: [{ type: 'water', amount: 1 }, { type: 'fire', amount: 1 }] }, attack: 2, hp: 1, keywords: { sniper: true }, onHit: { burn: 1 } },
  { id: 'thorn-beast', name: 'Thorn Beast', element: 'nature', tags: [], wip: false, type: 'unit', cost: { energy: 3, elements: [{ type: 'earth', amount: 1 }] }, attack: 2, hp: 3, keywords: { spike: 1 } },
  { id: 'bloom-elk', name: 'Bloom Elk', element: 'nature', tags: [], wip: false, type: 'unit', cost: { energy: 3, elements: [{ type: 'nature', amount: 1 }] }, attack: 1, hp: 3, keywords: { growth: { attack: 1, hp: 0 } } },
  { id: 'spore-bat', name: 'Spore Bat', element: 'nature', tags: [], wip: false, type: 'unit', cost: { energy: 2, elements: [{ type: 'nature', amount: 1 }] }, attack: 2, hp: 1, keywords: { airborne: true } },
  { id: 'fearie', name: 'Fearie', element: 'nature', text: 'Airborne. Can move an enemy unit to this lane.', tags: [], wip: false, type: 'unit', cost: { energy: 3, elements: [{ type: 'nature', amount: 1 }, { type: 'water', amount: 1 }] }, attack: 2, hp: 1, keywords: { airborne: true }, onPlay: [{ kind: 'move', target: 'enemy' }], onAttack: [], endOfTurn: [], startOfTurn: [] },
  { id: 'craftbee', name: 'Craftbee', element: 'nature', text: 'Airborne. Branch Shot.', tags: [], wip: false, type: 'unit', cost: { energy: 5, elements: [{ type: 'nature', amount: 2 }] }, attack: 3, hp: 1, keywords: { branchShot: true, airborne: true } },
  { id: 'chemister', name: 'Chemister', element: 'nature', text: 'Sniper. On hit: inflict Poison.', tags: [], wip: false, type: 'unit', cost: { energy: 2, elements: [{ type: 'water', amount: 1 }, { type: 'nature', amount: 1 }] }, attack: 1, hp: 2, keywords: { sniper: true }, onHit: { poison: true } },
  { id: 'lumber-jacko', name: 'Lumber Jacko', element: 'nature', text: 'Bloodlust: +1/0 per kill.', tags: [], wip: false, type: 'unit', cost: { energy: 4, elements: [{ type: 'nature', amount: 2 }] }, attack: 3, hp: 3, keywords: { bloodlust: { buff: { attack: 1, hp: 0 } } } },
  { id: 'tide-serpent', name: 'Tide Serpent', element: 'water', tags: [], wip: false, type: 'unit', cost: { energy: 3, elements: [{ type: 'water', amount: 1 }] }, attack: 3, hp: 3, keywords: { aquatic: [{ kind: 'buff', target: 'self', stat: { attack: 2 } }] } },
  { id: 'frost-imp', name: 'Frost Imp', element: 'water', text: 'Overshot.', tags: [], wip: false, type: 'unit', cost: { energy: 4, elements: [{ type: 'fire', amount: 1 }] }, attack: 2, hp: 1, keywords: { overshot: true } },
  { id: 'coral-spear', name: 'Coral Spear', element: 'water', tags: [], wip: false, type: 'unit', cost: { energy: 2, elements: [{ type: 'water', amount: 1 }] }, attack: 3, hp: 1, keywords: { sniper: true } },
  { id: 'fog-creature', name: 'Fog Creature', element: 'water', text: 'Aquatic: +1/0 in Water. On hit: inflict Sleep.', tags: [], wip: false, type: 'unit', cost: { energy: 2, elements: [{ type: 'water', amount: 2 }] }, attack: 1, hp: 1, keywords: { aquatic: [{ kind: 'buff', target: 'self', stat: { attack: 1 } }] }, onHit: { sleep: 0 } },
  { id: 'frost-king', name: 'Frost King', element: 'water', text: 'On play: freeze all enemies.', tags: [], wip: false, type: 'unit', cost: { energy: 6, elements: [{ type: 'water', amount: 1 }] }, attack: 2, hp: 2, keywords: {}, onPlay: [{ kind: 'applyStatus', target: 'all-enemy', status: 'freeze' }] },
  { id: 'mud-crab', name: 'Mud Crab', element: 'earth', text: 'Spike 1.', tags: [], wip: false, type: 'unit', cost: { energy: 2, elements: [{ type: 'earth', amount: 1 }] }, attack: 2, hp: 2, keywords: { spike: 1 } },
  { id: 'bowling-boulder', name: 'Bowling Boulder', element: 'earth', text: 'Growth: +1/0 each turn. Polish: +0/+1 when hit.', tags: [], wip: false, type: 'unit', cost: { energy: 3, elements: [{ type: 'earth', amount: 2 }, { type: 'nature', amount: 1 }] }, attack: 1, hp: 3, keywords: { polish: { stat: { attack: 0, hp: 1 } }, growth: { attack: 1, hp: 0 } } },
  { id: 'salt-golem', name: 'Salt Golem', element: 'earth', text: 'Polish: when hit, heals your leader +1.', tags: [], wip: false, type: 'unit', cost: { energy: 5 }, attack: 2, hp: 5, keywords: {}, onPlay: [], onAttack: [], endOfTurn: [{ kind: 'heal', amount: 1, target: 'leader' }], startOfTurn: [] },
  { id: 'mandrake', name: 'Mandrake', element: 'earth', text: 'Polish: when hit, debuffs all enemies −1/0.', tags: [], wip: false, type: 'unit', cost: { energy: 3, elements: [{ type: 'earth', amount: 2 }] }, attack: 1, hp: 4, keywords: { polish: { effects: [{ kind: 'debuff', target: 'enemy', stat: { attack: 1 } }] } } },
  { id: 'pebble-snake', name: 'Pebble Snake', element: 'earth', text: 'Tough 1. Polish: gains +1/0 when hit.', tags: [], wip: false, type: 'unit', cost: { energy: 5, elements: [{ type: 'earth', amount: 3 }] }, attack: 2, hp: 4, keywords: { tough: 1, polish: { stat: { attack: 1, hp: 0 } } } },
  { id: 'galatian-spirit', name: 'Galatian Spirit', element: 'earth', text: 'Taunt. On hit: inflict Poison.', tags: [], wip: false, type: 'unit', cost: { energy: 4, elements: [{ type: 'earth', amount: 1 }, { type: 'nature', amount: 1 }] }, attack: 2, hp: 4, keywords: { taunt: true }, onHit: { poison: true } },
  { id: 'shinero', name: 'Spinero', element: 'nature', tags: [], wip: false, type: 'unit', cost: { energy: 6, elements: [{ type: 'earth', amount: 3 }] }, attack: 0, hp: 4, keywords: { taunt: true, spike: 3, tough: 1 } },
  { id: 'sig-living-mountain', name: 'Living Mountain', element: 'earth', text: 'Signature: a massive free defender.', tags: ['signature'], wip: false, type: 'unit', cost: { energy: 0 }, attack: 2, hp: 3, keywords: { taunt: true, tough: 2 } }, // Cleath: no rename needed
  { id: 'firebolt', name: 'Firebolt', element: 'fire', tags: [], wip: false, type: 'spell', cost: { energy: 1 }, effects: [{ kind: 'damage', amount: 2, target: 'enemy' }] },
  { id: 'pyroclasm', name: 'Pyroclasm', element: 'fire', text: 'Deal 4 damage directly to the enemy leader, ignoring all units.', tags: [], wip: false, type: 'spell', cost: { energy: 3 }, effects: [{ kind: 'damage', amount: 4, target: 'leader' }] },
  { id: 'mend', name: 'Mend', element: 'nature', tags: [], wip: false, type: 'spell', cost: { energy: 2 }, effects: [{ kind: 'heal', amount: 3, target: 'ally' }] },
  { id: 'strings-of-heaven', name: 'Strings of Heaven', element: 'nature', text: 'Move an ally unit to another lane and give it +1/+1.', tags: [], wip: false, type: 'spell', cost: { energy: 1, elements: [{ type: 'water', amount: 1 }] }, effects: [{ kind: 'move', target: 'ally' }, { kind: 'buff', target: 'ally', stat: { attack: 1, hp: 1 } }] },
  { id: 'whistle-blower', name: 'Wilt', element: 'nature', text: 'Reduce an enemy unit by -2/-2.', tags: [], wip: false, type: 'spell', cost: { energy: 2, elements: [{ type: 'earth', amount: 1 }] }, effects: [{ kind: 'debuff', target: 'enemy', stat: { attack: 2, hp: 2 } }] },
  { id: 'mush-room', name: 'Mush Room', element: 'nature', tags: [], wip: false, type: 'spell', cost: { energy: 2, elements: [{ type: 'earth', amount: 1 }] }, effects: [{ kind: 'applyStatus', target: 'ally', status: 'trueShield' }] },
  { id: 'cold-spell', name: 'Cold Spell', element: 'water', text: 'Freeze any unit.', tags: [], wip: false, type: 'spell', cost: { energy: 1, elements: [{ type: 'water', amount: 1 }] }, effects: [{ kind: 'applyStatus', target: 'any', status: 'freeze' }] },
  { id: 'hypnotic-patterns', name: 'Hypnotic Patterns', element: 'water', text: 'Put any unit to Sleep.', tags: [], wip: false, type: 'spell', cost: { energy: 1, elements: [{ type: 'water', amount: 1 }] }, effects: [{ kind: 'applyStatus', amount: 2, target: 'any', status: 'sleep' }] },
  { id: 'tidal-wave', name: 'Tidal Wave', element: 'water', text: 'Deal 2 damage to an enemy in the Water lane and move it to a ground lane.', tags: [], wip: false, type: 'spell', cost: { energy: 2, elements: [{ type: 'water', amount: 1 }] }, effects: [{ kind: 'damage', amount: 2, target: 'enemy' }, { kind: 'move', target: 'enemy' }] },
  { id: 'target-spell', name: 'Target', element: 'earth', text: 'Give Taunt to any unit.', tags: [], wip: false, type: 'spell', cost: { energy: 0, elements: [{ type: 'earth', amount: 1 }] }, effects: [{ kind: 'applyStatus', target: 'any', status: 'taunt' }] },
  { id: 'stone-footing', name: 'Stone Footing', element: 'earth', tags: [], wip: false, type: 'foundation', cost: { energy: 6, elements: [{ type: 'earth', amount: 2 }] }, attack: 2, hp: 4, keywords: {}, grants: { keywords: { tough: 1 } } },
  { id: 'down-under-masks', name: 'Down Under Masks', element: 'fire', tags: [], wip: false, type: 'foundation', cost: { energy: 10, elements: [{ type: 'nature', amount: 2 }, { type: 'earth', amount: 1 }, { type: 'fire', amount: 1 }] }, attack: 2, hp: 4, keywords: {}, grants: { keywords: { immunity: true, bloodlust: { buff: { attack: 2, hp: 1 } } } } },
  { id: 'freds-boat', name: 'Fred\'s Boat', element: 'water', text: 'Foundation. Grants Aquatic to the unit on top.', tags: [], wip: false, type: 'foundation', cost: { energy: 3, elements: [{ type: 'water', amount: 2 }] }, attack: 2, hp: 3, keywords: {}, grants: { keywords: { aquatic: true } } },
  { id: 'vent', name: 'Vent', element: 'fire', text: 'All units in this lane gain Overshot.', tags: [], wip: false, type: 'environment', cost: { energy: 3, elements: [{ type: 'fire', amount: 1 }] }, lanes: [], effects: [{ kind: 'custom', note: 'All units gain Overshot' }], grantKeywords: { overshot: true } },
  { id: 'graveyard', name: 'Graveyard', element: 'earth', text: 'All units gain Zombified.', tags: [], wip: false, type: 'environment', cost: { energy: 2, elements: [{ type: 'earth', amount: 1 }] }, lanes: ['ground'], effects: [{ kind: 'custom', note: 'All units gain Zombified' }], grantKeywords: { zombified: true } },
  { id: 'molten-floor', name: 'Molten Floor', element: 'fire', text: 'Units entering this lane gain Burn 1.', tags: [], wip: false, type: 'environment', cost: { energy: 0, elements: [{ type: 'fire', amount: 1 }] }, lanes: [], effects: [{ kind: 'applyStatus', amount: 1, target: 'any', status: 'burn' }] },
  { id: 'sludge-pool', name: 'Sludge Pool', element: 'nature', text: 'Units entering this lane are Poisoned.', tags: [], wip: false, type: 'environment', cost: { energy: 0, elements: [{ type: 'nature', amount: 1 }] }, lanes: [], effects: [{ kind: 'applyStatus', target: 'any', status: 'poison' }] },
  { id: 'watchtowers', name: 'Watchtowers', element: 'earth', text: 'Heights only. All units gain Sniper.', tags: [], wip: false, type: 'environment', cost: { energy: 0, elements: [{ type: 'water', amount: 1 }] }, lanes: ['heights'], effects: [{ kind: 'custom', note: 'All units gain Sniper' }], grantKeywords: { sniper: true } },
  { id: 'coffee-fields', name: 'Coffee Fields', element: 'nature', text: 'All units gain Double Strike.', tags: [], wip: false, type: 'environment', cost: { energy: 3, elements: [{ type: 'fire', amount: 1 }] }, lanes: [], effects: [{ kind: 'custom', note: 'All units gain Double Strike' }], grantKeywords: { doubleStrike: true } },
  { id: 'perfect-fortress', name: 'Perfect Fortress', element: 'earth', text: 'All units gain True Shield.', tags: [], wip: false, type: 'environment', cost: { energy: 2, elements: [{ type: 'earth', amount: 1 }] }, lanes: [], effects: [{ kind: 'custom', note: 'All units gain True Shield' }], grantKeywords: { trueShield: true } },
  { id: 'pocket-dimension', name: 'Pocket Dimension', element: 'nature', text: 'All units gain Double Team.', tags: [], wip: false, type: 'environment', cost: { energy: 1, elements: [{ type: 'water', amount: 1 }] }, lanes: [], effects: [{ kind: 'custom', note: 'All units gain Double Team' }], grantKeywords: { doubleTeam: true } },
  { id: 'warehouse', name: 'Warehouse', element: 'earth', text: 'All units gain Growth: +1/+1.', tags: [], wip: false, type: 'environment', cost: { energy: 2, elements: [{ type: 'nature', amount: 1 }] }, lanes: [], effects: [{ kind: 'custom', note: 'All units gain Growth: +1/+1' }], grantKeywords: { growth: { attack: 1, hp: 1 } } },
  { id: 'air-currents', name: 'Air Currents', element: 'nature', text: 'All units gain Airborne.', tags: [], wip: false, type: 'environment', cost: { energy: 1, elements: [{ type: 'nature', amount: 1 }] }, lanes: [], effects: [{ kind: 'custom', note: 'All units gain Airborne' }], grantKeywords: { airborne: true } },
  { id: 'cinder-witch', name: 'Cinder Witch', element: 'fire', text: 'Producer: 1 energy/turn. On hit: inflict Burn 1.', tags: [], wip: false, type: 'unit', cost: { energy: 4, elements: [{ type: 'fire', amount: 1 }] }, attack: 1, hp: 3, keywords: {}, onHit: { burn: 1 }, onPlay: [], onAttack: [], endOfTurn: [{ kind: 'energyNext', amount: 1 }], startOfTurn: [] },
  { id: 'ash-cloud', name: 'Ash Cloud', element: 'fire', text: 'Inflict Burn 1 on an enemy unit.', tags: [], wip: false, type: 'spell', cost: { energy: 0, elements: [{ type: 'fire', amount: 1 }] }, effects: [{ kind: 'applyStatus', amount: 1, target: 'enemy', status: 'burn' }] },
  { id: 'trench-turtle', name: 'Trench Turtle', element: 'earth', text: 'Tough 1.', tags: [], wip: false, type: 'unit', cost: { energy: 4, elements: [{ type: 'earth', amount: 1 }] }, attack: 2, hp: 2, keywords: { tough: 1 } },
  { id: 'guardian-crab', name: 'Guardian Crab', element: 'earth', text: 'Taunt. Tough 2.', tags: [], wip: false, type: 'unit', cost: { energy: 7, elements: [{ type: 'earth', amount: 2 }] }, attack: 0, hp: 5, keywords: { taunt: true, tough: 2 } },
  { id: 'iron-mantis', name: 'Iron Mantis', element: 'earth', text: 'Shield 2.', tags: [], wip: false, type: 'unit', cost: { energy: 5, elements: [{ type: 'earth', amount: 1 }] }, attack: 1, hp: 3, keywords: { shield: 2 } },
  { id: 'frost-wall', name: 'Frost Wall', element: 'water', text: 'Double Team.', tags: [], wip: false, type: 'unit', cost: { energy: 4, elements: [{ type: 'water', amount: 1 }] }, attack: 0, hp: 5, keywords: { doubleTeam: true } },
  { id: 'peel-back', name: 'Peel Back', element: 'water', text: 'Return an enemy unit to its owner\'s hand.', tags: [], wip: false, type: 'spell', cost: { energy: 1, elements: [{ type: 'water', amount: 1 }] }, effects: [{ kind: 'expel', target: 'enemy' }] },
  { id: 'iron-seed', name: 'Iron Seed', element: 'nature', text: 'Place beneath a unit: grants +1/+1 and Growth: +1/0.', tags: [], wip: false, type: 'foundation', cost: { energy: 4, elements: [{ type: 'nature', amount: 2 }] }, attack: 2, hp: 3, keywords: {}, grants: { keywords: { growth: { attack: 1, hp: 0 } } } },
  { id: 'swift-falcon', name: 'Swift Falcon', element: 'fire', text: 'Airborne. Brittle.', tags: [], wip: false, type: 'unit', cost: { energy: 2, elements: [{ type: 'nature', amount: 1 }] }, attack: 3, hp: 1, keywords: { airborne: true, brittle: true } },
  { id: 'surge-sprite', name: 'Surge Sprite', element: 'nature', text: 'Growth: +1/0 per turn. Producer: 1 energy/turn.', tags: [], wip: false, type: 'unit', cost: { energy: 3, elements: [{ type: 'nature', amount: 1 }] }, attack: 1, hp: 2, keywords: { growth: { attack: 1, hp: 0 } }, onPlay: [], onAttack: [], endOfTurn: [{ kind: 'energyNext', amount: 1 }], startOfTurn: [] },
  { id: 'chain-spark', name: 'Chain Spark', element: 'fire', text: 'Deal 2 damage to an enemy. If that unit dies, deal 1 to another, and so on.', tags: [], wip: false, type: 'spell', cost: { energy: 2 }, effects: [{ kind: 'damage', amount: 2, target: 'enemy', chainDiminish: true }] },
  { id: 'wind-redirect', name: 'Wind Redirect', element: 'nature', text: 'Move any unit (ally or enemy) to any valid lane.', tags: [], wip: false, type: 'spell', cost: { energy: 1, elements: [{ type: 'water', amount: 1 }] }, effects: [{ kind: 'move', target: 'any' }] },
  { id: 'colossal-worm', name: 'Colossal Worm', element: 'earth', text: 'Bloodlust: on kill, gain Shield 1 and burrow to another lane.', tags: [], wip: false, type: 'unit', cost: { energy: 7, elements: [{ type: 'nature', amount: 3 }] }, attack: 4, hp: 5, keywords: { bloodlust: { effects: [{ kind: 'applyStatus', amount: 1, target: 'self', status: 'shield' }, { kind: 'move', target: 'self' }] } } },
  { id: 'adrenaline-rush', name: 'Adrenaline Rush', element: 'fire', text: 'An ally unit takes an immediate bonus attack (no retaliation).', tags: [], wip: false, type: 'spell', cost: { energy: 2 }, effects: [{ kind: 'extraAction', target: 'ally' }] },
  { id: 'critter-token', name: 'Mechanical Failure', element: 'nature', text: 'A summoned mechanical failure. Airborne.', tags: [], wip: false, type: 'unit', cost: { energy: 2, elements: [{ type: 'nature', amount: 1 }] }, attack: 1, hp: 2, keywords: { airborne: true } },
  { id: 'critter-elite', name: 'Techtacle', element: 'nature', text: 'A summoned techtacle. Airborne, Lethal, True Shield.', tags: ['token'], wip: false, type: 'unit', cost: { energy: 6 }, attack: 1, hp: 1, keywords: { lethal: true, airborne: true, trueShield: true } },
  // Autopus's BUFFED signature summons these instead. Double Team is a lane-capacity flag
  // and cannot be granted at runtime (it is absent from `grantableKeywordsShape`), so the
  // upgrade re-points its five summons at this variant rather than buffing the base token.
  { id: 'critter-elite-pair', name: 'Twinned Techtacle', element: 'nature', text: 'A summoned techtacle. Airborne, Lethal, True Shield, Double Team.', tags: ['token'], wip: false, type: 'unit', cost: { energy: 6 }, attack: 1, hp: 1, keywords: { lethal: true, airborne: true, trueShield: true, doubleTeam: true } },
  // Adventure boss token (False Hydra / "Ignorance is Bliss"): a mindless cult
  // follower. Airborne so it never drowns regardless of which lane it's placed in —
  // its self-sacrifice-and-mill trigger should fire uniformly on every lane.
  // The False Hydra's cult. Placed into the BOSS's empty lanes on every odd round (see
  // `BossRules.placements`), so they are a wall you must attack through — which is what
  // makes "kill them before the round ends" a real ask rather than a scripted event.
  //
  // The punishment fires at the OWNER's end of turn — the boss's, i.e. the end of the
  // round — and lands on `target: 'enemy'`, which from the boss's seat is the player. It
  // conjures a Null rather than milling: a milled card is invisible (the player never
  // learns what they lost), whereas a Null takes a hand slot, presses on the hand cap, and
  // bleeds its holder every turn it is held. Legible, and it compounds.
  //
  // Airborne so it can occupy the Water lane without drowning — "every empty lane" has to
  // mean every lane. 0 attack: the tax it charges is your attack step, never damage.
  { id: 'cult-follower', name: 'False Prophet', element: 'water', text: 'Fills the cult\'s empty lanes. If it is still standing at the end of the round, it dissolves and puts a Null into the enemy\'s hand.', tags: ['token'], wip: false, type: 'unit', cost: { energy: 0 }, attack: 0, hp: 1, keywords: { airborne: true }, endOfTurn: [{ kind: 'conjure', cardId: NULL_CARD_ID, target: 'enemy' }, { kind: 'damage', amount: 99, target: 'self' }] },
  // Cleath's pre-built board (`BossRules.placements`, `everyRounds: 0` — opening only). A
  // standalone Foundation is a full unit in this engine, so the bulwarks fight, take
  // damage and grant Tough to anything the boss later bonds onto them. Placed once, never
  // replenished: this is a siege you can win, not a wall that regrows.
  { id: 'bulwark-wall', name: 'Bulwark', element: 'earth', text: 'A section of the Architect\'s finished wall.', tags: ['token'], wip: false, type: 'foundation', cost: { energy: 0 }, attack: 1, hp: 5, keywords: { tough: 1 }, grants: { keywords: { tough: 1 } } },
  { id: 'dead-weight', name: 'Dead Weight', element: 'nature', text: 'Junk forced into a hand. Hindering to clear — you must bank one of every element to play it away.', tags: ['token'], wip: false, type: 'unit', cost: { energy: 1, elements: [{ type: 'fire', amount: 1 }, { type: 'water', amount: 1 }, { type: 'nature', amount: 1 }, { type: 'earth', amount: 1 }] }, attack: 0, hp: 4, keywords: {} },
  { id: 'flicker-moth', name: 'Flicker Moth', element: 'fire', tags: [], wip: false, type: 'unit', cost: { energy: 1 }, attack: 2, hp: 1, keywords: {} },
  { id: 'coal-runner', name: 'Coal Runner', element: 'fire', tags: [], wip: false, type: 'unit', cost: { energy: 2 }, attack: 3, hp: 2, keywords: {} },
  { id: 'blaze-hound', name: 'Blaze Hound', element: 'fire', tags: [], wip: false, type: 'unit', cost: { energy: 3 }, attack: 4, hp: 2, keywords: {} },
  { id: 'inferno-ox', name: 'Inferno Ox', element: 'fire', tags: [], wip: false, type: 'unit', cost: { energy: 5 }, attack: 5, hp: 4, keywords: {} },
  { id: 'river-minnow', name: 'River Minnow', element: 'water', tags: [], wip: false, type: 'unit', cost: { energy: 1 }, attack: 1, hp: 2, keywords: {} },
  { id: 'reef-darter', name: 'Reef Darter', element: 'water', tags: [], wip: false, type: 'unit', cost: { energy: 2 }, attack: 2, hp: 3, keywords: {} },
  { id: 'current-rider', name: 'Current Rider', element: 'water', tags: [], wip: false, type: 'unit', cost: { energy: 3 }, attack: 3, hp: 3, keywords: {} },
  // --- CONTROL's answers. Water had walls, freezes and bounces but no way to KILL anything and
  //     no way to draw, so every answer was a 1-for-1 that gave up a card to buy one turn. Its
  //     disruption spells measured at the BOTTOM of its own deck's win table. These are the
  //     removal and the card-replacement that a control plan needs to exist at all.
  //     Freeze absorbs one hit (including card damage), so the removal PIERCES — that is what
  //     lets the deck answer the very thing it just froze instead of protecting it.
  { id: 'abyssal-verdict', name: 'Abyssal Verdict', element: 'water', text: 'Pierces: deal 4 damage to any unit, ignoring Freeze, Shield and Tough.', tags: [], wip: false, type: 'spell', cost: { energy: 5, elements: [{ type: 'water', amount: 1 }] }, effects: [{ kind: 'damage', amount: 4, target: 'any', pierce: true }] },
  // Damage BEFORE freeze, deliberately: reversing the order would have the freeze absorb this
  // card's own damage. Ordering matters now that card damage resolves as a hit.
  { id: 'frostbite-harpoon', name: 'Frostbite Harpoon', element: 'water', text: 'Deal 2 damage to any unit, then Freeze it.', tags: [], wip: false, type: 'spell', cost: { energy: 2, elements: [{ type: 'water', amount: 1 }] }, effects: [{ kind: 'damage', amount: 2, target: 'any' }, { kind: 'applyStatus', target: 'any', status: 'freeze' }] },
  { id: 'riptide-executioner', name: 'Riptide Executioner', element: 'water', text: 'Pierce: strikes the deepest unit, ignoring Freeze, Shield, Taunt, Spike and Tough.', tags: [], wip: false, type: 'unit', cost: { energy: 4, elements: [{ type: 'water', amount: 1 }] }, attack: 2, hp: 3, keywords: { pierce: true } },
  { id: 'tidecaller-adept', name: 'Tidecaller Adept', element: 'water', text: 'On play: draw a card.', tags: [], wip: false, type: 'unit', cost: { energy: 3 }, attack: 2, hp: 3, keywords: {}, onPlay: [{ kind: 'draw', amount: 1 }] },
  { id: 'brackish-warden', name: 'Brackish Warden', element: 'water', text: 'Taunt. On play: draw a card.', tags: [], wip: false, type: 'unit', cost: { energy: 4, elements: [{ type: 'earth', amount: 1 }] }, attack: 1, hp: 5, keywords: { taunt: true }, onPlay: [{ kind: 'draw', amount: 1 }] },
  { id: 'glacial-ray', name: 'Glacial Ray', element: 'water', text: 'Splash: its attack also hits the front unit of each adjacent lane (no retaliation).', tags: [], wip: false, type: 'unit', cost: { energy: 4, elements: [{ type: 'fire', amount: 1 }] }, attack: 2, hp: 3, keywords: { splashDamage: true } },
  { id: 'abyss-warden', name: 'Abyss Warden', element: 'water', tags: [], wip: false, type: 'unit', cost: { energy: 5 }, attack: 4, hp: 5, keywords: {} },
  { id: 'field-mouse', name: 'Field Mouse', element: 'nature', tags: [], wip: false, type: 'unit', cost: { energy: 1 }, attack: 1, hp: 2, keywords: {} },
  { id: 'briar-colt', name: 'Briar Colt', element: 'nature', tags: [], wip: false, type: 'unit', cost: { energy: 2 }, attack: 2, hp: 3, keywords: {} },
  { id: 'oak-sentry', name: 'Oak Sentry', element: 'nature', tags: [], wip: false, type: 'unit', cost: { energy: 4 }, attack: 3, hp: 4, keywords: {} },
  { id: 'pebble-pup', name: 'Pebble Pup', element: 'earth', tags: [], wip: false, type: 'unit', cost: { energy: 1 }, attack: 1, hp: 2, keywords: {} },
  { id: 'gravel-hound', name: 'Gravel Hound', element: 'earth', tags: [], wip: false, type: 'unit', cost: { energy: 2 }, attack: 2, hp: 3, keywords: {} },
  { id: 'granite-ox', name: 'Granite Ox', element: 'earth', tags: [], wip: false, type: 'unit', cost: { energy: 4 }, attack: 3, hp: 5, keywords: {} },
  { id: 'mountain-bull', name: 'Mountain Bull', element: 'earth', tags: [], wip: false, type: 'unit', cost: { energy: 5 }, attack: 4, hp: 5, keywords: {} },
  { id: 'razor-charger', name: 'Razor Charger', element: 'fire', text: 'Strike Through.', tags: [], wip: false, type: 'unit', cost: { energy: 4, elements: [{ type: 'fire', amount: 1 }] }, attack: 3, hp: 2, keywords: { strikeThrough: true } },
  { id: 'comet-rider', name: 'Comet Rider', element: 'fire', text: 'Battle Ready.', tags: [], wip: false, type: 'unit', cost: { energy: 3, elements: [{ type: 'fire', amount: 1 }] }, attack: 2, hp: 1, keywords: { battleReady: true } },
  { id: 'twin-blade', name: 'Twin Blade', element: 'fire', text: 'Double Strike.', tags: [], wip: false, type: 'unit', cost: { energy: 4, elements: [{ type: 'fire', amount: 1 }] }, attack: 2, hp: 2, keywords: { doubleStrike: true } },
  { id: 'split-arrow', name: 'Split Arrow', element: 'fire', text: 'Branch Shot.', tags: [], wip: false, type: 'unit', cost: { energy: 4, elements: [{ type: 'nature', amount: 1 }] }, attack: 3, hp: 1, keywords: { branchShot: true } },
  { id: 'ember-tick', name: 'Ember Tick', element: 'fire', text: 'On hit: inflict Burn 1.', tags: [], wip: false, type: 'unit', cost: { energy: 2, elements: [{ type: 'fire', amount: 1 }] }, attack: 1, hp: 2, keywords: {}, onHit: { burn: 1 } },
  { id: 'plague-rat', name: 'Plague Rat', element: 'nature', text: 'On hit: inflict Poison.', tags: [], wip: false, type: 'unit', cost: { energy: 2, elements: [{ type: 'nature', amount: 1 }] }, attack: 1, hp: 2, keywords: {}, onHit: { poison: true } },
  { id: 'ashen-bomber', name: 'Ashen Bomber', element: 'fire', text: 'On death: deal 3 damage to enemies in its lane.', tags: [], wip: false, type: 'unit', cost: { energy: 1, elements: [{ type: 'fire', amount: 2 }] }, attack: 2, hp: 2, keywords: { kamikaze: { kind: 'damage', amount: 3, target: 'enemy' } } },
  // --- NEUTRAL. A card class, not a fifth element: no neutral bank, no neutral cap, no neutral
  //     pip. A neutral card's abilities have no elemental association, so the pip system charges
  //     it nothing in colour and it is priced entirely in energy — castable on curve by every
  //     leader regardless of caps or banking. This is the pool's common ground, and the place
  //     for effects that were never elemental in the first place (draw, plain damage, healing a
  //     body, a mercenary with no allegiance).
  //
  //     NOTE this is an AUTHORED choice, not something derived. Plenty of elemental cards also
  //     have no element-bearing ability — a vanilla Fire 2/2 pays no pip either — but its
  //     element still says which leader wants it and which archetype it belongs to. Neutral is
  //     for cards that belong to no element at all.
  { id: 'stray-cur', name: 'Stray Cur', element: 'neutral', tags: [], wip: false, type: 'unit', cost: { energy: 1 }, attack: 1, hp: 1, keywords: {} },
  { id: 'mercenary', name: 'Mercenary', element: 'neutral', text: 'Fights for whoever pays.', tags: [], wip: false, type: 'unit', cost: { energy: 3 }, attack: 3, hp: 3, keywords: {} },
  { id: 'field-medic', name: 'Field Medic', element: 'neutral', text: 'On play: heal an ally 3.', tags: [], wip: false, type: 'unit', cost: { energy: 3 }, attack: 1, hp: 2, keywords: {}, onPlay: [{ kind: 'heal', amount: 3, target: 'ally' }] },
  { id: 'salvage-run', name: 'Salvage Run', element: 'neutral', text: 'Draw 2 cards.', tags: [], wip: false, type: 'spell', cost: { energy: 2 }, effects: [{ kind: 'draw', amount: 2 }] },
  { id: 'sharpened-stake', name: 'Sharpened Stake', element: 'neutral', text: 'Deal 3 damage to an enemy unit.', tags: [], wip: false, type: 'spell', cost: { energy: 2 }, effects: [{ kind: 'damage', amount: 3, target: 'enemy' }] },
  // --- DEAD MECHANICS, NOW REACHABLE. `metamorphosis` and `smelt` each had a full engine
  //     implementation, AI valuation and dedicated tests, and ZERO cards — the cheapest content
  //     in the game, since only the cards were missing.
  //
  // NB: metamorphosis REQUIRES `into` (endOfTurn.ts returns early without it), so a gains-only
  // metamorphosis is a silent no-op. It needs a base form and an evolved form.
  { id: 'emerald-drake', name: 'Emerald Drake', element: 'nature', text: 'Airborne.', tags: [], wip: false, type: 'unit', cost: { energy: 6, elements: [{ type: 'nature', amount: 1 }] }, attack: 4, hp: 5, keywords: { airborne: true } },
  { id: 'chrysalis-grub', name: 'Chrysalis Grub', element: 'nature', text: 'Metamorphosis: becomes an Emerald Drake after 2 turns.', tags: [], wip: false, type: 'unit', cost: { energy: 4, elements: [{ type: 'nature', amount: 1 }] }, attack: 1, hp: 3, keywords: { metamorphosis: { everyTurns: 2, into: 'emerald-drake' } } },
  // Smelt burns the body for cards every turn — fire's idiom, and fire's second answer to the
  // pool-wide card shortage. Its effect must be PLAYER-scoped (draw/energy): triggered effects
  // dispatch from a whitelist and a unit-targeting effect would silently do nothing here.
  // COUNTDOWN replaces Smelt in Fire's slot. The distinction from the game's other delayed
  // mechanics is WHO HOLDS THE CLOCK: Kamikaze fires on death, so the opponent picks the moment
  // by choosing whether to kill it; Metamorphosis is a timer that upgrades. A Countdown is a
  // threat the opponent has to answer EARLY or play around — and because it carries an
  // arbitrary Effect[], the same keyword covers a bomb, a recurring tick and a delayed payoff.
  { id: 'powder-keg', name: 'Powder Keg', element: 'fire', text: 'Countdown 2: deal 3 damage to all enemies, then is destroyed.', tags: [], wip: false, type: 'unit', cost: { energy: 5, elements: [{ type: 'fire', amount: 2 }] }, attack: 1, hp: 4, keywords: { countdown: { turns: 2, effects: [{ kind: 'damage', amount: 3, target: 'all-enemy' }], consume: true } } },
  { id: 'ember-chronicler', name: 'Ember Chronicler', element: 'fire', text: 'Countdown 1 (repeating): draw a card each turn.', tags: [], wip: false, type: 'unit', cost: { energy: 2, elements: [{ type: 'fire', amount: 2 }] }, attack: 2, hp: 4, keywords: { countdown: { turns: 1, effects: [{ kind: 'draw', amount: 1 }], repeat: true } } },
  { id: 'cinder-vigil', name: 'Cinder Vigil', element: 'fire', text: 'Countdown 2 (repeating): deal 2 damage to an enemy.', tags: [], wip: false, type: 'unit', cost: { energy: 2, elements: [{ type: 'fire', amount: 2 }] }, attack: 1, hp: 5, keywords: { countdown: { turns: 2, effects: [{ kind: 'damage', amount: 2, target: 'enemy' }], repeat: true } } },
  // Lethal could not be PRINTED on any playable card — the only sources were an Earth foundation
  // and an Earth environment, while the creation guide lists Lethal in NATURE's toolkit. This
  // makes the guide true and gives the keyword a body.
  { id: 'venom-sniper', name: 'Venom Sniper', element: 'nature', text: 'Sniper. Lethal.', tags: [], wip: false, type: 'unit', cost: { energy: 4, elements: [{ type: 'nature', amount: 1 }, { type: 'water', amount: 1 }] }, attack: 1, hp: 2, keywords: { lethal: true, sniper: true } },
  // --- GRANT COVERAGE. Every grantable keyword should be obtainable from BOTH a foundation and
  //     an environment; an audit found four keywords missing one or both.
  { id: 'tidal-rift', name: 'Tidal Rift', element: 'water', text: 'Units here gain Pierce. On enter: heal your units 1.', tags: [], wip: false, type: 'environment', cost: { energy: 3, elements: [{ type: 'water', amount: 1 }] }, lanes: ['water'], effects: [{ kind: 'heal', amount: 1, target: 'all-ally' }], grantKeywords: { pierce: true } },
  { id: 'mortar-emplacement', name: 'Mortar Emplacement', element: 'fire', text: 'Grants Splash Damage.', tags: [], wip: false, type: 'foundation', cost: { energy: 5, elements: [{ type: 'fire', amount: 2 }] }, attack: 2, hp: 3, keywords: {}, grants: { keywords: { splashDamage: true } } },
  { id: 'aegis-plinth', name: 'Aegis Plinth', element: 'earth', text: 'Grants True Shield.', tags: [], wip: false, type: 'foundation', cost: { energy: 5, elements: [{ type: 'earth', amount: 2 }] }, attack: 0, hp: 4, keywords: {}, grants: { keywords: { trueShield: true } } },
  // Brittle had NO foundation and NO environment — the only grantable keyword missing both.
  // It is a downside, so these are a glass-cannon trade and a hazard lane rather than gifts.
  { id: 'glass-forge', name: 'Glass Forge', element: 'fire', text: 'Grants Brittle. A heavy body that shatters what it lifts.', tags: [], wip: false, type: 'foundation', cost: { energy: 3, elements: [{ type: 'fire', amount: 1 }] }, attack: 4, hp: 2, keywords: {}, grants: { keywords: { brittle: true } } },
  { id: 'shattered-span', name: 'Shattered Span', element: 'fire', text: 'Every unit here becomes Brittle. On enter: 1 damage to enemies.', tags: [], wip: false, type: 'environment', cost: { energy: 1 }, lanes: [], effects: [{ kind: 'damage', amount: 1, target: 'all-enemy' }], grantKeywords: { brittle: true } },
  // --- POOL GAP-FILLERS. An audit of element x function found holes that no amount of cost
  //     tuning could reach. The largest by far: before these, the ENTIRE pool contained ONE
  //     card that draws (grove-elder) plus Screyera's hero power. Cards — not energy — are the
  //     binding resource (1 draw/turn, 8 board slots, energy uncapped), so card ACCESS was a
  //     resource only one leader could buy at any price. That is the likeliest reason Combo led
  //     every configuration measured and survived six repricings untouched.
  //     Also filled: Water had no healing, Nature no cleanse, Earth no draw/AOE and only two
  //     spells in the whole element. Each fill is in its element's idiom.
  //
  // FIRE draws by spending the body — it is the element that trades bodies for tempo.
  { id: 'powder-monkey', name: 'Powder Monkey', element: 'fire', text: 'On death: draw a card.', tags: [], wip: false, type: 'unit', cost: { energy: 0, elements: [{ type: 'fire', amount: 2 }] }, attack: 2, hp: 1, keywords: { kamikaze: { kind: 'draw', amount: 1 } } },
  // WATER had NO healing anywhere. Sustain suits a control element that wins long games.
  { id: 'reef-nurse', name: 'Reef Nurse', element: 'water', text: 'On play: heal an ally 2.', tags: [], wip: false, type: 'unit', cost: { energy: 3, elements: [{ type: 'water', amount: 1 }] }, attack: 1, hp: 3, keywords: { healer: { amount: 2, target: 'ally', trigger: 'onPlay' } } },
  // NATURE had no cleanse — and `purify` (water) was the ONLY answer to Burn/Poison/Freeze/Sleep
  // in the game. Regrowth idiom: strip the affliction and heal the scar.
  { id: 'rejuvenate', name: 'Rejuvenate', element: 'nature', text: 'Remove all status effects from an ally and heal it 2.', tags: [], wip: false, type: 'spell', cost: { energy: 2 }, effects: [{ kind: 'cleanse', target: 'ally' }, { kind: 'heal', amount: 2, target: 'ally' }] },
  { id: 'ironroot-ward', name: 'Ironroot Ward', element: 'nature', text: 'On play: remove all status effects from an ally and heal it 2.', tags: [], wip: false, type: 'unit', cost: { energy: 5 }, attack: 2, hp: 4, keywords: {}, onPlay: [{ kind: 'cleanse', target: 'ally' }, { kind: 'heal', amount: 2, target: 'ally' }] },
  // EARTH was the thinnest element in the pool: 2 spells total, no draw, no AOE, and a curve
  // with 24 cards at 5+ but only 4 at 0-1.
  // 2/1 rather than 1/2: Pebble Pup is Earth's 1/2 vanilla one-drop, and two cards with the
  // identical element, body and (empty) ability set are the same card printed twice. Earth
  // keeps six one-drops for the copy limit's sake — they just aren't interchangeable now.
  { id: 'quarry-hand', name: 'Quarry Hand', element: 'earth', tags: [], wip: false, type: 'unit', cost: { energy: 1 }, attack: 2, hp: 1, keywords: {} },
  { id: 'tremor', name: 'Tremor', element: 'earth', text: 'Deal 1 damage to all enemy units.', tags: [], wip: false, type: 'spell', cost: { energy: 2 }, effects: [{ kind: 'damage', amount: 1, target: 'all-enemy' }] },
  // Repriced with the fix that made a granted keyword earn its own element pip: Tough is an
  // EARTH ability, so Bulwark's whole cost used to sit in generic energy despite the guide's
  // rule that a pip is charged in the element of the ability that earns it.
  { id: 'bulwark', name: 'Bulwark', element: 'earth', text: 'Give an ally Tough 1.', tags: [], wip: false, type: 'spell', cost: { energy: 2, elements: [{ type: 'earth', amount: 1 }] }, effects: [{ kind: 'buff', target: 'ally', keywords: { tough: 1 } }] },
  // Earth's card engine: slow, must survive, and it cannot attack. The element that wins long
  // games gets its cards the same way it wins them.
  { id: 'runestone-keeper', name: 'Runestone Keeper', element: 'earth', text: 'Taunt. At end of turn: draw a card.', tags: [], wip: false, type: 'unit', cost: { energy: 3, elements: [{ type: 'earth', amount: 1 }] }, attack: 0, hp: 4, keywords: { taunt: true }, endOfTurn: [{ kind: 'draw', amount: 1 }] },
  // --- Card advantage / tempo engines -------------------------------------------------
  // The pool had almost no draw, conjure or energy generation outside nature and water, so
  // an earth deck could only ever spend what the curve handed it. These give earth its own
  // access, and they double as chargers for Eksana's Call in a Favour: every card played
  // discounts the favour by 1, so a card that replaces itself charges twice.
  { id: 'dead-drop', name: 'Dead Drop', element: 'earth', text: 'Draw a card.', tags: [], wip: false, type: 'spell', cost: { energy: 1 }, effects: [{ kind: 'draw', amount: 1 }] },
  { id: 'the-fence', name: 'The Fence', element: 'earth', text: 'On play: draw a card.', tags: [], wip: false, type: 'unit', cost: { energy: 2 }, attack: 1, hp: 2, keywords: {}, onPlay: [{ kind: 'draw', amount: 1 }] },
  { id: 'hired-blade', name: 'Hired Blade', element: 'earth', text: '', tags: ['token'], wip: false, type: 'unit', cost: { energy: 0 }, attack: 2, hp: 1, keywords: {} },
  { id: 'call-in-markers', name: 'Call in Markers', element: 'earth', text: 'Add two Hired Blades to your hand.', tags: [], wip: false, type: 'spell', cost: { energy: 4 }, effects: [{ kind: 'conjure', cardId: 'hired-blade' }, { kind: 'conjure', cardId: 'hired-blade' }] },
  { id: 'smugglers-cache', name: "Smuggler's Cache", element: 'earth', text: 'Grants Producer: 1 energy/turn.', tags: [], wip: false, type: 'foundation', cost: { energy: 2, elements: [{ type: 'nature', amount: 1 }, { type: 'earth', amount: 1 }] }, attack: 0, hp: 3, keywords: { producer: { amount: 1 } }, grants: { endOfTurn: [{ kind: 'energyNext', amount: 1 }] } },
  // --- REMOVAL, distributed by element. Every element needs an answer, because a player can
  //     always build the deck that has one: balancing around a starter LIST is unenforceable
  //     when the card pool is open. Differentiated by CONDITION, not price — energy equals the
  //     round number and is uncapped, so after round ~5 a costlier answer is barely a worse
  //     one (measured: +2 energy on 5 of 30 cards moved a deck 1.6pp, inside noise).
  //     Fire already had reach (firebolt/chain-spark/ashen-bomber); Water has abyssal-verdict
  //     and void-caller; these fill the two real gaps.
  //
  // EARTH had no spells at all. Counter-punch idiom: it answers THREATS and is dead against
  // chaff — damage equal to the target's own attack. Kills a 5/5, does nothing to a 0/5 wall.
  // (Pool: median attack 2, only 24% of units have 3+.)
  { id: 'reprisal', name: 'Reprisal', element: 'earth', text: "Deal damage to an enemy unit equal to its own attack.", tags: [], wip: false, type: 'spell', cost: { energy: 2 }, effects: [{ kind: 'damage', target: 'enemy', amountFrom: 'targetAttack' }] },
  // NATURE had only mass poison (creeping-blight, Poison 1 to all) and Lethal bodies. This is
  // the single-target attrition answer: slow, cleansable, outpaced by healing, and it shuts off
  // Growth/Bloodlust because a poisoned unit cannot be buffed.
  { id: 'strangleroot', name: 'Strangleroot', element: 'nature', text: 'Inflict Poison 2 on an enemy unit.', tags: [], wip: false, type: 'spell', cost: { energy: 2, elements: [{ type: 'nature', amount: 1 }] }, effects: [{ kind: 'applyStatus', target: 'enemy', status: 'poison', amount: 2 }] },
  { id: 'creeping-blight', name: 'Creeping Blight', element: 'nature', text: 'Inflict Poison on all enemy units.', tags: [], wip: false, type: 'spell', cost: { energy: 3, elements: [{ type: 'nature', amount: 1 }] }, effects: [{ kind: 'applyStatus', target: 'all-enemy', status: 'poison' }] },
  { id: 'wildfire-spread', name: 'Wildfire Spread', element: 'fire', text: 'Inflict Burn 2 on all enemy units.', tags: [], wip: false, type: 'spell', cost: { energy: 6, elements: [{ type: 'fire', amount: 1 }] }, effects: [{ kind: 'applyStatus', amount: 2, target: 'all-enemy', status: 'burn' }] },
  { id: 'dream-eater', name: 'Dream Eater', element: 'water', text: 'Sniper. On hit: inflict Sleep.', tags: [], wip: false, type: 'unit', cost: { energy: 3, elements: [{ type: 'water', amount: 2 }] }, attack: 1, hp: 2, keywords: { sniper: true }, onHit: { sleep: 1 } },
  { id: 'void-caller', name: 'Void Caller', element: 'water', text: 'Deal 2 damage to all enemy units.', tags: [], wip: false, type: 'spell', cost: { energy: 3 }, effects: [{ kind: 'damage', amount: 2, target: 'all-enemy' }] },
  { id: 'lull', name: 'Lull', element: 'water', text: 'Put all enemy units to Sleep.', tags: [], wip: false, type: 'spell', cost: { energy: 4, elements: [{ type: 'water', amount: 1 }] }, effects: [{ kind: 'applyStatus', amount: 2, target: 'all-enemy', status: 'sleep' }] },
  { id: 'cursed-gift', name: 'Cursed Gift', element: 'water', text: 'Add a Dead Weight to your opponent\'s hand.', tags: [], wip: false, type: 'spell', cost: { energy: 2 }, effects: [{ kind: 'conjure', target: 'enemy', cardId: 'dead-weight' }] },
  { id: 'mind-leech', name: 'Mind Leech', element: 'water', text: 'On hit: inflict Sleep. On death: add a Dead Weight to the enemy hand.', tags: [], wip: false, type: 'unit', cost: { energy: 2, elements: [{ type: 'fire', amount: 2 }, { type: 'water', amount: 1 }] }, attack: 1, hp: 3, keywords: { kamikaze: { kind: 'conjure', target: 'enemy', cardId: 'dead-weight' } }, onHit: { sleep: 0 } },
  // ── Forget package ────────────────────────────────────────────────────────────────────────
  // The pool had NO enemy-Forget card at all: John Pork's hero power was the entire archetype,
  // 2 cards a turn, and Deck Out measured 19.8%. Cheapening the Forget formula alone bought
  // nothing because there was nothing to buy. Shapes taken from how other games build mill —
  // one bulk spell, and the rest STAPLED TO BODIES so milling costs no tempo (a mill deck that
  // spends its whole turn not affecting the board just loses first). All priced by the formula.
  //
  // These launched at DOUBLE these Forget amounts and Deck Out hit 62.5%, so they were cut.
  // Cut the AMOUNTS, not by raising the costs: paying the formula's steep 1.5/extra-card slope
  // for the old numbers priced them at 7e and 12e, and since energy is just the round number a
  // 7e spell arrives too late to be a plan and a 12e one never arrives at all. A mill deck
  // needs to be doing its thing every turn, so cheap-and-smaller beats expensive-and-bigger.
  { id: 'tide-of-oblivion', name: 'Tide of Oblivion', element: 'water', text: 'The opponent forgets 3 cards.', tags: [], wip: false, type: 'spell', cost: { energy: 4 }, effects: [{ kind: 'forget', amount: 3, target: 'enemy' }] },
  { id: 'archive-eel', name: 'Archive Eel', element: 'water', text: 'Aquatic: +1/0 in Water. End of turn: the opponent forgets 1.', tags: [], wip: false, type: 'unit', cost: { energy: 3, elements: [{ type: 'water', amount: 1 }] }, attack: 0, hp: 3, keywords: { aquatic: [{ kind: 'buff', target: 'self', stat: { attack: 1 } }] }, endOfTurn: [{ kind: 'forget', amount: 1, target: 'enemy' }] },
  { id: 'memory-siphon', name: 'Memory Siphon', element: 'water', text: 'When it attacks: the opponent forgets 1.', tags: [], wip: false, type: 'unit', cost: { energy: 3 }, attack: 2, hp: 2, keywords: {}, onAttack: [{ kind: 'forget', amount: 1, target: 'enemy' }] },
  { id: 'drowned-archive', name: 'Drowned Archive', element: 'water', text: 'Taunt. Aquatic: +0/+2 in Water. End of turn: the opponent forgets 1.', tags: [], wip: false, type: 'unit', cost: { energy: 3, elements: [{ type: 'earth', amount: 1 }, { type: 'water', amount: 1 }] }, attack: 0, hp: 3, keywords: { taunt: true, aquatic: [{ kind: 'buff', target: 'self', stat: { hp: 2 } }] }, endOfTurn: [{ kind: 'forget', amount: 1, target: 'enemy' }] },
  { id: 'bulwark-toad', name: 'Bulwark Toad', element: 'earth', text: 'Taunt. Shield 1.', tags: [], wip: false, type: 'unit', cost: { energy: 4, elements: [{ type: 'earth', amount: 2 }] }, attack: 0, hp: 3, keywords: { shield: 1, taunt: true } },
  { id: 'barbed-sentinel', name: 'Barbed Sentinel', element: 'earth', text: 'Taunt. Spike 2.', tags: [], wip: false, type: 'unit', cost: { energy: 4, elements: [{ type: 'earth', amount: 2 }] }, attack: 1, hp: 4, keywords: { taunt: true, spike: 2 } },
  { id: 'thornmail-beetle', name: 'Thornmail Beetle', element: 'earth', text: 'Spike 1. On hit: inflict Poison.', tags: [], wip: false, type: 'unit', cost: { energy: 5, elements: [{ type: 'earth', amount: 1 }, { type: 'nature', amount: 1 }] }, attack: 1, hp: 4, keywords: { spike: 1 }, onHit: { poison: true } },
  { id: 'aegis-ancient', name: 'Aegis Ancient', element: 'earth', text: 'Taunt. Tough 2. At end of turn: heal your leader 2.', tags: [], wip: false, type: 'unit', cost: { energy: 7, elements: [{ type: 'earth', amount: 2 }] }, attack: 2, hp: 3, keywords: { taunt: true, tough: 2 }, onPlay: [], onAttack: [], endOfTurn: [{ kind: 'heal', amount: 2, target: 'leader' }], startOfTurn: [] },
  { id: 'brood-mother', name: 'Brood Mother', element: 'nature', text: 'On play: summon two Mechanical Failures.', tags: [], wip: false, type: 'unit', cost: { energy: 9 }, attack: 2, hp: 3, keywords: {}, onPlay: [{ kind: 'summon', cardId: 'critter-token' }, { kind: 'summon', cardId: 'critter-token' }] },
  { id: 'hive-spawn', name: 'Hive Spawn', element: 'nature', text: 'On death: summon a Mechanical Failure.', tags: [], wip: false, type: 'unit', cost: { energy: 2, elements: [{ type: 'fire', amount: 2 }] }, attack: 2, hp: 2, keywords: { kamikaze: { kind: 'summon', cardId: 'critter-token' } } },
  { id: 'apex-predator', name: 'Apex Predator', element: 'nature', text: 'Growth: +1/0 per turn. Bloodlust: +1/0 per kill.', tags: [], wip: false, type: 'unit', cost: { energy: 5, elements: [{ type: 'nature', amount: 3 }] }, attack: 3, hp: 4, keywords: { bloodlust: { buff: { attack: 1, hp: 0 } }, growth: { attack: 1, hp: 0 } } },
  // --- Ramp payoffs: heavy nature pips (cap-locked to nature-4 leaders) with strong mechanics
  //     that Corpselock's banking reaches turns earlier than anyone else. ---
  { id: 'worldheart-wyrm', name: 'Worldheart Wyrm', element: 'nature', text: 'Strike Through. Bloodlust: +1/0 per kill.', tags: [], wip: false, type: 'unit', cost: { energy: 8, elements: [{ type: 'nature', amount: 2 }, { type: 'fire', amount: 1 }] }, attack: 5, hp: 5, keywords: { strikeThrough: true, bloodlust: { buff: { attack: 1, hp: 0 } } } },
  { id: 'grove-elder', name: 'Elder of the Grove', element: 'nature', text: 'Producer: 2 energy/turn. On play: draw a card.', tags: [], wip: false, type: 'unit', cost: { energy: 6 }, attack: 1, hp: 5, keywords: {}, onPlay: [{ kind: 'draw', amount: 1 }], onAttack: [], endOfTurn: [{ kind: 'energyNext', amount: 2 }], startOfTurn: [] },
  { id: 'verdant-cataclysm', name: 'Verdant Cataclysm', element: 'nature', text: 'Deal 3 damage to all enemies and heal all allies 2.', tags: [], wip: false, type: 'spell', cost: { energy: 9 }, effects: [{ kind: 'damage', amount: 3, target: 'all-enemy' }, { kind: 'heal', amount: 2, target: 'all-ally' }] },
  // --- Swarm payoffs: an anthem the wide board rides, and a carry the swarm protects with
  //     bodies (Brood Warlord pumps the team every turn — the swarm keeps it alive). ---
  { id: 'hivemind-surge', name: 'Hivemind Surge', element: 'nature', text: 'Give all allied units +1/+1.', tags: [], wip: false, type: 'spell', cost: { energy: 4 }, effects: [{ kind: 'buff', target: 'all-ally', stat: { attack: 1, hp: 1 } }] },
  { id: 'brood-warlord', name: 'Brood Warlord', element: 'nature', text: 'At end of turn: give all other allied units +1/0.', tags: [], wip: false, type: 'unit', cost: { energy: 6 }, attack: 2, hp: 5, keywords: {}, onPlay: [], onAttack: [], endOfTurn: [{ kind: 'buff', target: 'all-ally', stat: { attack: 1, hp: 0 } }], startOfTurn: [] },
  { id: 'sun-priest', name: 'Sun Priest', element: 'nature', text: 'Producer: 2 energy/turn.', tags: [], wip: false, type: 'unit', cost: { energy: 3 }, attack: 1, hp: 3, keywords: {}, onPlay: [], onAttack: [], endOfTurn: [{ kind: 'energyNext', amount: 2 }], startOfTurn: [] },
  { id: 'reef-raptor', name: 'Reef Raptor', element: 'water', text: 'Aquatic: +2/0 in Water.', tags: [], wip: false, type: 'unit', cost: { energy: 2, elements: [{ type: 'water', amount: 1 }] }, attack: 1, hp: 2, keywords: { aquatic: [{ kind: 'buff', target: 'self', stat: { attack: 2 } }] } },
  { id: 'tide-stalker', name: 'Tide Stalker', element: 'water', text: 'Sniper. Aquatic: +2/0 in Water.', tags: [], wip: false, type: 'unit', cost: { energy: 2, elements: [{ type: 'water', amount: 2 }] }, attack: 2, hp: 2, keywords: { sniper: true, aquatic: [{ kind: 'buff', target: 'self', stat: { attack: 2 } }] } },
  { id: 'crag-hawk', name: 'Crag Hawk', element: 'earth', text: 'Airborne. Sniper.', tags: [], wip: false, type: 'unit', cost: { energy: 3, elements: [{ type: 'water', amount: 1 }, { type: 'nature', amount: 1 }] }, attack: 2, hp: 2, keywords: { sniper: true, airborne: true } },
  { id: 'herd-driver', name: 'Herd Driver', element: 'nature', text: 'Each turn: move an enemy unit.', tags: [], wip: false, type: 'unit', cost: { energy: 5, elements: [{ type: 'water', amount: 1 }] }, attack: 2, hp: 4, keywords: {}, onPlay: [], onAttack: [], endOfTurn: [], startOfTurn: [{ kind: 'move', target: 'enemy' }] },
  { id: 'lullaby-spirit', name: 'Lullaby Spirit', element: 'water', text: 'Double Team. On hit: inflict Sleep.', tags: [], wip: false, type: 'unit', cost: { energy: 4, elements: [{ type: 'water', amount: 2 }] }, attack: 1, hp: 3, keywords: { doubleTeam: true }, onHit: { sleep: 1 } },
  { id: 'spiked-base', name: 'Spiked Base', element: 'earth', text: 'Grants Spike 1.', tags: [], wip: false, type: 'foundation', cost: { energy: 5, elements: [{ type: 'earth', amount: 2 }] }, attack: 2, hp: 4, keywords: {}, grants: { keywords: { spike: 1 } } },
  { id: 'taunt-totem', name: 'Taunt Totem', element: 'earth', text: 'Grants Taunt.', tags: [], wip: false, type: 'foundation', cost: { energy: 4, elements: [{ type: 'earth', amount: 2 }] }, attack: 2, hp: 4, keywords: {}, grants: { keywords: { taunt: true } } },
  { id: 'ward-stone', name: 'Ward Stone', element: 'water', text: 'Grants Shield 1.', tags: [], wip: false, type: 'foundation', cost: { energy: 7, elements: [{ type: 'earth', amount: 1 }, { type: 'water', amount: 1 }] }, attack: 2, hp: 4, keywords: {}, grants: { keywords: { shield: 1 } } },
  { id: 'lookout-perch', name: 'Lookout Perch', element: 'earth', text: 'Grants Sniper.', tags: [], wip: false, type: 'foundation', cost: { energy: 3, elements: [{ type: 'water', amount: 1 }, { type: 'earth', amount: 1 }] }, attack: 2, hp: 3, keywords: {}, grants: { keywords: { sniper: true } } },
  { id: 'launch-ramp', name: 'Launch Ramp', element: 'fire', text: 'Grants Overshot.', tags: [], wip: false, type: 'foundation', cost: { energy: 6, elements: [{ type: 'fire', amount: 2 }] }, attack: 3, hp: 3, keywords: {}, grants: { keywords: { overshot: true } } },
  { id: 'siege-platform', name: 'Siege Platform', element: 'fire', text: 'Grants Strike Through.', tags: [], wip: false, type: 'foundation', cost: { energy: 6, elements: [{ type: 'fire', amount: 2 }] }, attack: 2, hp: 4, keywords: {}, grants: { keywords: { strikeThrough: true } } },
  { id: 'forked-mount', name: 'Forked Mount', element: 'nature', text: 'Grants Branch Shot.', tags: [], wip: false, type: 'foundation', cost: { energy: 7, elements: [{ type: 'nature', amount: 2 }] }, attack: 2, hp: 4, keywords: {}, grants: { keywords: { branchShot: true } } },
  { id: 'undertow-base', name: 'Undertow Base', element: 'water', text: 'Grants Pierce.', tags: [], wip: false, type: 'foundation', cost: { energy: 6, elements: [{ type: 'water', amount: 2 }] }, attack: 2, hp: 4, keywords: {}, grants: { keywords: { pierce: true } } },
  { id: 'whetstone-altar', name: 'Whetstone Altar', element: 'earth', text: 'Grants Lethal.', tags: [], wip: false, type: 'foundation', cost: { energy: 7, elements: [{ type: 'nature', amount: 1 }, { type: 'earth', amount: 1 }] }, attack: 2, hp: 4, keywords: {}, grants: { keywords: { lethal: true } } },
  // Springboard ("Grants Battle Ready") removed: EVERY Foundation already grants free Battle
  // Ready to a unit bonding onto ground that was placed a prior turn (engine.ts `playUnit`) —
  // a universal rule, not a per-card ability. Authoring it again here was pure duplication.
  { id: 'twin-perch', name: 'Twin Perch', element: 'water', text: 'Grants Double Team.', tags: [], wip: false, type: 'foundation', cost: { energy: 5, elements: [{ type: 'water', amount: 2 }] }, attack: 2, hp: 4, keywords: {}, grants: { keywords: { doubleTeam: true } } },
  { id: 'roost-nest', name: 'Roost Nest', element: 'nature', text: 'Grants Airborne.', tags: [], wip: false, type: 'foundation', cost: { energy: 4, elements: [{ type: 'nature', amount: 2 }] }, attack: 2, hp: 3, keywords: {}, grants: { keywords: { airborne: true } } },
  { id: 'tidal-dock', name: 'Tidal Dock', element: 'water', text: 'Grants Aquatic.', tags: [], wip: false, type: 'foundation', cost: { energy: 3, elements: [{ type: 'water', amount: 2 }] }, attack: 2, hp: 3, keywords: {}, grants: { keywords: { aquatic: true } } },
  { id: 'reactive-plating', name: 'Reactive Plating', element: 'earth', text: 'Grants Polish: +1/0 when hit.', tags: [], wip: false, type: 'foundation', cost: { energy: 4, elements: [{ type: 'earth', amount: 3 }] }, attack: 2, hp: 4, keywords: {}, grants: { keywords: { polish: { stat: { attack: 1, hp: 0 } } } } },
  { id: 'rally-banner', name: 'Rally Banner', element: 'nature', text: 'Grants Bloodlust: +1/+1 per kill.', tags: [], wip: false, type: 'foundation', cost: { energy: 7, elements: [{ type: 'nature', amount: 3 }] }, attack: 2, hp: 4, keywords: {}, grants: { keywords: { bloodlust: { buff: { attack: 1, hp: 1 } } } } },
  { id: 'fertile-mound', name: 'Fertile Mound', element: 'nature', text: 'Grants Growth: +1/+1 per turn.', tags: [], wip: false, type: 'foundation', cost: { energy: 7, elements: [{ type: 'nature', amount: 2 }] }, attack: 2, hp: 4, keywords: {}, grants: { keywords: { growth: { attack: 1, hp: 1 } } } },
  { id: 'mana-geyser', name: 'Mana Geyser', element: 'nature', text: 'Grants Producer: 1 energy/turn.', tags: [], wip: false, type: 'foundation', cost: { energy: 4, elements: [{ type: 'nature', amount: 2 }] }, attack: 1, hp: 4, keywords: { producer: { amount: 1 } }, grants: { endOfTurn: [{ kind: 'energyNext', amount: 1 }] } },
  { id: 'phylactery', name: 'Phylactery', element: 'earth', text: 'Grants Zombified.', tags: [], wip: false, type: 'foundation', cost: { energy: 6, elements: [{ type: 'earth', amount: 2 }] }, attack: 2, hp: 4, keywords: {}, grants: { keywords: { zombified: true } } },
  { id: 'venom-gland', name: 'Venom Gland', element: 'nature', text: 'Grants On-hit Poison.', tags: [], wip: false, type: 'foundation', cost: { energy: 3, elements: [{ type: 'nature', amount: 3 }] }, attack: 2, hp: 3, keywords: {}, onHit: { poison: true }, grants: { onHit: { poison: true } } },
  { id: 'ember-anvil', name: 'Ember Anvil', element: 'fire', text: 'Grants On-hit Burn 1.', tags: [], wip: false, type: 'foundation', cost: { energy: 3, elements: [{ type: 'fire', amount: 3 }] }, attack: 2, hp: 3, keywords: {}, onHit: { burn: 1 }, grants: { onHit: { burn: 1 } } },
  { id: 'twin-fang-mount', name: 'Twin Fang Mount', element: 'earth', text: 'Grants Double Strike.', tags: [], wip: false, type: 'foundation', cost: { energy: 7, elements: [{ type: 'fire', amount: 1 }, { type: 'earth', amount: 1 }] }, attack: 2, hp: 4, keywords: {}, grants: { keywords: { doubleStrike: true } } },
  { id: 'lifewell-base', name: 'Lifewell Base', element: 'nature', text: 'Grants Healer: heal an ally 1/turn.', tags: [], wip: false, type: 'foundation', cost: { energy: 4, elements: [{ type: 'nature', amount: 1 }] }, attack: 2, hp: 4, keywords: {}, grants: { endOfTurn: [{ kind: 'heal', amount: 1, target: 'ally' }] } },
  { id: 'crows-nest', name: 'Crow\'s Nest', element: 'fire', text: 'Heights only. All units gain Strike Through.', tags: [], wip: false, type: 'environment', cost: { energy: 1, elements: [{ type: 'fire', amount: 1 }] }, lanes: ['heights'], effects: [{ kind: 'custom', note: 'All units gain Strike Through' }], grantKeywords: { strikeThrough: true } },
  { id: 'thornfield', name: 'Thornfield', element: 'earth', text: 'All units gain Spike 1.', tags: [], wip: false, type: 'environment', cost: { energy: 1, elements: [{ type: 'earth', amount: 1 }] }, lanes: [], effects: [{ kind: 'custom', note: 'All units gain Spike 1' }], grantKeywords: { spike: 1 } },
  { id: 'fortified-line', name: 'Fortified Line', element: 'earth', text: 'Ground only. All units gain Taunt.', tags: [], wip: false, type: 'environment', cost: { energy: 0, elements: [{ type: 'earth', amount: 1 }] }, lanes: ['ground'], effects: [{ kind: 'custom', note: 'All units gain Taunt' }], grantKeywords: { taunt: true } },
  { id: 'bunker', name: 'Bunker', element: 'earth', text: 'All units gain Tough 1.', tags: [], wip: false, type: 'environment', cost: { energy: 2, elements: [{ type: 'earth', amount: 1 }] }, lanes: [], effects: [{ kind: 'custom', note: 'All units gain Tough 1' }], grantKeywords: { tough: 1 } },
  { id: 'aegis-veil', name: 'Aegis Veil', element: 'water', text: 'All units gain Shield 1.', tags: [], wip: false, type: 'environment', cost: { energy: 2, elements: [{ type: 'earth', amount: 1 }] }, lanes: [], effects: [{ kind: 'custom', note: 'All units gain Shield 1' }], grantKeywords: { shield: 1 } },
  { id: 'sanctified-ground', name: 'Sanctified Ground', element: 'earth', text: 'All units gain Immunity.', tags: [], wip: false, type: 'environment', cost: { energy: 2, elements: [{ type: 'earth', amount: 1 }] }, lanes: [], effects: [{ kind: 'custom', note: 'All units gain Immunity' }], grantKeywords: { immunity: true } },
  { id: 'killing-fields', name: 'Killing Fields', element: 'earth', text: 'All units gain Lethal.', tags: [], wip: false, type: 'environment', cost: { energy: 3, elements: [{ type: 'nature', amount: 1 }] }, lanes: [], effects: [{ kind: 'custom', note: 'All units gain Lethal' }], grantKeywords: { lethal: true } },
  { id: 'thin-air', name: 'Thin Air', element: 'fire', text: 'All units gain Battle Ready.', tags: [], wip: false, type: 'environment', cost: { energy: 2, elements: [{ type: 'fire', amount: 1 }] }, lanes: [], effects: [{ kind: 'custom', note: 'All units gain Battle Ready' }], grantKeywords: { battleReady: true } },
  { id: 'crossfire-range', name: 'Crossfire Range', element: 'fire', text: 'Ground only. All units gain Branch Shot.', tags: [], wip: false, type: 'environment', cost: { energy: 2, elements: [{ type: 'nature', amount: 1 }] }, lanes: ['ground'], effects: [{ kind: 'custom', note: 'All units gain Branch Shot' }], grantKeywords: { branchShot: true } },
  { id: 'high-ground', name: 'High Ground', element: 'fire', text: 'All units gain Overshot and Splash Damage.', tags: [], wip: false, type: 'environment', cost: { energy: 4, elements: [{ type: 'fire', amount: 2 }] }, lanes: [], effects: [{ kind: 'custom', note: 'All units gain Overshot and Splash Damage' }], grantKeywords: { overshot: true, splashDamage: true } },
  { id: 'spawning-pool', name: 'Spawning Pool', element: 'nature', text: 'Ground only. All units gain Bloodlust: +1/0 per kill.', tags: [], wip: false, type: 'environment', cost: { energy: 1, elements: [{ type: 'nature', amount: 2 }] }, lanes: ['ground'], effects: [{ kind: 'custom', note: 'All units gain Bloodlust: +1/0' }], grantKeywords: { bloodlust: { buff: { attack: 1, hp: 0 } } } },
  { id: 'overgrowth', name: 'Overgrowth', element: 'nature', text: 'All units gain Growth: +1/0 per turn.', tags: [], wip: false, type: 'environment', cost: { energy: 1, elements: [{ type: 'nature', amount: 1 }] }, lanes: [], effects: [{ kind: 'custom', note: 'All units gain Growth: +1/0' }], grantKeywords: { growth: { attack: 1, hp: 0 } } },
  { id: 'tundra', name: 'Tundra', element: 'water', text: 'Units entering this lane are Frozen.', tags: [], wip: false, type: 'environment', cost: { energy: 1, elements: [{ type: 'water', amount: 1 }] }, lanes: [], effects: [{ kind: 'applyStatus', target: 'any', status: 'freeze' }] },
  // Water only: the one Environment that opens the Water lane to everyone — units in it
  // gain Aquatic, so non-swimmers stop drowning (see engine/drowning.ts).
  { id: 'shallows', name: 'Shallows', element: 'water', text: 'Water only. All units in this lane gain Aquatic.', tags: [], wip: false, type: 'environment', cost: { energy: 0, elements: [{ type: 'water', amount: 1 }] }, lanes: ['water'], effects: [{ kind: 'custom', note: 'All units gain Aquatic' }], grantKeywords: { aquatic: true } },
>>>>>>> Stashed changes
  { id: 'lullaby-grove', name: 'Lullaby Grove', element: 'water', text: 'Units entering this lane fall Asleep.', tags: [], wip: false, type: 'environment', cost: { energy: 1, elements: [{ type: 'water', amount: 1 }] }, lanes: [], effects: [{ kind: 'applyStatus', amount: 1, target: 'any', status: 'sleep' }] },
  { id: 'healing-spring', name: 'Healing Spring', element: 'nature', text: 'Units entering this lane heal 2.', tags: [], wip: false, type: 'environment', cost: { energy: 1 }, lanes: [], effects: [{ kind: 'heal', amount: 2, target: 'any' }] },
  // Recurring-tick hazards: applyEnvironmentEffects re-runs an environment's effects on EVERY
  // unit in the lane (both players) each combat, so these bite/heal once per turn.
  // Cinder Field powers the Polish loop — a Polish unit takes the 1 self-damage each turn and
  // triggers, snowballing (e.g. Pebble Snake +1/0, Bowling Boulder +0/+2). Budget: the symmetric
  // hazards are priced well under the strict all-units ×2.5 multiplier (molten-floor's conditional
  // Burn = fire:1 → 0.5; sludge 1.0; tundra 2.5). A GUARANTEED 1 dmg/turn to all is ~3× molten-floor
  // → energy 1 + fire 1 = 1.5 budget. Symmetric (hits your own bodies too), which is the drawback.
  { id: 'cinder-field', name: 'Cinder Field', element: 'fire', text: 'Deals 1 damage to every unit in this lane each turn.', tags: [], wip: false, type: 'environment', cost: { energy: 1, elements: [{ type: 'fire', amount: 1 }] }, lanes: [], effects: [{ kind: 'damage', amount: 1, target: 'any' }] },
  // Sacred Spring — the mirror of Cinder Field: recurring sustain instead of chip. Same 1.5 budget
  // (heal ≈ damage as a per-turn 1-point swing to all; symmetric, so it tops off enemies too).
  // (Note: healing-spring above already heals lane units each combat too — this is the element-gated, lower-rate sibling.)
<<<<<<< Updated upstream
  { id: 'sacred-spring', name: 'Sacred Spring', element: 'nature', text: 'Heals every unit in this lane 1 each turn.', tags: [], wip: false, type: 'environment', cost: { energy: 1, elements: [{ type: 'nature', amount: 1 }] }, lanes: [], effects: [{ kind: 'heal', amount: 1, target: 'any' }] },
  { id: 'shifting-sands', name: 'Shifting Sands', element: 'earth', text: 'All units gain Mover (self): wander each turn.', tags: [], wip: false, type: 'environment', cost: { energy: 3 }, lanes: [], effects: [{ kind: 'custom', note: 'All units wander each turn' }], grantKeywords: { mover: { scope: 'self', trigger: 'endOfTurn' } } },
=======
  { id: 'sacred-spring', name: 'Sacred Spring', element: 'nature', text: 'Heals every unit in this lane 1 each turn.', tags: [], wip: false, type: 'environment', cost: { energy: 1 }, lanes: [], effects: [{ kind: 'heal', amount: 1, target: 'any' }] },
  { id: 'shifting-sands', name: 'Shifting Sands', element: 'earth', text: 'All units gain Mover (self): wander each turn.', tags: [], wip: false, type: 'environment', cost: { energy: 0, elements: [{ type: 'water', amount: 1 }] }, lanes: [], effects: [{ kind: 'custom', note: 'All units wander each turn' }], grantKeywords: { mover: { scope: 'self', trigger: 'endOfTurn' } } },
>>>>>>> Stashed changes
  { id: 'sig-pyre-bloom', name: 'Steam Bath', element: 'fire', text: 'Signature: inflict Burn 2 on all enemy units.', tags: ['signature'], wip: false, type: 'spell', cost: { energy: 0 }, effects: [{ kind: 'applyStatus', amount: 2, target: 'all-enemy', status: 'burn' }] },
  // Delivered by Kedou's UPGRADED Steam Bath (Adventure only), which conjures it rather than
  // trying to do both jobs on one card: Steam Bath clears the board that exists, this taxes
  // everything played into it afterwards.
  { id: 'sig-scalding-veil', name: 'Scalding Veil', element: 'fire', text: 'Your units scald what they strike: they gain On-Hit Burn 2.', tags: ['signature'], wip: false, type: 'spell', cost: { energy: 0 }, effects: [{ kind: 'buff', target: 'all-ally', onHit: { burn: 2 } }] },
  { id: 'sig-final-charge', name: 'Overexert', element: 'fire', text: 'Signature: all allies gain +1/0 and a bonus attack.', tags: ['signature'], wip: false, type: 'spell', cost: { energy: 0 }, effects: [{ kind: 'buff', target: 'all-ally', stat: { attack: 1 } }, { kind: 'extraAction', target: 'all-ally' }] },
  { id: 'sig-deep-freeze', name: 'Masking', element: 'water', text: 'Signature: freeze all enemy units and give one of your units Undershot and Double Strike.', tags: ['signature'], wip: false, type: 'spell', cost: { energy: 0 }, effects: [{ kind: 'applyStatus', target: 'all-enemy', status: 'freeze' }, { kind: 'buff', target: 'ally', keywords: { undershot: true, doubleStrike: true } }] },
  { id: 'sig-time-stop', name: 'Time Stop', element: 'nature', text: 'Signature: put all enemy units to Sleep.', tags: ['signature'], wip: false, type: 'spell', cost: { energy: 0 }, effects: [{ kind: 'applyStatus', amount: 2, target: 'all-enemy', status: 'sleep' }] },
<<<<<<< Updated upstream
  { id: 'sig-overflow', name: 'Stage 4', element: 'nature', text: 'Signature: all cards in your hand cost 2 less this turn.', tags: ['signature'], wip: false, type: 'spell', cost: { energy: 0 }, effects: [{ kind: 'costMod', amount: -2, cardType: 'all' }] },
  { id: 'sig-oblivion', name: 'Happy Hour', element: 'water', text: 'Signature: expel every enemy unit to the opponent\'s hand (overflowing it).', tags: ['signature'], wip: false, type: 'spell', cost: { energy: 0 }, effects: [{ kind: 'expel', target: 'all-enemy' }] },
  { id: 'sig-swarm-call', name: '8Bits', element: 'nature', text: 'Signature: summon a Techtacle (Lethal, True Shield, Airborne) in every lane.', tags: ['signature'], wip: false, type: 'spell', cost: { energy: 0 }, effects: [{ kind: 'summon', cardId: 'critter-elite', lane: 'heights' }, { kind: 'summon', cardId: 'critter-elite', lane: 'ground1' }, { kind: 'summon', cardId: 'critter-elite', lane: 'ground2' }, { kind: 'summon', cardId: 'critter-elite', lane: 'water' }] },
  { id: 'sig-thornburst', name: 'Swift Kill', element: 'earth', text: 'Signature: deal 5 to an enemy; on a kill, chain 4, 3, 2… to the next-weakest enemy.', tags: ['signature'], wip: false, type: 'spell', cost: { energy: 0 }, effects: [{ kind: 'damage', amount: 5, target: 'enemy', chainDiminish: true }] },
  { id: 'sig-equalize', name: 'Reflections of Omniscience', element: 'nature', text: 'Signature: reduce every enemy unit by -2/-2.', tags: ['signature'], wip: false, type: 'spell', cost: { energy: 0 }, effects: [{ kind: 'debuff', target: 'all-enemy', stat: { attack: 2, hp: 2 } }] },
  { id: 'sig-keystone', name: 'Fortune Foretold', element: 'earth', text: 'Signature Foundation: grants +1/+3, Taunt, Tough 1 and Spike 2 to the unit above it.', tags: ['signature'], wip: false, type: 'foundation', cost: { energy: 0 }, attack: 2, hp: 4, keywords: {}, grants: { stat: { attack: 1, hp: 3 }, keywords: { taunt: true, spike: 2, tough: 1 } } },
  { id: 'sig-ascension', name: 'Death Goddess\' Will', element: 'nature', text: 'Signature Foundation: grants Immunity, Zombified and Growth +2/+2 to the unit above it.', tags: ['signature'], wip: false, type: 'foundation', cost: { energy: 0 }, attack: 2, hp: 3, keywords: {}, grants: { keywords: { immunity: true, zombified: true, growth: { attack: 2, hp: 2 } } } },
  { id: 'sig-pathmaker', name: 'Guardian of Ruins', element: 'water', text: 'Signature: give an ally Immunity and Undershot. All environments cost 0 energy this turn. Conjure a Tundra.', tags: ['signature'], wip: false, type: 'spell', cost: { energy: 0 }, effects: [{ kind: 'buff', target: 'ally', keywords: { immunity: true, undershot: true } }, { kind: 'costMod', amount: -99, cardType: 'environment' }, { kind: 'conjure', target: 'self', cardId: 'tundra' }] },
  { id: 'ringleader-avatar', name: 'Ring Leader, Incarnate', element: 'nature', text: 'Leader-unit. Airborne, Taunt, Immunity. If it dies, you lose.', tags: ['signature'], wip: false, type: 'unit', cost: { energy: 0 }, attack: 0, hp: 30, keywords: { airborne: true, taunt: true, immunity: true } },
  { id: 'sig-incarnate', name: 'Core Component', element: 'nature', text: 'Signature: your leader-unit gains Shield 1, Bloodlust +0/+1 and Undershot.', tags: ['signature'], wip: false, type: 'spell', cost: { energy: 0 }, effects: [{ kind: 'applyStatus', amount: 1, target: 'leaderUnit', status: 'shield' }, { kind: 'buff', target: 'leaderUnit', keywords: { undershot: true, bloodlust: { buff: { attack: 0, hp: 1 } } } }] },
  { id: 'iron-ward', name: 'Iron Ward', element: 'water', text: 'Give an ally unit Shield 1.', tags: [], wip: false, type: 'spell', cost: { energy: 2, elements: [{ type: 'water', amount: 1 }] }, effects: [{ kind: 'applyStatus', amount: 1, target: 'ally', status: 'shield' }] },
  { id: 'purify', name: 'Purify', element: 'water', text: 'Remove all status effects from an allied unit.', tags: [], wip: false, type: 'spell', cost: { energy: 1, elements: [{ type: 'water', amount: 1 }] }, effects: [{ kind: 'cleanse', target: 'ally' }] },
=======
  // Ramp's payoff is a turn where everything comes out at once, so the Signature stops
  // paying in raw resources (banks + 2 cards, which a ramp deck often already has) and
  // starts paying in a CASCADE: from here on, playing a card gives you another card.
  { id: 'sig-overflow', name: 'Stage 4', element: 'nature', text: 'Signature: fill every element bank to its cap. From now on, every card you play conjures a random card into your hand.', tags: ['signature'], wip: false, type: 'spell', cost: { energy: 0 }, effects: [{ kind: 'bankMax' }, { kind: 'conjureOnPlay' }] },
  { id: 'sig-oblivion', name: 'Happy Hour', element: 'water', text: 'Signature: expel every enemy unit to the opponent\'s hand (overflowing it).', tags: ['signature'], wip: false, type: 'spell', cost: { energy: 0 }, effects: [{ kind: 'expel', target: 'all-enemy' }] },
  { id: 'sig-swarm-call', name: '8Bits', element: 'nature', text: 'Signature: summon a Techtacle (Lethal, True Shield, Airborne) in every lane.', tags: ['signature'], wip: false, type: 'spell', cost: { energy: 0 }, effects: [{ kind: 'summon', cardId: 'critter-elite', lane: 'heights' }, { kind: 'summon', cardId: 'critter-elite', lane: 'ground1' }, { kind: 'summon', cardId: 'critter-elite', lane: 'ground2' }, { kind: 'summon', cardId: 'critter-elite', lane: 'water' }] },
  // Eksana herself, summoned by Call in a Favour. NO Battle Ready: a summon is summoning-sick,
  // so she cannot act the turn she arrives — she just stands there, a 3/1, for a full
  // opponent's turn before she can ever swing. That is the counterplay window the power was
  // missing: previously she was unkillable-in-practice on the turn she showed up (Battle Ready
  // + immediate Brittle exit), so the only way to answer her was to already have removal ready
  // BEFORE she was summoned. Now any attacker that can kill a 1-HP body answers her for free,
  // which is why the power's cost came down from 20 to 12 alongside the change — she is a real
  // bet, not a guaranteed hit.
  //
  // AIRBORNE is what makes Sniper unconditional — the gate is `isHeights(lane) || airborne`, so
  // without it she can only choose her target when summoned into a Heights column. Together
  // they mean she is dropped anywhere and still picks the mark. Pierce ignores the bodyguard
  // (Shield/Taunt/Tough); Strike Through means even a blocked attack still reaches the leader.
  //
  // NO LETHAL: the kill is not guaranteed, it is EARNED — 3 attack has to actually be enough.
  // Bloodlust then pays for the job by conjuring No Witnesses, so the contract chain is
  // unlocked by her connecting rather than handed over by the power. Brittle destroys her the
  // instant that attack resolves (whether or not it killed), so she never gets a second swing.
  // At 1 HP she sits well under EVASIVE_HP_CAP, which Airborne would otherwise trip.
  { id: 'eksana-herself', name: 'Eksana, In Person', element: 'earth', text: 'Sniper, Airborne, Pierce, Strike Through, Brittle. Bloodlust: add No Witnesses to your hand.', tags: ['token'], wip: false, type: 'unit', cost: { energy: 0 }, attack: 3, hp: 2, keywords: { sniper: true, airborne: true, pierce: true, strikeThrough: true, brittle: true, bloodlust: { effects: [{ kind: 'conjure', cardId: 'sig-no-witnesses' }] } } },
  // ── Eksana's contract chain ──────────────────────────────────────────────────────────────
  // Her old Signature did 5/4/3/2 automatically inside ONE cast. The same numbers now arrive as
  // four separate CARDS, each conjured only if the previous one killed. That change is the
  // whole point: every link is a card the player must actually play, and playing cards is what
  // discounts Call in a Favour — so a job that goes well pays for the next job. It also hands
  // target choice back to the player, where the old auto-chain always hit the next-weakest.
  { id: 'sig-thornburst', name: 'Swift Kill', element: 'earth', text: 'Signature: deal 5 to an enemy. On a kill, add Loose Ends to your hand.', tags: ['signature'], wip: false, type: 'spell', cost: { energy: 0 }, effects: [{ kind: 'damage', amount: 5, target: 'enemy', conjureOnKill: 'sig-loose-ends' }] },
  { id: 'sig-loose-ends', name: 'Loose Ends', element: 'earth', text: 'Deal 4 to an enemy. On a kill, add No Witnesses to your hand.', tags: ['signature'], wip: false, type: 'spell', cost: { energy: 0 }, effects: [{ kind: 'damage', amount: 4, target: 'enemy', conjureOnKill: 'sig-no-witnesses' }] },
  { id: 'sig-no-witnesses', name: 'No Witnesses', element: 'earth', text: 'Deal 3 to an enemy. On a kill, add Clean Exit to your hand.', tags: ['signature'], wip: false, type: 'spell', cost: { energy: 0 }, effects: [{ kind: 'damage', amount: 3, target: 'enemy', conjureOnKill: 'sig-clean-exit' }] },
  { id: 'sig-clean-exit', name: 'Clean Exit', element: 'earth', text: 'Deal 2 to an enemy.', tags: ['signature'], wip: false, type: 'spell', cost: { energy: 0 }, effects: [{ kind: 'damage', amount: 2, target: 'enemy' }] },
  // Poison rather than an HP cut: Poison BLOCKS buffs, so a disarmed unit cannot be repaired.
  // That makes the attack reduction stick, which is the whole point of the upgraded version.
  { id: 'sig-equalize', name: 'Reflections of Omniscience', element: 'nature', text: 'Signature: every enemy unit loses 2 attack and is Poisoned.', tags: ['signature'], wip: false, type: 'spell', cost: { energy: 0 }, effects: [{ kind: 'debuff', target: 'all-enemy', stat: { attack: 2 } }, { kind: 'applyStatus', amount: 1, target: 'all-enemy', status: 'poison' }] },
  { id: 'sig-keystone', name: 'Fortune Foretold', element: 'earth', text: 'Signature Foundation: grants Taunt, Tough 1 and Spike 2 to the unit above it.', tags: ['signature'], wip: false, type: 'foundation', cost: { energy: 0 }, attack: 3, hp: 5, keywords: {}, grants: { keywords: { taunt: true, spike: 2, tough: 1 } } },
  // A SPELL, not a Foundation. As ground it granted the same three keywords, but only to a unit
  // BONDED ON TOP OF IT — so the Signature arrived, sat in a lane doing nothing, and paid off a
  // turn later on a body that had to be played into it. That is the wrong shape for a card
  // delivered at half HP: at that point the board you want to save already exists. As a spell it
  // lands on any unit ALREADY IN PLAY, immediately. It gives up the 3/4 body the Foundation had,
  // which is the price of not having to wait. All three keywords are in the grantable subset, so
  // a plain `buff` wires them up completely (see `grantableKeywordsShape` in schema.ts).
  { id: 'sig-ascension', name: 'Death Goddess\' Will', element: 'nature', text: 'Signature: an ally gains Immunity, Zombified and Growth +2/+2.', tags: ['signature'], wip: false, type: 'spell', cost: { energy: 0 }, effects: [{ kind: 'buff', target: 'ally', keywords: { immunity: true, zombified: true, growth: { attack: 2, hp: 2 } } }] },
  { id: 'sig-pathmaker', name: 'Guardian of Ruins', element: 'water', text: 'Signature: give an ally Immunity and Pierce. All environments cost 0 energy this turn. Conjure a Tundra.', tags: ['signature'], wip: false, type: 'spell', cost: { energy: 0 }, effects: [{ kind: 'buff', target: 'ally', keywords: { immunity: true, pierce: true } }, { kind: 'costMod', amount: -99, cardType: 'environment' }, { kind: 'conjure', target: 'self', cardId: 'tundra' }] },
  { id: 'ringleader-avatar', name: 'Ring Leader, Incarnate', element: 'nature', text: 'Leader-unit. Airborne, Taunt, Immunity. If it dies, you lose.', tags: ['signature'], wip: false, type: 'unit', leaderUnit: true, cost: { energy: 0 }, attack: 0, hp: 30, keywords: { airborne: true, taunt: true, immunity: true } }, // exempt from EVASIVE_HP_CAP: this HP is the leader's own HP by design, not a freely-chosen stat
  { id: 'sig-incarnate', name: 'Core Component', element: 'nature', text: 'Signature: your leader-unit gains Shield 1, Bloodlust +0/+1 and Pierce.', tags: ['signature'], wip: false, type: 'spell', cost: { energy: 0 }, effects: [{ kind: 'applyStatus', amount: 1, target: 'leaderUnit', status: 'shield' }, { kind: 'buff', target: 'leaderUnit', keywords: { pierce: true, bloodlust: { buff: { attack: 0, hp: 1 } } } }] },
  { id: 'iron-ward', name: 'Iron Ward', element: 'water', text: 'Give an ally unit Shield 1.', tags: [], wip: false, type: 'spell', cost: { energy: 1, elements: [{ type: 'earth', amount: 1 }] }, effects: [{ kind: 'applyStatus', amount: 1, target: 'ally', status: 'shield' }] },

  // ═══════════════════════════════════════════════════════════════════════════════════════
  //  UNIQUENESS PASS — units built on the mechanics the pool owned but had never printed on
  //  a body. Before this block: ZERO units carried Zombified, the Producer/Mover/Expel/Debuff
  //  keywords, an on-hit Freeze, or the `extraAction`/`costMod`/`discountHand`/`setStats`/
  //  `amountFrom` effects, and Overshot, Splash Damage, Double Strike, Immunity, Battle Ready,
  //  Healer and Metamorphosis had exactly ONE carrier each. Every card here is a pair of
  //  abilities no other unit combines, kept inside its element's toolkit unless the splash is
  //  the point. Eleven units that merely re-stated another card's niche were removed alongside.
  // ═══════════════════════════════════════════════════════════════════════════════════════

  // --- FIRE: hit first, hit hard, trade the body ---
  // Battle Ready + Strike Through: the only unit that reaches the leader on the turn it lands
  // WITHOUT giving up on the board — Overshot skips the blocker, this one kills it too.
  { id: 'vanguard-cinder', name: 'Vanguard Cinder', element: 'fire', text: 'Battle Ready. Strike Through.', tags: [], wip: false, type: 'unit', cost: { energy: 5, elements: [{ type: 'fire', amount: 2 }] }, attack: 3, hp: 1, keywords: { battleReady: true, strikeThrough: true } },
  // Splash Damage was a single vanilla body (Glacial Ray). Attaching a STATUS to it turns one
  // attack into three burning lanes — the widest status application in the pool.
  { id: 'ashfall-mortar', name: 'Ashfall Mortar', element: 'fire', text: 'Splash: hits its lane and both neighbours. On hit: inflict Burn 1.', tags: [], wip: false, type: 'unit', cost: { energy: 5, elements: [{ type: 'fire', amount: 2 }] }, attack: 2, hp: 3, keywords: { splashDamage: true }, onHit: { burn: 1 } },
  // Double Strike + Brittle: two hits, then it is gone. Brittle normally refunds a one-shot
  // reach attacker; here it refunds the game's most expensive attack keyword instead.
  { id: 'twinflame-zealot', name: 'Twinflame Zealot', element: 'fire', text: 'Double Strike. Brittle: attacks (twice), then destroys itself.', tags: [], wip: false, type: 'unit', cost: { energy: 4, elements: [{ type: 'fire', amount: 1 }] }, attack: 3, hp: 1, keywords: { doubleStrike: true, brittle: true } },
  // Overshot + Battle Ready — reach that does not wait a turn. Priced as the two most
  // expensive keywords in the table on the smallest body that can carry them.
  { id: 'skyfall-lance', name: 'Skyfall Lance', element: 'fire', text: 'Overshot. Battle Ready.', tags: [], wip: false, type: 'unit', cost: { energy: 6, elements: [{ type: 'fire', amount: 2 }] }, attack: 2, hp: 1, keywords: { overshot: true, battleReady: true } },
  // The first unit to modify COSTS. `costMods` is cleared at your own turn end, so this is a
  // one-turn tempo burst you build a hand around, not a permanent discount.
  { id: 'emberwright', name: 'Emberwright', element: 'fire', text: 'At entry: every card you play for the rest of this turn costs 1 less.', tags: [], wip: false, type: 'unit', cost: { energy: 3 }, attack: 1, hp: 3, keywords: {}, onPlay: [{ kind: 'costMod', amount: -1, cardType: 'all' }] },
  // Countdown as a RECURRING board sweep rather than a one-shot bomb (Powder Keg) or a single
  // snipe (Cinder Vigil): every turn it survives, the whole enemy board burns again.
  { id: 'cinder-clockwork', name: 'Cinder Clockwork', element: 'fire', text: 'Countdown 1, repeating: inflict Burn 1 on every enemy.', tags: [], wip: false, type: 'unit', cost: { energy: 6, elements: [{ type: 'fire', amount: 2 }] }, attack: 1, hp: 4, keywords: { countdown: { turns: 1, effects: [{ kind: 'applyStatus', amount: 1, target: 'all-enemy', status: 'burn' }], repeat: true } } },
  // Every other Kamikaze in the pool is aimed at the enemy. This one pays its team instead, so
  // trading it off is the opponent's problem rather than their reward.
  { id: 'pyre-martyr', name: 'Pyre Martyr', element: 'fire', text: 'On death: all your other units gain +1/+1.', tags: [], wip: false, type: 'unit', cost: { energy: 4, elements: [{ type: 'fire', amount: 2 }] }, attack: 2, hp: 2, keywords: { kamikaze: { kind: 'buff', target: 'all-ally', stat: { attack: 1, hp: 1 } } } },

  // --- WATER: pick your targets, deny theirs, decide where everything stands ---
  // The Expel KEYWORD's first carrier: a bounce stapled to a body, so the tempo swing leaves
  // something behind instead of costing a card the way Peel Back does.
  { id: 'undertow-herald', name: 'Undertow Herald', element: 'water', text: 'Aquatic. At entry: return an enemy unit to its owner\'s hand.', tags: [], wip: false, type: 'unit', cost: { energy: 5, elements: [{ type: 'water', amount: 2 }] }, attack: 1, hp: 4, keywords: { aquatic: true, expel: { scope: 'enemy' } } },
  // The Mover KEYWORD's first carrier, and the only repeatable ALLY reposition in the pool —
  // every other mover shoves an enemy. Walks a Sniper up to the Heights, a swimmer into Water.
  { id: 'riptide-shepherd', name: 'Riptide Shepherd', element: 'water', text: 'At the end of your turn: move one of your units to another lane.', tags: [], wip: false, type: 'unit', cost: { energy: 2, elements: [{ type: 'water', amount: 1 }] }, attack: 2, hp: 3, keywords: { mover: { scope: 'ally', trigger: 'endOfTurn' } } },
  // On-hit FREEZE existed in the schema and on no card at all. Double Team lets two of them
  // hold one lane and freeze everything that walks into it.
  { id: 'glacier-warden', name: 'Glacier Warden', element: 'water', text: 'Double Team. On hit: Freeze.', tags: [], wip: false, type: 'unit', cost: { energy: 6, elements: [{ type: 'water', amount: 2 }] }, attack: 1, hp: 5, keywords: { doubleTeam: true }, onHit: { freeze: true } },
  // Healer's second carrier, and the first RECURRING one: Reef Nurse heals once on entry, this
  // heals the whole board every turn it lives.
  { id: 'deepwater-chirurgeon', name: 'Deepwater Chirurgeon', element: 'water', text: 'At the end of your turn: heal all your other units 2.', tags: [], wip: false, type: 'unit', cost: { energy: 6, elements: [{ type: 'water', amount: 1 }] }, attack: 1, hp: 3, keywords: { healer: { amount: 2, target: 'all-ally', trigger: 'endOfTurn' } } },
  // Pierce + Sniper: reaches ANY lane from the Heights and ignores everything standing in it.
  // Water's two targeting keywords have never been printed together.
  { id: 'abyssal-harpooner', name: 'Abyssal Harpooner', element: 'water', text: 'Sniper. Pierce.', tags: [], wip: false, type: 'unit', cost: { energy: 3, elements: [{ type: 'water', amount: 2 }] }, attack: 2, hp: 2, keywords: { sniper: true, pierce: true } },
  // ELEMENT ramp, as against the generic ramp every Producer gives: it fills the Water bank
  // itself, which is the resource pips are actually paid from.
  { id: 'brine-conduit', name: 'Brine Conduit', element: 'water', text: 'Aquatic. At entry: bank 2 Water energy.', tags: [], wip: false, type: 'unit', cost: { energy: 3, elements: [{ type: 'water', amount: 1 }] }, attack: 1, hp: 3, keywords: { aquatic: true }, onPlay: [{ kind: 'energy', amount: 2, element: 'water' }] },

  // --- NATURE: start small, snowball, out-resource ---
  // The pool's second Metamorphosis line (Chrysalis Grub was the only one). Slower than the
  // Grub and it evolves into a threat that keeps growing, rather than a finished body.
  { id: 'thistle-cub', name: 'Thistle Cub', element: 'nature', text: 'Metamorphosis: after 4 turns, becomes a Bramble Tyrant.', tags: [], wip: false, type: 'unit', cost: { energy: 1, elements: [{ type: 'nature', amount: 1 }] }, attack: 1, hp: 2, keywords: { metamorphosis: { everyTurns: 4, into: 'bramble-tyrant' } } },
  { id: 'bramble-tyrant', name: 'Bramble Tyrant', element: 'nature', text: 'Lethal. Growth: +1/0 each turn.', tags: [], wip: false, type: 'unit', cost: { energy: 7, elements: [{ type: 'nature', amount: 2 }] }, attack: 3, hp: 4, keywords: { lethal: true, growth: { attack: 1, hp: 0 } } },
  // The Producer KEYWORD's first carrier — every existing ramp unit hand-authors the same
  // end-of-turn effect, so the keyword (and its Producer badge in the UI) was dead data.
  { id: 'spore-matron', name: 'Spore Matron', element: 'nature', text: 'Producer: 1 energy per turn. On hit: inflict Poison.', tags: [], wip: false, type: 'unit', cost: { energy: 3, elements: [{ type: 'nature', amount: 2 }] }, attack: 1, hp: 3, keywords: { producer: { amount: 1 } }, onHit: { poison: true } },
  // Ramp that cannot be answered on the ground. HP sits at the evasive cap's edge on purpose.
  { id: 'verdant-chorus', name: 'Verdant Chorus', element: 'nature', text: 'Airborne. Producer: 2 energy per turn.', tags: [], wip: false, type: 'unit', cost: { energy: 4, elements: [{ type: 'nature', amount: 2 }] }, attack: 1, hp: 3, keywords: { airborne: true, producer: { amount: 2 } } },
  // Lethal kills whatever it touches; Bloodlust pays it for each one. Nature's two payoff
  // keywords finally on the same body — the kill engine the element implied but never had.
  { id: 'fangroot-stalker', name: 'Fangroot Stalker', element: 'nature', text: 'Lethal. Bloodlust: +1/0 per kill.', tags: [], wip: false, type: 'unit', cost: { energy: 6, elements: [{ type: 'nature', amount: 3 }] }, attack: 2, hp: 2, keywords: { lethal: true, bloodlust: { buff: { attack: 1, hp: 0 } } } },
  // Branch Shot hits BOTH neighbouring lanes, so an on-hit rider applies twice per attack.
  { id: 'splitvine-archer', name: 'Splitvine Archer', element: 'nature', text: 'Branch Shot. On hit: inflict Poison.', tags: [], wip: false, type: 'unit', cost: { energy: 5, elements: [{ type: 'nature', amount: 2 }] }, attack: 2, hp: 1, keywords: { branchShot: true }, onHit: { poison: true } },
  // Sacrifice has only ever been offered at max 1. Eating TWO allies makes it the pool's real
  // payoff for a wide board, and Growth means the body it becomes keeps climbing.
  { id: 'grafted-colossus', name: 'Grafted Colossus', element: 'nature', text: 'May sacrifice up to 2 allies on play, each granting +2/+2. Growth: +0/+1 each turn.', tags: [], wip: false, type: 'unit', cost: { energy: 3, elements: [{ type: 'nature', amount: 3 }] }, attack: 3, hp: 3, keywords: { sacrifice: { max: 2, buff: { attack: 2, hp: 2 } }, growth: { attack: 0, hp: 1 } } },

  // --- EARTH: absorb, punish attackers, win the long game ---
  // ZOMBIFIED had no carrier anywhere in the pool — it existed only as an Environment grant
  // (Graveyard). On a Taunt body it is the wall that has to be killed twice.
  { id: 'barrow-revenant', name: 'Barrow Revenant', element: 'earth', text: 'Taunt. Zombified: revives once at 1 HP.', tags: [], wip: false, type: 'unit', cost: { energy: 4, elements: [{ type: 'earth', amount: 2 }] }, attack: 2, hp: 3, keywords: { taunt: true, zombified: true } },
  // The other half of the Zombified idea: the punishment sticks around after the kill, so
  // clearing it costs the attacker Spike damage twice over.
  { id: 'tombstone-warden', name: 'Tombstone Warden', element: 'earth', text: 'Spike 2. Zombified: revives once at 1 HP.', tags: [], wip: false, type: 'unit', cost: { energy: 6, elements: [{ type: 'earth', amount: 2 }] }, attack: 1, hp: 4, keywords: { spike: 2, zombified: true } },
  // The Debuff KEYWORD's first carrier, and the pool's only board-wide shrink — Wilt answers
  // one unit, this answers a whole developed board at once.
  { id: 'cairn-judge', name: 'Cairn Judge', element: 'earth', text: 'At entry: every enemy unit gets -1/0.', tags: [], wip: false, type: 'unit', cost: { energy: 8, elements: [{ type: 'earth', amount: 1 }] }, attack: 1, hp: 4, keywords: { debuff: { attack: 1, target: 'all-enemy' } } },
  // Immunity's second carrier (the first is a Foundation grant). Taunt forces the attack;
  // Immunity means no spell, status or ability can move it out of the way instead.
  { id: 'obsidian-aegis', name: 'Obsidian Aegis', element: 'earth', text: 'Taunt. Immunity: unaffected by spells, abilities and statuses.', tags: [], wip: false, type: 'unit', cost: { energy: 5, elements: [{ type: 'earth', amount: 2 }] }, attack: 1, hp: 4, keywords: { taunt: true, immunity: true } },
  // True Shield blocks the turn's damage; Polish pays it for the hit it just shrugged off, so
  // the two keywords feed each other instead of merely stacking.
  { id: 'mirror-bastion', name: 'Mirror Bastion', element: 'earth', text: 'True Shield. Polish: gains +0/+1 whenever it is hit.', tags: [], wip: false, type: 'unit', cost: { energy: 5, elements: [{ type: 'earth', amount: 3 }] }, attack: 1, hp: 4, keywords: { trueShield: true, polish: { stat: { attack: 0, hp: 1 } } } },
  // `amountFrom: 'targetAttack'` had no carrier at all: removal that scales with the THREAT.
  // Dead against a wall, lethal to anything big — Earth's punishment idea as an entry effect.
  { id: 'flint-arbiter', name: 'Flint Arbiter', element: 'earth', text: 'Tough 1. At entry: deal damage to an enemy unit equal to its own attack.', tags: [], wip: false, type: 'unit', cost: { energy: 7, elements: [{ type: 'earth', amount: 1 }] }, attack: 2, hp: 3, keywords: { tough: 1 }, onPlay: [{ kind: 'damage', amountFrom: 'targetAttack', target: 'enemy' }] },

  // --- NEUTRAL: colourless bodies, priced entirely in energy (no element-bearing ability) ---
  // `discountHand` had one user in the whole game (a leader upgrade). Here it is a permanent,
  // per-copy discount on the hand you are already holding — it travels with those copies.
  { id: 'quartermaster', name: 'Quartermaster', element: 'neutral', text: 'At entry: every card in your hand permanently costs 1 less.', tags: [], wip: false, type: 'unit', cost: { energy: 3 }, attack: 2, hp: 2, keywords: {}, onPlay: [{ kind: 'discountHand', amount: -1 }] },
  // `extraAction` existed only on a spell (Adrenaline Rush). On a body it is a unit that
  // arrives and immediately swings something else — reach without a card of its own.
  { id: 'drillmaster', name: 'Drillmaster', element: 'neutral', text: 'At entry: one of your units takes an immediate bonus attack.', tags: [], wip: false, type: 'unit', cost: { energy: 3 }, attack: 2, hp: 2, keywords: {}, onPlay: [{ kind: 'extraAction', target: 'ally' }] },
  // `setStats` had no card at all. Answering a threat by SHRINKING it leaves the body on the
  // board — it dodges death triggers and Zombified entirely, which no damage-based answer does.
  { id: 'warden-of-scales', name: 'Warden of Scales', element: 'neutral', text: 'At entry: an enemy unit becomes 1/1.', tags: [], wip: false, type: 'unit', cost: { energy: 5 }, attack: 0, hp: 5, keywords: {}, onPlay: [{ kind: 'setStats', target: 'enemy', stat: { attack: 1, hp: 1 } }] },

  // ═══════════════════════════════════════════════════════════════════════════════════════
  //  UNIQUENESS PASS — SPELLS. Same audit as the unit pass, run over the 38 non-signature
  //  spells. Eleven effect kinds the engine implements were reachable from NO ordinary spell:
  //  `summon`, `energy`, `energyNext`, `bankMax`, `costMod`, `discountHand`, `setStats`, the
  //  fixed-amount `chain`, `chooseElement`, a `buff` that grants an on-hit package, and — the
  //  one that surprised most — HEALING YOUR OWN LEADER. `extraAction`, `debuff` and
  //  `amountFrom` had exactly one carrier each, and NOT ONE base-set spell consumed more than
  //  a single target ref, despite `applyEffects`/`useGame` carrying a whole multi-target
  //  selection system built for exactly that (see CLAUDE.md, "Multi-target spells").
  //  Three spells that re-stated another card's niche were removed alongside.
  // ═══════════════════════════════════════════════════════════════════════════════════════

  // --- FIRE: burst, reach, and paying for it ---
  // Grants Fire's SIGNATURE keyword, which nothing in the pool could hand out — every Battle
  // Ready body prints it. Single-target and cheap ON PURPOSE: granting it to an already-
  // deployed unit does nothing, so the card only reads on a unit played this turn, which is
  // the combo. Board-wide it priced past 10 energy and became a second, worse All-Out Assault.
  { id: 'war-drums', name: 'War Drums', element: 'fire', text: 'An ally gains +1/0 and Battle Ready — it may attack the turn it entered play.', tags: [], wip: false, type: 'spell', cost: { energy: 2, elements: [{ type: 'fire', amount: 1 }] }, effects: [{ kind: 'buff', target: 'ally', stat: { attack: 1 }, keywords: { battleReady: true } }] },
  // The FIXED chain (`chain`) had no card at all — only the self-diminishing form (Chain Spark).
  // The difference is the point: this one bounces at full strength, but only once.
  { id: 'cinder-chain', name: 'Cinder Chain', element: 'fire', text: 'Deal 3 damage to an enemy. If it dies, deal 2 to the weakest other enemy.', tags: [], wip: false, type: 'spell', cost: { energy: 3 }, effects: [{ kind: 'damage', amount: 3, target: 'enemy', chain: 2 }] },
  // The pool's first TWO-TARGET spell. Both refs may be aimed at one unit ("3 damage, then
  // Burn it") or split across two — the choice is the card. Damage resolves BEFORE the burn
  // so the status lands on something still alive to carry it.
  { id: 'immolate', name: 'Immolate', element: 'fire', text: 'Deal 3 damage to an enemy, then inflict Burn 2 on an enemy. May be aimed at the same unit twice.', tags: [], wip: false, type: 'spell', cost: { energy: 4, elements: [{ type: 'fire', amount: 1 }] }, effects: [{ kind: 'damage', amount: 3, target: 'enemy' }, { kind: 'applyStatus', amount: 2, target: 'enemy', status: 'burn' }] },
  // The cleanest statement of the same system: one card, two independent bolts. Aiming both
  // at one body is a 4-damage removal; splitting them answers two chip threats.
  { id: 'twin-bolt', name: 'Twin Bolt', element: 'fire', text: 'Deal 2 damage to an enemy, twice. May be aimed at the same unit twice.', tags: [], wip: false, type: 'spell', cost: { energy: 2 }, effects: [{ kind: 'damage', amount: 2, target: 'enemy' }, { kind: 'damage', amount: 2, target: 'enemy' }] },
  // `extraAction` was one spell aimed at one unit. Across the whole board it is the alpha
  // strike Fire's whole plan implies and had no way to buy outside a signature.
  { id: 'all-out-assault', name: 'All-Out Assault', element: 'fire', text: 'Every one of your units takes an immediate bonus attack.', tags: [], wip: false, type: 'spell', cost: { energy: 5 }, effects: [{ kind: 'extraAction', target: 'all-ally' }] },

  // --- WATER: pick your targets, deny theirs ---
  // Expel had only ever been pointed at an ENEMY. Bouncing your OWN unit re-arms its entry
  // effect, rescues it from lethal damage, and un-drowns it — one card, three reasons.
  { id: 'riptide-recall', name: 'Riptide Recall', element: 'water', text: 'Return one of your own units to your hand.', tags: [], wip: false, type: 'spell', cost: { energy: 1, elements: [{ type: 'water', amount: 1 }] }, effects: [{ kind: 'expel', target: 'ally' }] },
  // Two-target Freeze: hold a whole lane for a turn, or double-lock one threat (the second
  // application refreshes the first). Cold Spell answers one unit; this answers a board turn.
  { id: 'numbing-depths', name: 'Numbing Depths', element: 'water', text: 'Freeze any unit, twice. May be aimed at the same unit twice.', tags: [], wip: false, type: 'spell', cost: { energy: 1, elements: [{ type: 'water', amount: 2 }] }, effects: [{ kind: 'applyStatus', target: 'any', status: 'freeze' }, { kind: 'applyStatus', target: 'any', status: 'freeze' }] },
  // Removal AND mill on one card — the two halves of the Deck Out plan, which previously had
  // to spend a card on each. Pierces, so it can answer the thing it just froze.
  { id: 'salt-the-wound', name: 'Salt the Wound', element: 'water', text: 'Pierces: deal 3 damage to any unit, ignoring Freeze, Shield and Tough. The opponent forgets a card.', tags: [], wip: false, type: 'spell', cost: { energy: 5, elements: [{ type: 'water', amount: 1 }] }, effects: [{ kind: 'damage', amount: 3, target: 'any', pierce: true }, { kind: 'forget', amount: 1, target: 'enemy' }] },

  // --- NATURE: start small, snowball, out-resource ---
  // Growth could only be granted by an Environment (Warehouse), which arms the opponent's
  // half of that lane too. This is the one-sided version, and it compounds every turn after.
  { id: 'overgrow', name: 'Overgrow', element: 'nature', text: 'All your units gain Growth: +1/0 each turn.', tags: [], wip: false, type: 'spell', cost: { energy: 4, elements: [{ type: 'nature', amount: 1 }] }, effects: [{ kind: 'buff', target: 'all-ally', keywords: { growth: { attack: 1, hp: 0 } } }] },
  // Nature's two payoff keywords onto ONE existing body — and the body is already deployed,
  // so unlike printing them on a card it dodges summoning sickness entirely.
  { id: 'wild-hunt', name: 'Wild Hunt', element: 'nature', text: 'An ally gains Lethal and Bloodlust: +1/0 per kill.', tags: [], wip: false, type: 'spell', cost: { energy: 4, elements: [{ type: 'nature', amount: 3 }] }, effects: [{ kind: 'buff', target: 'ally', keywords: { lethal: true, bloodlust: { buff: { attack: 1, hp: 0 } } } }] },
  // `summon` existed on exactly one card in the game — Autopus's signature. A spell that puts
  // bodies straight onto the board (rather than into hand, as Call in Markers does) is the
  // swarm plan's missing enabler.
  { id: 'seedfall', name: 'Seedfall', element: 'nature', text: 'Summon two Mechanical Failures into open lanes.', tags: [], wip: false, type: 'spell', cost: { energy: 7 }, effects: [{ kind: 'summon', cardId: 'critter-token' }, { kind: 'summon', cardId: 'critter-token' }] },
  // A `buff` carrying an ON-HIT package — the shape Foundations grant and only a signature
  // had ever cast. It respects a printed rider (see `applyOne`), so it upgrades a blank body.
  { id: 'symbiosis', name: 'Symbiosis', element: 'nature', text: 'An ally with no on-hit effect of its own gains On-Hit: Poison.', tags: [], wip: false, type: 'spell', cost: { energy: 1, elements: [{ type: 'nature', amount: 1 }] }, effects: [{ kind: 'buff', target: 'ally', onHit: { poison: true } }] },
  // Ramp as a SPELL. Every ramp in the game is a body that must survive a turn first; this
  // one cannot be answered, which is a different card even at the same rate.
  { id: 'deep-roots', name: 'Deep Roots', element: 'nature', text: 'You gain 3 extra energy on your next turn.', tags: [], wip: false, type: 'spell', cost: { energy: 1 }, effects: [{ kind: 'energyNext', amount: 3 }] },

  // --- EARTH: absorb, punish, refuse to die ---
  // Zombified as a STATUS had no source at all — the keyword's only carriers print it. Cast
  // on a unit that is about to trade, it turns a clean answer into a wasted one.
  { id: 'unearth', name: 'Unearth', element: 'earth', text: 'An ally gains Zombified: it revives once at 1 HP.', tags: [], wip: false, type: 'spell', cost: { energy: 2, elements: [{ type: 'earth', amount: 1 }] }, effects: [{ kind: 'applyStatus', target: 'ally', status: 'zombified' }] },
  // Bulwark grants Tough 1 and nothing else. This is the full defensive package on one body —
  // and Taunt is what makes the Tough matter, by forcing the attacks into it.
  { id: 'bedrock-pact', name: 'Bedrock Pact', element: 'earth', text: 'An ally gains Taunt and Tough 2.', tags: [], wip: false, type: 'spell', cost: { energy: 4, elements: [{ type: 'earth', amount: 2 }] }, effects: [{ kind: 'buff', target: 'ally', keywords: { taunt: true, tough: 2 } }] },
  // The only AOE debuff outside a signature. Answers a wide board without killing anything,
  // which is what makes it good against Zombified, Kamikaze and death triggers generally.
  { id: 'landslide', name: 'Landslide', element: 'earth', text: 'Every enemy unit gets -1/-1.', tags: [], wip: false, type: 'spell', cost: { energy: 5, elements: [{ type: 'earth', amount: 1 }] }, effects: [{ kind: 'debuff', target: 'all-enemy', stat: { attack: 1, hp: 1 } }] },
  // Reprisal's idea, twice: two answers whose size is set by the threats themselves. Dead
  // against a wall, and the single best removal in the game against two big attackers.
  { id: 'sundering-blow', name: 'Sundering Blow', element: 'earth', text: 'Twice: deal damage to an enemy unit equal to its own attack.', tags: [], wip: false, type: 'spell', cost: { energy: 4 }, effects: [{ kind: 'damage', target: 'enemy', amountFrom: 'targetAttack' }, { kind: 'damage', target: 'enemy', amountFrom: 'targetAttack' }] },
  // Shrink a threat and then MAKE it block — the debuff and the Taunt are two refs, so they
  // can be split across two units if the board wants that instead.
  { id: 'weight-of-ages', name: 'Weight of Ages', element: 'earth', text: 'Give an enemy -3/-3, then give any unit Taunt. May be aimed at the same unit twice.', tags: [], wip: false, type: 'spell', cost: { energy: 3, elements: [{ type: 'earth', amount: 2 }] }, effects: [{ kind: 'debuff', target: 'enemy', stat: { attack: 3, hp: 3 } }, { kind: 'applyStatus', target: 'any', status: 'taunt' }] },

  // --- NEUTRAL: colourless, castable by any leader (the class had only TWO spells) ---
  // `chooseElement` existed on exactly one thing in the game — Golun's hero power — so the
  // ability to bank a CHOSEN element was locked behind one leader. Pips are what a leader's
  // caps actually gate, which makes this the one ramp that ramps the constrained resource.
  { id: 'requisition', name: 'Requisition', element: 'neutral', text: 'Bank 2 energy of an element you choose.', tags: [], wip: false, type: 'spell', cost: { energy: 1 }, effects: [{ kind: 'energy', amount: 2, chooseElement: true }] },
  // NOTHING in the pool healed your own leader. Every heal targeted a unit, so a race was
  // one-directional: the only way to answer incoming damage was to stop it at the board.
  { id: 'field-hospital', name: 'Field Hospital', element: 'neutral', text: 'Heal your leader 6.', tags: [], wip: false, type: 'spell', cost: { energy: 3 }, effects: [{ kind: 'heal', amount: 6, target: 'leader' }] },
  // `discountHand` had one user in the game (a leader upgrade). The discount attaches to the
  // copies you hold RIGHT NOW and travels with them, so it rewards holding a full hand.
  { id: 'bulk-order', name: 'Bulk Order', element: 'neutral', text: 'Every card in your hand permanently costs 1 less.', tags: [], wip: false, type: 'spell', cost: { energy: 2 }, effects: [{ kind: 'discountHand', amount: -1 }] },
  // Card advantage AND tempo on one card: the draw replaces itself, the bonus attack is the
  // reason to cast it now rather than later.
  { id: 'second-wind', name: 'Second Wind', element: 'neutral', text: 'Draw a card, then one of your units takes an immediate bonus attack.', tags: [], wip: false, type: 'spell', cost: { energy: 3 }, effects: [{ kind: 'draw', amount: 1 }, { kind: 'extraAction', target: 'ally' }] },
  // Mill and draw on the same card. Every Forget spell in the pool is pure denial that costs
  // you the card you spent; this one replaces itself, which is what makes milling a PLAN
  // rather than a race you are also losing.
  { id: 'plunder', name: 'Plunder', element: 'neutral', text: 'The opponent forgets a card. Draw a card.', tags: [], wip: false, type: 'spell', cost: { energy: 2 }, effects: [{ kind: 'forget', amount: 1, target: 'enemy' }, { kind: 'draw', amount: 1 }] },
>>>>>>> Stashed changes
];



const rawLeaders = [
  // Kedou — DoT (merged from the former Vesh). Grinds the board down with Burn/Poison while
  // building a stronger force behind the dying units. Moderate fire-leaning curve.
  { id: 'kedou', name: 'Kedou', element: 'fire', elementCaps: { fire: 3, nature: 3, water: 1, earth: 1 }, heroPower: { name: 'Scald', cost: { energy: 2 }, effects: [{ kind: 'applyStatus', amount: 2, target: 'enemy', status: 'burn' }], text: 'Inflict Burn 2 on an enemy unit.' }, signatureCardId: 'sig-pyre-bloom' }, // DoT — fire+nature dual so Burn AND Poison are live. Scald Burn 1→2 (DoT was field-floor 36%): the repeatable reach is DoT's inevitability engine.
  // Cleath — Stall. Walls every lane and outlasts. Earth endgame, so it keeps its 4-cap.
<<<<<<< Updated upstream
  { id: 'cleath', name: 'Cleath', element: 'earth', elementCaps: { earth: 4, water: 2, fire: 1, nature: 1 }, heroPower: { name: 'Fortify', cost: { energy: 1 }, effects: [{ kind: 'buff', stat: { hp: 1 }, target: 'ally' }], text: 'Give an allied unit +1 HP.' }, signatureCardId: 'sig-living-mountain' }, // Stall
  // --- One leader per archetype ---
  { id: 'orsyric', name: 'Orsyric', element: 'fire', elementCaps: { fire: 2, water: 2, nature: 2, earth: 2 }, heroPower: { name: 'Mind Whip', cost: { energy: 2 }, effects: [{ kind: 'damage', amount: 1, target: 'any' }], text: 'Deal 1 damage to any unit.' }, signatureCardId: 'sig-final-charge' }, // Aggro — nerfed Mind Whip 2→1 dmg (was 93% field). Target 'any' so it can hit allies too (combo/kamikaze enablement).
  { id: 'aleph', name: 'Aleph', element: 'nature', elementCaps: { nature: 2, earth: 2, fire: 2, water: 2 }, heroPower: { name: 'Disciplinary Power', cost: { energy: 2 }, effects: [{ kind: 'applyStatus', target: 'enemy', status: 'poison' }], text: 'Poison an enemy unit (it can no longer be buffed).' }, signatureCardId: 'sig-equalize' }, // Midrange
  { id: 'phantom', name: 'Phantom', element: 'water', elementCaps: { water: 4, earth: 2, nature: 1, fire: 1 }, heroPower: { name: 'Subdue', cost: { energy: 2 }, effects: [{ kind: 'applyStatus', amount: 1, target: 'enemy', status: 'sleep' }], text: 'Put an enemy unit to Sleep.' }, signatureCardId: 'sig-deep-freeze' }, // Control
  { id: 'screyera', name: 'Screyera', element: 'earth', elementCaps: { earth: 3, nature: 3, fire: 1, water: 1 }, heroPower: { name: 'Scry', cost: { energy: 1 }, effects: [{ kind: 'draw', amount: 2 }], text: 'Draw 2 cards.' }, signatureCardId: 'sig-keystone' }, // Combo — Scry HP cost dropped (Combo was field-floor 35%): free digging to assemble grant+body combos.
  { id: 'ringleader', name: 'Ring Leader', element: 'nature', elementCaps: { nature: 3, water: 2, fire: 2, earth: 1 }, heroPower: { name: 'Modification', cost: { energy: 1 }, hpCost: 1, effects: [{ kind: 'buff', target: 'leaderUnit', stat: { attack: 1 } }], text: 'Pay 1 HP: your leader-unit gains +1 attack.' }, signatureCardId: 'sig-incarnate', leaderUnitCardId: 'ringleader-avatar' }, // Guardian
  { id: 'corpselock', name: 'Corpselock', element: 'nature', elementCaps: { nature: 4, earth: 2, fire: 1, water: 1 }, heroPower: { name: 'Cancerous Growth', cost: { energy: 2 }, effects: [{ kind: 'energy', amount: 2, chooseElement: true }], text: 'Bank 2 of an element of your choice.' }, signatureCardId: 'sig-overflow' }, // Ramp — Cancerous Growth bank 3→2 reverted: bank-rate buff was a no-op (Ramp's bottleneck is survival, not banking speed). Corpselock + nature cards are fine; Ramp's ~40 reflects a greedy archetype, not a primitive fault.
  { id: 'johnpork', name: 'John Pork', element: 'water', elementCaps: { water: 3, nature: 3, fire: 1, earth: 1 }, heroPower: { name: 'Sweet Liquor', cost: { energy: 1 }, effects: [{ kind: 'forget', amount: 2, target: 'enemy' }], text: 'The opponent forgets 2 cards from their deck.' }, signatureCardId: 'sig-oblivion' }, // Deck Out
  { id: 'autopus', name: 'Autopus', element: 'nature', elementCaps: { nature: 3, fire: 2, earth: 2, water: 1 }, heroPower: { name: 'Fallback Code', cost: { energy: 1 }, effects: [{ kind: 'summon', cardId: 'critter-token' }], text: 'Summon a Mechanical Failure.' }, signatureCardId: 'sig-swarm-call' }, // Swarm
  { id: 'eksana', name: 'Eksana', element: 'earth', elementCaps: { earth: 3, nature: 2, water: 2, fire: 1 }, heroPower: { name: 'Exploit', cost: { energy: 1 }, effects: [{ kind: 'debuff', stat: { attack: 1, hp: 1 }, target: 'enemy' }], text: 'Debuff an enemy unit −1/−1.' }, signatureCardId: 'sig-thornburst' }, // Attrition
  { id: 'noctua', name: 'Noctua', element: 'nature', elementCaps: { nature: 4, earth: 2, fire: 1, water: 1 }, heroPower: { name: 'Tinkerer', cost: { energy: 2 }, effects: [{ kind: 'buff', target: 'ally', keywords: { growth: { attack: 1, hp: 1 } } }], text: 'Give an ally Growth: +1/+1 each turn.' }, signatureCardId: 'sig-ascension' }, // Snowball — Tinkerer replaces Nurture: grants permanent Growth (+1/+1/turn) for 2E rather than a one-time +1/+1 for 3E. More thematic snowball engine; requires unit survival to pay off.
  { id: 'naife', name: 'Naife', element: 'water', elementCaps: { water: 3, nature: 2, earth: 2, fire: 1 }, heroPower: { name: 'Misdirect', cost: { energy: 1 }, effects: [{ kind: 'move', target: 'enemy' }], text: 'Move an enemy unit to another lane.' }, signatureCardId: 'sig-pathmaker' }, // Lane Control
=======
  { id: 'cleath', name: 'Cleath', element: 'earth', elementCaps: { earth: 4, water: 2, fire: 1, nature: 1 }, heroPower: { name: 'Fortify', cost: { energy: 2 }, effects: [{ kind: 'buff', stat: { hp: 2 }, keywords: { taunt: true }, target: 'ally' }], text: 'Give an allied unit +2 HP and Taunt.' }, signatureCardId: 'sig-living-mountain' }, // Stall — Fortify was +1 HP for 1e (0.6 budget value) against Eksana's 2.4 for the same cost, the weakest power in the pool. +2 HP and Taunt brings it to ~2.4 and gives Stall the tool its plan actually needs: forcing attacks INTO the wall rather than past it.
  // --- One leader per archetype ---
  { id: 'orsyric', name: 'Orsyric', element: 'fire', elementCaps: { fire: 3, water: 1, nature: 3, earth: 1 }, heroPower: { name: 'Mind Whip', cost: { energy: 1 }, effects: [{ kind: 'damage', amount: 1, target: 'any' }], text: 'Deal 1 damage to any unit.' }, signatureCardId: 'sig-final-charge' }, // Aggro — nerfed Mind Whip 2→1 dmg (was 93% field). Target 'any' so it can hit allies too (combo/kamikaze enablement).
  { id: 'aleph', name: 'Aleph', element: 'nature', elementCaps: { nature: 2, earth: 2, fire: 2, water: 2 }, heroPower: { name: 'Disciplinary Power', cost: { energy: 1 }, effects: [{ kind: 'applyStatus', target: 'enemy', status: 'poison' }], text: 'Poison an enemy unit (it can no longer be buffed).' }, signatureCardId: 'sig-equalize' }, // Midrange
  { id: 'phantom', name: 'Phantom', element: 'water', elementCaps: { water: 4, earth: 2, nature: 1, fire: 1 }, heroPower: { name: 'Subdue', cost: { energy: 1 }, effects: [{ kind: 'applyStatus', amount: 1, target: 'enemy', status: 'sleep' }], text: 'Put an enemy unit to Sleep.' }, signatureCardId: 'sig-deep-freeze' }, // Control
  { id: 'screyera', name: 'Screyera', element: 'earth', elementCaps: { earth: 3, nature: 3, fire: 1, water: 1 }, heroPower: { name: 'Scry', cost: { energy: 2 }, hpCost: 1, effects: [{ kind: 'draw', amount: 2 }], text: 'Pay 1 HP: draw 2 cards.' }, signatureCardId: 'sig-keystone' }, // Combo — Scry 1e→2e, then the HP cost RESTORED (it was dropped when Combo sat at the 35% field floor; Combo now leads at 67%). Measured against four alternatives, hpCost 1 was the best trim per unit of change (-3.6 vs -1.6 for a flat 3e) because it is SELF-SCALING: leader HP is worth 1/point while healthy but 4x at or below the Signature threshold (ai.ts convex life), so the cost is trivial when Combo is comfortably ahead and prohibitive in exactly the close games where it most wants to dig. Usage halves, 2.60 -> 1.35 casts/game. The Signature-acceleration refund (engine.ts routes hpCost through damageLeader deliberately) is real but swamped by that convexity.
  { id: 'ringleader', name: 'Ring Leader', element: 'nature', elementCaps: { nature: 2, water: 3, fire: 1, earth: 2 }, heroPower: { name: 'Modification', cost: { energy: 2 }, hpCost: 1, hpCostStep: 1, effects: [{ kind: 'buff', target: 'leaderUnit', stat: { attack: 1 } }], text: 'Pay 1 HP (rising each use): your leader-unit gains +1 attack, permanently.' }, signatureCardId: 'sig-incarnate', leaderUnitCardId: 'ringleader-avatar' }, // Guardian — Modification 1e->2e (was live turn 1 at 1e), hpCostStep 1 added: the +1 attack is PERMANENT, so activation k adds attack to every remaining turn and total value is quadratic in game length while a flat HP price is linear. Probed at -55.2pp vs a mid-pack leader's -35.4pp (heroDisable.ts); Guardian measured 61.6-66.3% across every run this session, the only leader whose power itself (not its cards) is the outlier.
  { id: 'corpselock', name: 'Corpselock', element: 'nature', elementCaps: { nature: 4, earth: 2, fire: 1, water: 1 }, heroPower: { name: 'Cancerous Growth', cost: { energy: 0 }, effects: [{ kind: 'energy', amount: 3 }, { kind: 'energyNext', amount: -2 }], text: 'Gain 3 energy now; start next round with 2 less.' }, signatureCardId: 'sig-overflow' }, // Ramp — BORROWS from the future rather than saving for it. Energy equals the round number (turn.ts), so it grows automatically and is scarcest EARLY: moving energy forward in time takes from a lean turn and gives to a rich one, which is why the save-for-later version measured a 0.0 contribution across 384 games (it was cast 8.2x/game and never once mattered). Reversed, the same trade is positive in TEMPO — and borrowing is the one direction banking cannot go. It also PROFITS (borrow 3, repay 2) rather than merely shifting timing: a net-zero shift settles at `round - 2 + 2 = round` if cast every turn, i.e. exactly nothing, which is why the break-even version was worth 0 in both directions.
  { id: 'johnpork', name: 'John Pork', element: 'water', elementCaps: { water: 4, nature: 1, fire: 1, earth: 2 }, heroPower: { name: 'Sweet Liquor', cost: { energy: 3 }, effects: [{ kind: 'forget', amount: 2, target: 'enemy' }], text: 'The opponent forgets 2 cards from their deck.' }, signatureCardId: 'sig-oblivion' }, // Deck Out
  { id: 'autopus', name: 'Autopus', element: 'nature', elementCaps: { nature: 4, fire: 2, earth: 1, water: 1 }, heroPower: { name: 'Fallback Code', cost: { energy: 3 }, effects: [{ kind: 'summon', cardId: 'critter-token' }], text: 'Summon a Mechanical Failure.' }, signatureCardId: 'sig-swarm-call' }, // Swarm
  // Eksana — the Fixer. Infamous criminal turned crown asset: crafty, well-connected, and
  // willing to do the job herself. Her power is a NETWORK, not a spell: every card she plays is
  // a contact made, and when enough favours are owed she calls one in. Printed at 20 energy —
  // deliberately above the ~17 a game ever naturally reaches, since energy just equals the
  // round number — so the discount is the ONLY route to casting it, and activating spends the
  // whole network (resets to 20) rather than unlocking free-forever.
  //
  // The payoff is EKSANA HERSELF, for one turn — she is the strategist who still does the job
  // in person. Crucially it generates NO CARD: the earlier version conjured one, and each
  // activation was then worth ~25-32pp of win rate (measured: 0.98 favours/game -> 33.3%,
  // 1.38 -> 43.8%, 2.29 -> 72.9%, 3.29 -> 87.5%), a cliff with no safe cost setting. A body
  // that appears, strikes once and vanishes is BOUNDED — it cannot cascade or accumulate —
  // which is what makes the cost tunable at all.
  //
  // BASE 22 IS PROVISIONAL. Measured (48 games/point, so +-14pp — treat as directional):
  // base 20 -> 62.5% (4.75 favours/game), 22 -> 39.6% (3.25), 24 -> 35.4% (2.56),
  // 28 -> 33.3% (1.48), 32 -> 27.1% (1.08). There is a CLIFF between 20 and 22 (23pp for two
  // energy) and a flat shelf above it: past ~4 favours a game she has near-permanent
  // Lethal/Pierce sniper presence, which is a different game from calling one occasionally.
  // 22 is chosen because shipping slightly weak beats shipping 62.5%.
  //
  // The real problem is NOT this number: her 30-card list floors at 27-33% when the power
  // barely fires, BELOW the Attrition deck it replaced. Tuning the base only picks how much of
  // a weak deck the power has to carry. Fix the deck, then re-measure the cost.
  // Replaced Attrition/Exploit (−1 attack debuff, the weakest power in the game; the deck was
  // last at 34.1% in every run). The thorns/spike package went with it — passive plant-armour
  // flavour that never matched her, and the "wait to be attacked" plan that kept her at the floor.
  { id: 'eksana', name: 'Eksana', element: 'earth', elementCaps: { earth: 4, nature: 2, water: 1, fire: 1 }, heroPower: { name: 'Call in a Favour', cost: { energy: 12 }, costStep: 1, effects: [{ kind: 'summon', cardId: 'eksana-herself' }], text: 'Costs 1 less for each card you have played since last using it. Eksana arrives without Battle Ready — she cannot act until your next turn.' }, signatureCardId: 'sig-thornburst' }, // The Fixer
  // Noctua — Snowball. TINKERER REPLACED. The old power granted Growth, which was too slow to
  // matter and, worse, was self-defeating: keyword grants use `Object.assign`, so granting
  // Growth to a body that already had it OVERWROTE rather than stacked, making the power a
  // blank on exactly the cards a Growth deck wants to play.
  //
  // COCOON is the same idea from the other side. Growth already provides the offence; what a
  // growing body actually lacks is TIME. Freeze absorbs one attack outright and Sleep heals,
  // and `resolveEndOfTurn` ticks Growth (step 3) with no status check at all — so a cocooned
  // unit keeps growing the whole time it is dormant. The cost is real and is the point: a
  // frozen or sleeping unit cannot attack (`combat.ts` canAttack), so this buys turns for a
  // threat rather than adding to the board.
  //
  // The two statuses are one package by construction: `wakeOnHit` clears BOTH on the first hit,
  // so the cocoon absorbs exactly one attack and then breaks. It cannot lock a lane forever.
  //
  // PRICED AT 3, not 2, and healing 2 rather than 3. The freeze negates one attack OUTRIGHT and
  // does not care how big that attack was, which is the strongest kind of defence there is; at
  // 2 energy, repeatable every single turn, it was simply better than spending the turn on a
  // card. At 3 it competes with a play instead of being free value stacked on top of one.
  { id: 'noctua', name: 'Noctua', element: 'nature', elementCaps: { nature: 4, earth: 2, fire: 1, water: 1 }, heroPower: { name: 'Cocoon', cost: { energy: 3 }, effects: [{ kind: 'applyStatus', target: 'ally', status: 'freeze' }, { kind: 'applyStatus', amount: 2, target: 'ally', status: 'sleep' }], text: 'Cocoon an ally: it Freezes and Sleeps, healing 2. It cannot attack, but it keeps growing, and the next hit against it is absorbed.' }, signatureCardId: 'sig-ascension' },
  { id: 'naife', name: 'Naife', element: 'water', elementCaps: { water: 4, nature: 2, earth: 1, fire: 1 }, heroPower: { name: 'Misdirect', cost: { energy: 2 }, effects: [{ kind: 'move', target: 'enemy' }], text: 'Move an enemy unit to another lane.' }, signatureCardId: 'sig-pathmaker' }, // Lane Control
>>>>>>> Stashed changes
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
// ═══════════════════════════════════════════════════════════════════════════════════════════
//  THE THIRTEEN ARCHETYPE DECKS — rebuilt from the current pool, not edited from the old lists.
//
//  Rebuilding rather than patching is the point: the pool has been through a uniqueness pass
//  (29 new units, 23 new spells, 14 cards cut) and a whole-pool reprice, so the old lists were
//  a snapshot of a set that no longer exists. Several still leaned on cards that had become
//  strictly worse than a newer neighbour, and several were priced against the OLD curve.
//
//  Three rules every list here obeys, and the reasons they are rules:
//
//   1. AT MOST 3 COPIES (RULES.MAX_COPIES). `validateDeck` enforces it and `deckValidity.test`
//      asserts it, so this is a hard constraint rather than a style choice.
//   2. PIPS FIT THE LEADER'S OWN CAPS. A pip above its leader's cap is not illegal — the
//      shortfall falls back to generic energy (`settleCost`) — but it means paying full face
//      value for a card whose price was discounted on the assumption you had committed to that
//      element. Every entry below is checked against its leader's `elementCaps`.
//   3. A REAL CURVE. Energy equals the round number, so a deck whose average cost is 5 does
//      nothing for five rounds. Each list front-loads cheap bodies and keeps its top end small.
//
//  Archetype identity lives in what the cards DO, not in expensive top-end that never gets cast.
// ═══════════════════════════════════════════════════════════════════════════════════════════

// DoT (Kedou, fire F3/nature N3) — win by attrition the opponent cannot answer with blockers.
// Every cheap body carries a status rider, so trading with it still leaves the poison/burn on
// the board. The top end is the two AOE tickers that turn a stalled board into a clock.
export const deckDoT = parseDeck({ name: 'DoT', leaderId: 'kedou', cards: [
<<<<<<< Updated upstream
  { cardId: 'ash-cloud', count: 3 }, { cardId: 'firebolt', count: 3 }, { cardId: 'pyroclasm', count: 2 },
  { cardId: 'ember-tick', count: 3 }, { cardId: 'coal-runner', count: 1 }, { cardId: 'ashen-bomber', count: 2 }, { cardId: 'pumpkindle', count: 2 }, { cardId: 'wildfire-spread', count: 2 },
  { cardId: 'plague-rat', count: 2 }, { cardId: 'creeping-blight', count: 2 }, { cardId: 'galatian-spirit', count: 2 },
  { cardId: 'cinder-witch', count: 2 }, { cardId: 'revolving-sun', count: 2 },
  { cardId: 'whistle-blower', count: 2 },
=======
  { cardId: 'ash-cloud', count: 3 }, { cardId: 'ember-tick', count: 3 }, { cardId: 'plague-rat', count: 3 },
  { cardId: 'pumpkindle', count: 3 }, { cardId: 'strangleroot', count: 3 },
  { cardId: 'revolving-sun', count: 2 }, { cardId: 'chemister', count: 2 }, { cardId: 'spore-matron', count: 2 },
  { cardId: 'cinder-witch', count: 2 }, { cardId: 'creeping-blight', count: 2 }, { cardId: 'immolate', count: 2 },
  { cardId: 'cinder-clockwork', count: 2 }, { cardId: 'wildfire-spread', count: 1 },
>>>>>>> Stashed changes
] });

// Aggro (Orsyric, fire F3/nature N3) — the cheapest curve in the game. Nothing costs more than
// 3, so every energy from round 1 onward is spent, and War Drums converts a fresh body into
// immediate damage rather than waiting a turn for it.
export const deckAggro = parseDeck({ name: 'Aggro', leaderId: 'orsyric', cards: [
<<<<<<< Updated upstream
  { cardId: 'flicker-moth', count: 3 }, { cardId: 'magma-brute', count: 2 }, { cardId: 'firebolt', count: 2 }, { cardId: 'chain-spark', count: 3 }, { cardId: 'coal-runner', count: 3 },
  { cardId: 'swift-falcon', count: 3 }, { cardId: 'comet-rider', count: 2 }, { cardId: 'pyre-fiend', count: 2 }, { cardId: 'coral-spear', count: 1 }, { cardId: 'reef-raptor', count: 2 }, { cardId: 'briar-colt', count: 1 },
  { cardId: 'razor-charger', count: 2 }, { cardId: 'adrenaline-rush', count: 2 }, { cardId: 'split-arrow', count: 1 }, { cardId: 'twin-blade', count: 1 },
=======
  { cardId: 'flicker-moth', count: 3 }, { cardId: 'ember-pup', count: 3 }, { cardId: 'magma-brute', count: 3 },
  { cardId: 'coal-runner', count: 3 }, { cardId: 'swift-falcon', count: 3 }, { cardId: 'pyre-fiend', count: 3 },
  { cardId: 'firebolt', count: 3 }, { cardId: 'twin-bolt', count: 3 },
  { cardId: 'blaze-hound', count: 2 }, { cardId: 'comet-rider', count: 2 }, { cardId: 'war-drums', count: 2 },
>>>>>>> Stashed changes
] });

// Midrange (Aleph, an even 2/2/2/2 cap) — the one leader with no element to commit to, so it
// plays the cards that ask for no commitment: vanilla bodies and colourless spells. It is the
// pool's control group, and the deck that says what a fair stat line is worth.
export const deckMidrange = parseDeck({ name: 'Midrange', leaderId: 'aleph', cards: [
<<<<<<< Updated upstream
  { cardId: 'field-mouse', count: 3 }, { cardId: 'frost-imp', count: 2 }, { cardId: 'ember-pup', count: 2 }, { cardId: 'mend', count: 1 }, { cardId: 'briar-colt', count: 3 },
  { cardId: 'gravel-hound', count: 3 }, { cardId: 'reef-darter', count: 2 }, { cardId: 'spore-bat', count: 2 }, { cardId: 'wind-redirect', count: 1 }, { cardId: 'current-rider', count: 2 },
  { cardId: 'mud-crab', count: 2 }, { cardId: 'chemister', count: 1 }, { cardId: 'craftbee', count: 1 }, { cardId: 'granite-ox', count: 2 }, { cardId: 'lumber-jacko', count: 1 }, { cardId: 'briar-colt', count: 1 }, { cardId: 'reef-darter', count: 1 },
=======
  { cardId: 'field-mouse', count: 3 }, { cardId: 'ember-pup', count: 3 }, { cardId: 'briar-colt', count: 3 },
  { cardId: 'reef-darter', count: 3 }, { cardId: 'gravel-hound', count: 3 }, { cardId: 'mercenary', count: 3 },
  { cardId: 'oak-sentry', count: 3 }, { cardId: 'granite-ox', count: 3 },
  { cardId: 'mountain-bull', count: 2 }, { cardId: 'sharpened-stake', count: 2 }, { cardId: 'salvage-run', count: 2 },
>>>>>>> Stashed changes
] });

// Control (Phantom, water W4) — answer everything, then win with the bodies left over. The
// removal is deliberately split by CONDITION rather than by price: Freeze and Sleep buy a turn,
// Peel Back undoes a deployment, and Abyssal Verdict pierces the thing the freezes protected.
export const deckControl = parseDeck({ name: 'Control', leaderId: 'phantom', cards: [
<<<<<<< Updated upstream
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
=======
  { cardId: 'cold-spell', count: 3 }, { cardId: 'hypnotic-patterns', count: 3 }, { cardId: 'frostbite-harpoon', count: 3 },
  { cardId: 'peel-back', count: 2 }, { cardId: 'void-caller', count: 2 }, { cardId: 'lull', count: 2 },
  { cardId: 'abyssal-verdict', count: 2 },
  { cardId: 'river-minnow', count: 2 }, { cardId: 'reef-darter', count: 2 }, { cardId: 'riptide-executioner', count: 2 },
  { cardId: 'frost-wall', count: 2 }, { cardId: 'brackish-warden', count: 2 }, { cardId: 'coral-spear', count: 2 },
  { cardId: 'tidecaller-adept', count: 1 },
] });

// Combo (Screyera, earth E3/nature N3) — Foundations. A Foundation is a full unit that ALSO
// hands its body and keywords up to whatever bonds on top, so the plan is: cheap ground early,
// bond onto it later, and let Scry pay HP to find the halves. Ground placed a PRIOR turn
// deploys its bond Battle-Ready, which is why the curve starts so low.
export const deckCombo = parseDeck({ name: 'Combo', leaderId: 'screyera', cards: [
  { cardId: 'pebble-pup', count: 3 }, { cardId: 'the-fence', count: 3 }, { cardId: 'mud-crab', count: 3 },
  { cardId: 'gravel-hound', count: 3 }, { cardId: 'smugglers-cache', count: 3 }, { cardId: 'lookout-perch', count: 3 },
  { cardId: 'quarry-hand', count: 2 }, { cardId: 'dead-drop', count: 2 }, { cardId: 'granite-ox', count: 2 },
  { cardId: 'taunt-totem', count: 2 }, { cardId: 'iron-seed', count: 2 }, { cardId: 'venom-gland', count: 2 },
] });

// Guardian (Ring Leader, water W3/earth E2) — the leader IS a unit, and losing it loses the
// game, so this deck buys time rather than tempo: Shields, Taunts and walls in front, healing
// behind. Riptide Shepherd is the one piece that moves an ALLY every turn, which is how the
// avatar gets out of a lane something has just aimed at.
export const deckTempo = parseDeck({ name: 'Guardian', leaderId: 'ringleader', cards: [
  { cardId: 'iron-ward', count: 3 }, { cardId: 'field-hospital', count: 3 }, { cardId: 'mend', count: 3 },
  { cardId: 'reef-darter', count: 3 }, { cardId: 'gravel-hound', count: 3 },
  { cardId: 'river-minnow', count: 2 }, { cardId: 'pebble-pup', count: 2 }, { cardId: 'mud-crab', count: 2 },
  { cardId: 'current-rider', count: 2 }, { cardId: 'frost-wall', count: 2 }, { cardId: 'brackish-warden', count: 2 },
  { cardId: 'barbed-sentinel', count: 2 }, { cardId: 'rejuvenate', count: 1 },
>>>>>>> Stashed changes
] });

// Ramp (Corpselock, nature N4) — spend the early turns buying energy you will not have earned
// yet, then land the things nobody else can afford. Deep Roots is the piece that was missing:
// every other ramp in the game is a BODY that has to survive a turn first, and this one cannot
// be answered at all.
export const deckRamp = parseDeck({ name: 'Ramp', leaderId: 'corpselock', cards: [
  { cardId: 'field-mouse', count: 3 }, { cardId: 'deep-roots', count: 3 }, { cardId: 'sun-priest', count: 3 },
  { cardId: 'surge-sprite', count: 3 },
  { cardId: 'spore-matron', count: 2 }, { cardId: 'verdant-chorus', count: 2 }, { cardId: 'mana-geyser', count: 2 },
  { cardId: 'apex-predator', count: 2 }, { cardId: 'emerald-drake', count: 2 }, { cardId: 'grove-elder', count: 2 },
  { cardId: 'brood-warlord', count: 2 }, { cardId: 'bramble-tyrant', count: 2 }, { cardId: 'worldheart-wyrm', count: 1 },
  { cardId: 'briar-colt', count: 1 },
] });

// Deck Out (John Pork, water W4) — the opponent's DECK is the resource being attacked, so every
// card here either mills or buys the turns the mill needs. Plunder is the piece that makes it a
// plan rather than a race: every other Forget in the pool costs you the card you spent, and
// this one replaces itself.
export const deckDeckOut = parseDeck({ name: 'Deck Out', leaderId: 'johnpork', cards: [
<<<<<<< Updated upstream
  { cardId: 'cursed-gift', count: 3 }, { cardId: 'river-minnow', count: 2 },
  { cardId: 'cold-spell', count: 3 }, { cardId: 'hypnotic-patterns', count: 2 }, { cardId: 'peel-back', count: 2 }, { cardId: 'whistle-blower', count: 2 }, { cardId: 'displacement-wave', count: 2 },
  { cardId: 'river-turtle', count: 2 }, { cardId: 'fog-creature', count: 1 },
  { cardId: 'sleep-walker', count: 2 }, { cardId: 'lull', count: 2 },
  { cardId: 'frost-wall', count: 1 }, { cardId: 'mind-leech', count: 3 }, { cardId: 'lullaby-spirit', count: 1 },
  { cardId: 'tundra', count: 1 }, { cardId: 'lullaby-grove', count: 1 },
=======
  { cardId: 'cursed-gift', count: 3 }, { cardId: 'plunder', count: 3 }, { cardId: 'tide-of-oblivion', count: 3 },
  { cardId: 'archive-eel', count: 3 }, { cardId: 'drowned-archive', count: 3 }, { cardId: 'memory-siphon', count: 3 },
  { cardId: 'hypnotic-patterns', count: 3 },
  { cardId: 'river-minnow', count: 2 }, { cardId: 'lull', count: 2 }, { cardId: 'frost-wall', count: 2 },
  { cardId: 'salt-the-wound', count: 2 }, { cardId: 'brackish-warden', count: 1 },
>>>>>>> Stashed changes
] });

// Stall (Cleath, earth E4) — outlast. Every body is a wall and the reach comes from the leader
// power, not the deck. Deliberately the CHEAPEST wall package available rather than the biggest:
// an 7e wall that arrives on round 7 has already let six turns of damage through.
export const deckStall = parseDeck({ name: 'Stall', leaderId: 'cleath', cards: [
<<<<<<< Updated upstream
  { cardId: 'target-spell', count: 2 }, { cardId: 'mend', count: 2 }, { cardId: 'trench-turtle', count: 3 }, { cardId: 'spike-wall', count: 3 }, { cardId: 'frost-wall', count: 2 },
  { cardId: 'bulwark-toad', count: 2 }, { cardId: 'iron-mantis', count: 2 }, { cardId: 'stone-footing', count: 2 }, { cardId: 'salt-golem', count: 1 }, { cardId: 'guardian-crab', count: 1 },
  { cardId: 'aegis-ancient', count: 1 }, { cardId: 'granite-ox', count: 1 }, { cardId: 'mountain-bull', count: 1 }, { cardId: 'colossal-worm', count: 1 }, { cardId: 'pebble-snake', count: 2 },
  { cardId: 'mandrake', count: 1 }, { cardId: 'ridge-walker', count: 3 },
=======
  { cardId: 'pebble-pup', count: 3 }, { cardId: 'quarry-hand', count: 3 }, { cardId: 'gravel-hound', count: 3 },
  { cardId: 'mud-crab', count: 3 }, { cardId: 'tremor', count: 3 }, { cardId: 'barbed-sentinel', count: 3 },
  { cardId: 'bulwark', count: 2 }, { cardId: 'the-fence', count: 2 }, { cardId: 'field-hospital', count: 2 },
  { cardId: 'trench-turtle', count: 2 }, { cardId: 'salt-golem', count: 2 }, { cardId: 'bulwark-toad', count: 1 },
  { cardId: 'aegis-ancient', count: 1 },
>>>>>>> Stashed changes
] });

// Swarm (Autopus, nature N4) — go wide, then buff the whole board at once. The cheap fliers and
// the Kamikaze-summoner keep bodies on the table through trades; Hivemind Surge and Brood
// Warlord are what make a board of 1/2s into a board that kills.
export const deckSwarm = parseDeck({ name: 'Swarm', leaderId: 'autopus', cards: [
<<<<<<< Updated upstream
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
=======
  { cardId: 'field-mouse', count: 3 }, { cardId: 'critter-token', count: 3 }, { cardId: 'spore-bat', count: 3 },
  { cardId: 'briar-colt', count: 3 }, { cardId: 'plague-rat', count: 3 }, { cardId: 'hive-spawn', count: 3 },
  { cardId: 'hivemind-surge', count: 3 }, { cardId: 'spawning-pool', count: 2 },
  { cardId: 'lumber-jacko', count: 2 }, { cardId: 'brood-warlord', count: 2 }, { cardId: 'craftbee', count: 2 },
  { cardId: 'overgrow', count: 1 },
] });

// The Fixer (Eksana, earth E4) — her power costs 1 less for every card played since she last
// used it, so the deck's real currency is CARD COUNT, not card quality. Nothing costs more than
// 2, and the two draw spells buy more plays rather than better ones. This is the one archetype
// where a cheap, unimpressive card is doing exactly its job.
export const deckAttrition = parseDeck({ name: 'The Fixer', leaderId: 'eksana', cards: [
  { cardId: 'quarry-hand', count: 3 }, { cardId: 'pebble-pup', count: 3 }, { cardId: 'stray-cur', count: 3 },
  { cardId: 'dead-drop', count: 3 }, { cardId: 'target-spell', count: 3 }, { cardId: 'the-fence', count: 3 },
  { cardId: 'reprisal', count: 3 }, { cardId: 'mud-crab', count: 3 },
  { cardId: 'gravel-hound', count: 2 }, { cardId: 'bulwark', count: 2 }, { cardId: 'sharpened-stake', count: 2 },
>>>>>>> Stashed changes
] });

// Snowball (Noctua, nature N4) — Growth compounds per turn, so the whole deck is a bet that a
// cheap body left alone becomes a threat. Cocoon is what buys the "left alone": it absorbs one
// attack and heals, and Growth ticks right through it (`resolveEndOfTurn` step 3 has no status
// check), so a cocooned body is growing on the turns it is safest.
//
// The list is deliberately PRINTED-Growth heavy again. Under the old Tinkerer it could not be —
// granting Growth to a body that already had it overwrote rather than stacked, so the power was
// a blank on its own best cards. Cocoon has no such conflict: it protects whatever it touches.
// Metamorphosis is the same bet in card form, and a cocooned Thistle Cub survives to make it.
export const deckSnowball = parseDeck({ name: 'Snowball', leaderId: 'noctua', cards: [
<<<<<<< Updated upstream
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
=======
  { cardId: 'field-mouse', count: 3 }, { cardId: 'thistle-cub', count: 3 }, { cardId: 'bloom-elk', count: 3 },
  { cardId: 'surge-sprite', count: 3 }, { cardId: 'briar-colt', count: 3 },
  { cardId: 'overgrowth', count: 2 }, { cardId: 'iron-seed', count: 2 }, { cardId: 'chrysalis-grub', count: 2 },
  { cardId: 'grafted-colossus', count: 2 }, { cardId: 'lumber-jacko', count: 2 }, { cardId: 'mend', count: 2 },
  { cardId: 'apex-predator', count: 2 }, { cardId: 'bramble-tyrant', count: 1 },
] });

// Lane Control (Naife, water W4) — the board is five lanes, and this deck decides who stands in
// which. Snipers hit from the Heights, the Aquatic bodies own the Water lane outright, and the
// movement spells drag the opponent's answers out of position. Shallows is free presence: it
// grants Aquatic to the whole Water column, which is the lane nothing else can contest.
export const deckLaneControl = parseDeck({ name: 'Lane Control', leaderId: 'naife', cards: [
  { cardId: 'wind-redirect', count: 3 }, { cardId: 'tidal-wave', count: 3 }, { cardId: 'coral-spear', count: 3 },
  { cardId: 'riptide-shepherd', count: 3 }, { cardId: 'reef-raptor', count: 3 },
  { cardId: 'shallows', count: 2 }, { cardId: 'tundra', count: 2 }, { cardId: 'pocket-dimension', count: 2 },
  { cardId: 'strings-of-heaven', count: 2 }, { cardId: 'tide-stalker', count: 2 }, { cardId: 'crag-hawk', count: 2 },
  { cardId: 'fearie', count: 2 }, { cardId: 'tidal-rift', count: 1 },
>>>>>>> Stashed changes
] });

export const starterDecks = [
  deckDoT, deckAggro, deckMidrange, deckControl, deckCombo, deckTempo, deckRamp,
  deckDeckOut, deckStall, deckSwarm, deckAttrition, deckSnowball, deckLaneControl,
];
