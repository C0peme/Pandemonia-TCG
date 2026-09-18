import { describe, expect, it } from 'vitest';
import { resolveCombat } from '@engine/combat';
import { blankState, place, unit } from '@engine/testkit';
import { RULES } from '@engine/constants';
import type { GameState } from '@engine/types';

const run = (s: GameState, sniperChoices?: Partial<Record<string, import('@engine/constants').LaneId>>) =>
  resolveCombat(s, sniperChoices).state;

describe('targeting keywords', () => {
  it('Overshot bypasses a blocker to hit the leader, with no retaliation', () => {
    const s = blankState();
    place(s, 0, 'ground1', unit({ owner: 0, attack: 4, hp: 4, keywords: { overshot: true } }));
    place(s, 1, 'ground1', unit({ owner: 1, attack: 2, hp: 5 }));
    const r = run(s);
    expect(r.players[1].leaderHp).toBe(RULES.LEADER_HP - 4);
    expect(r.players[1].lanes.ground1.front?.hp).toBe(5); // blocker untouched
    expect(r.players[0].lanes.ground1.front?.hp).toBe(4); // no retaliation
  });

  it('Airborne intercepts Overshot in its lane and retaliates', () => {
    const s = blankState();
    place(s, 0, 'ground1', unit({ owner: 0, attack: 4, hp: 4, keywords: { overshot: true } }));
    place(s, 1, 'ground1', unit({ owner: 1, attack: 3, hp: 5, keywords: { airborne: true } }));
    const r = run(s);
    expect(r.players[1].leaderHp).toBe(RULES.LEADER_HP); // leader safe
    expect(r.players[1].lanes.ground1.front?.hp).toBe(1); // 5 - 4
    expect(r.players[0].lanes.ground1.front?.hp).toBe(1); // 4 - 3 retaliation
  });

  it('Taunt redirects a leader-bound attack to itself', () => {
    const s = blankState();
    place(s, 0, 'ground1', unit({ owner: 0, attack: 4, hp: 4 })); // empty across
    place(s, 1, 'ground2', unit({ owner: 1, attack: 0, hp: 5, keywords: { taunt: true } }));
    const r = run(s);
    expect(r.players[1].leaderHp).toBe(RULES.LEADER_HP);
    expect(r.players[1].lanes.ground2.front?.hp).toBe(1); // 5 - 4
  });

  it('Taunt does NOT stop Overshot without Airborne', () => {
    const s = blankState();
    place(s, 0, 'ground1', unit({ owner: 0, attack: 4, hp: 4, keywords: { overshot: true } }));
    place(s, 1, 'ground2', unit({ owner: 1, attack: 0, hp: 5, keywords: { taunt: true } }));
    const r = run(s);
    expect(r.players[1].leaderHp).toBe(RULES.LEADER_HP - 4);
  });

  it('Brittle destroys the attacker after it strikes', () => {
    const s = blankState();
    place(s, 0, 'ground1', unit({ owner: 0, attack: 3, hp: 2, keywords: { brittle: true } }));
    place(s, 1, 'ground1', unit({ owner: 1, attack: 1, hp: 5 }));
    const r = run(s);
    expect(r.players[1].lanes.ground1.front?.hp).toBe(2); // took the 3 damage
    expect(r.players[0].lanes.ground1.front).toBeUndefined(); // attacker crumbled
  });

  it('Brittle still crumbles when hitting the leader (no enemy in lane)', () => {
    const s = blankState();
    place(s, 0, 'ground1', unit({ owner: 0, attack: 3, hp: 4, keywords: { brittle: true } }));
    const r = run(s);
    expect(r.players[1].leaderHp).toBe(RULES.LEADER_HP - 3);
    expect(r.players[0].lanes.ground1.front).toBeUndefined(); // attacker crumbled
  });

  // Adjacency is derived from LANES order, which IS the physical board: heights, ground1,
  // water, ground2, heights2. So ground1's neighbours are Heights and Water — NOT Ground 2,
  // which is now two columns away with Water between them. The Water unit is Aquatic so it
  // does not drown and muddy the reading.
  it('Branch Shot hits adjacent lanes only, with no retaliation', () => {
    const s = blankState();
    place(s, 0, 'ground1', unit({ owner: 0, attack: 3, hp: 5, keywords: { branchShot: true } }));
    place(s, 1, 'heights', unit({ owner: 1, attack: 0, hp: 5 }));
    place(s, 1, 'ground1', unit({ owner: 1, attack: 9, hp: 5 })); // own lane: must be ignored
    place(s, 1, 'water', unit({ owner: 1, attack: 0, hp: 5, keywords: { aquatic: true } }));
    place(s, 1, 'ground2', unit({ owner: 1, attack: 0, hp: 5 })); // two columns away: untouched
    const r = run(s);
    expect(r.players[1].lanes.heights.front?.hp).toBe(2);
    expect(r.players[1].lanes.water.front?.hp).toBe(2);
    expect(r.players[1].lanes.ground2.front?.hp).toBe(5); // not adjacent
    expect(r.players[1].lanes.ground1.front?.hp).toBe(5); // own lane untouched
    expect(r.players[0].lanes.ground1.front?.hp).toBe(5); // no retaliation
  });

  /**
   * Branch Shot used to `return` before Splash Damage was ever checked, so a unit with
   * both keywords simply never splashed — one of its two abilities was dead weight, and
   * nothing said so. They answer different questions and now compose: Splash contributes
   * its own lane's shot plus collateral on the neighbours, Branch adds a full shot into
   * each neighbour. Net: neighbours hit TWICE, the target lane once.
   */
  it('Branch Shot + Splash compose: neighbours twice, own lane once', () => {
    const s = blankState();
    place(s, 0, 'ground1', unit({ owner: 0, attack: 2, hp: 20, keywords: { branchShot: true, splashDamage: true } }));
    place(s, 1, 'ground1', unit({ owner: 1, attack: 0, hp: 9 }));
    place(s, 1, 'heights', unit({ owner: 1, attack: 0, hp: 9 }));
    place(s, 1, 'water', unit({ owner: 1, attack: 0, hp: 9, keywords: { aquatic: true } }));
    place(s, 1, 'ground2', unit({ owner: 1, attack: 0, hp: 9 })); // two columns away
    const r = run(s);
    expect(r.players[1].lanes.heights.front?.hp).toBe(5); // 2 hits of 2
    expect(r.players[1].lanes.water.front?.hp).toBe(5); // 2 hits of 2
    expect(r.players[1].lanes.ground1.front?.hp).toBe(7); // 1 hit of 2
    expect(r.players[1].lanes.ground2.front?.hp).toBe(9); // untouched
  });

  it('Branch Shot alone still skips its own lane — composing did not merge the two', () => {
    const s = blankState();
    place(s, 0, 'ground1', unit({ owner: 0, attack: 2, hp: 20, keywords: { branchShot: true } }));
    place(s, 1, 'ground1', unit({ owner: 1, attack: 0, hp: 9 }));
    place(s, 1, 'heights', unit({ owner: 1, attack: 0, hp: 9 }));
    const r = run(s);
    expect(r.players[1].lanes.ground1.front?.hp).toBe(9);
    expect(r.players[1].lanes.heights.front?.hp).toBe(7);
  });

  it('Splash hits own + adjacent lanes; only the own-lane unit retaliates', () => {
    const s = blankState();
    place(s, 0, 'ground1', unit({ owner: 0, attack: 3, hp: 10, keywords: { splashDamage: true } }));
    place(s, 1, 'ground1', unit({ owner: 1, attack: 2, hp: 5 }));
    place(s, 1, 'heights', unit({ owner: 1, attack: 5, hp: 5 }));
    place(s, 1, 'water', unit({ owner: 1, attack: 5, hp: 5, keywords: { aquatic: true } }));
    place(s, 1, 'ground2', unit({ owner: 1, attack: 5, hp: 5 })); // two columns away: untouched
    const r = run(s);
    expect(r.players[1].lanes.ground1.front?.hp).toBe(2);
    expect(r.players[1].lanes.heights.front?.hp).toBe(2);
    expect(r.players[1].lanes.water.front?.hp).toBe(2);
    expect(r.players[1].lanes.ground2.front?.hp).toBe(5); // not adjacent
    expect(r.players[0].lanes.ground1.front?.hp).toBe(8); // only own-lane (2) retaliates
  });

  it('Splash collateral reaches the leader when an adjacent lane is empty', () => {
    const s = blankState();
    place(s, 0, 'ground1', unit({ owner: 0, attack: 3, hp: 10, keywords: { splashDamage: true } }));
    place(s, 1, 'ground1', unit({ owner: 1, attack: 0, hp: 5 })); // own lane — takes the main shot
    // heights and water (both adjacent to ground1) are left empty.
    const r = run(s);
    expect(r.players[1].lanes.ground1.front?.hp).toBe(2); // main shot landed
    expect(r.players[1].leaderHp).toBe(RULES.LEADER_HP - 6); // 3 (heights) + 3 (water) collateral
  });

  it('Splash collateral into an empty lane is redirected to a Taunt unit instead of the leader', () => {
    const s = blankState();
    place(s, 0, 'ground1', unit({ owner: 0, attack: 3, hp: 10, keywords: { splashDamage: true } }));
    place(s, 1, 'ground1', unit({ owner: 1, attack: 0, hp: 5 }));
    place(s, 1, 'ground2', unit({ owner: 1, attack: 0, hp: 9, keywords: { taunt: true } })); // not adjacent, but eligible to intercept
    const r = run(s);
    expect(r.players[1].lanes.ground2.front?.hp).toBe(3); // absorbed both empty-lane shots: 9 - 3 - 3
    expect(r.players[1].leaderHp).toBe(RULES.LEADER_HP);
  });

  it('Strike Through hits the unit and the leader simultaneously', () => {
    const s = blankState();
    place(s, 0, 'ground1', unit({ owner: 0, attack: 3, hp: 10, keywords: { strikeThrough: true } }));
    place(s, 1, 'ground1', unit({ owner: 1, attack: 0, hp: 5 }));
    const r = run(s);
    expect(r.players[1].lanes.ground1.front?.hp).toBe(2);
    expect(r.players[1].leaderHp).toBe(RULES.LEADER_HP - 3);
  });

  it('Strike Through leader portion is absorbed by a Double Team back card', () => {
    const s = blankState();
    place(s, 0, 'ground1', unit({ owner: 0, attack: 3, hp: 10, keywords: { strikeThrough: true } }));
    place(s, 1, 'ground1', unit({ owner: 1, attack: 0, hp: 5 }));
    place(s, 1, 'ground1', unit({ owner: 1, attack: 0, hp: 5 }), 'back');
    const r = run(s);
    expect(r.players[1].leaderHp).toBe(RULES.LEADER_HP); // protected
    expect(r.players[1].lanes.ground1.back?.hp).toBe(2);
  });

  it('Double Strike attacks twice but is retaliated against once', () => {
    const s = blankState();
    place(s, 0, 'ground1', unit({ owner: 0, attack: 2, hp: 10, keywords: { doubleStrike: true } }));
    place(s, 1, 'ground1', unit({ owner: 1, attack: 3, hp: 10 }));
    const r = run(s);
    expect(r.players[1].lanes.ground1.front?.hp).toBe(6); // 10 - 2 - 2
    expect(r.players[0].lanes.ground1.front?.hp).toBe(7); // 10 - 3 once
  });

  it('Sniper in Heights retargets to an enemy lane that has a unit', () => {
    const s = blankState();
    place(s, 0, 'heights', unit({ owner: 0, attack: 3, hp: 5, keywords: { sniper: true } }));
    place(s, 1, 'ground2', unit({ owner: 1, attack: 0, hp: 5 }));
    const r = run(s);
    expect(r.players[1].lanes.ground2.front?.hp).toBe(2);
    expect(r.players[1].leaderHp).toBe(RULES.LEADER_HP);
  });

  it('Sniper hitting another lane does NOT provoke retaliation (attacker is not across)', () => {
    const s = blankState();
    place(s, 0, 'heights', unit({ owner: 0, attack: 3, hp: 5, keywords: { sniper: true } }));
    place(s, 1, 'ground2', unit({ owner: 1, attack: 4, hp: 5 }));
    const r = run(s);
    expect(r.players[1].lanes.ground2.front?.hp).toBe(2); // 5 - 3 sniper damage
    expect(r.players[0].lanes.heights.front?.hp).toBe(5); // sniper untouched — no cross-lane retaliation
  });

  it('Airborne Sniper from a ground lane snipes without retaliation either', () => {
    const s = blankState();
    place(s, 0, 'ground1', unit({ owner: 0, attack: 3, hp: 5, keywords: { sniper: true, airborne: true } }));
    place(s, 1, 'water', unit({ owner: 1, attack: 9, hp: 5 })); // auto-targeted (first enemy lane with a unit)
    const r = run(s);
    expect(r.players[1].lanes.water.front?.hp).toBe(2); // 5 - 3 sniped
    expect(r.players[0].lanes.ground1.front?.hp).toBe(5); // no retaliation from the sniped lane
  });

  it('Sniper + Splash: collateral lands adjacent to the sniper-picked lane, and on-hit procs there', () => {
    const s = blankState();
    const sniper = unit({ owner: 0, attack: 3, hp: 5, keywords: { sniper: true, splashDamage: true }, onHit: { poison: true } });
    place(s, 0, 'heights', sniper);
    place(s, 1, 'ground1', unit({ owner: 1, attack: 0, hp: 9 })); // adjacent to heights AND water — decoy
    place(s, 1, 'water', unit({ owner: 1, attack: 0, hp: 9 })); // sniper's redirect target; ground1 & ground2 adjacent to it
    place(s, 1, 'ground2', unit({ owner: 1, attack: 0, hp: 9 }));
    const r = run(s, { [sniper.iid]: 'water' });
    // Main shot lands on the sniper-chosen lane (water), collateral on ITS neighbours (ground1, ground2) —
    // not on heights, which is adjacent to the attacker's own lane, not the redirected one.
    expect(r.players[1].lanes.water.front?.hp).toBe(6);
    expect(r.players[1].lanes.water.front?.status.poisoned).toBeTruthy(); // on-hit proc'd on the main shot
    expect(r.players[1].lanes.ground1.front?.hp).toBe(6); // collateral
    expect(r.players[1].lanes.ground2.front?.hp).toBe(6); // collateral
  });

  it('Branch Shot + Overshot: both wings overshoot and are absorbed by an Airborne+Taunt interceptor', () => {
    const s = blankState();
    place(s, 0, 'ground1', unit({ owner: 0, attack: 4, hp: 6, keywords: { branchShot: true, overshot: true } }));
    // Overshot is an attribute attached to each shot, so a Branch Shot + Overshot unit fires its
    // two wings AS Overshot shots (no separate main shot). The two empty adjacent lanes both
    // overshoot toward the leader; the lone Airborne + Taunt interceptor (in non-adjacent water)
    // absorbs BOTH hits and the leader is protected.
    place(s, 1, 'water', unit({ owner: 1, attack: 2, hp: 9, keywords: { airborne: true, taunt: true } }));
    const r = run(s);
    expect(r.players[1].lanes.water.front?.hp).toBe(1); // 9 - 4 - 4: both wings intercepted
    expect(r.players[1].leaderHp).toBe(RULES.LEADER_HP); // leader protected by the interceptor
  });
});

describe('defensive keywords', () => {
  it('Shield blocks a whole instance and is consumed', () => {
    const s = blankState();
    place(s, 0, 'ground1', unit({ owner: 0, attack: 5, hp: 5 }));
    place(s, 1, 'ground1', unit({ owner: 1, attack: 0, hp: 3, keywords: { shield: 1 } }));
    const r = run(s);
    expect(r.players[1].lanes.ground1.front?.hp).toBe(3); // blocked
    expect(r.players[1].lanes.ground1.front?.shield).toBe(0);
  });

  it('Tough reduces incoming damage', () => {
    const s = blankState();
    place(s, 0, 'ground1', unit({ owner: 0, attack: 5, hp: 5 }));
    place(s, 1, 'ground1', unit({ owner: 1, attack: 0, hp: 10, keywords: { tough: 2 } }));
    const r = run(s);
    expect(r.players[1].lanes.ground1.front?.hp).toBe(7); // 10 - (5 - 2)
  });

  it('Spike reflects damage to the attacker', () => {
    const s = blankState();
    place(s, 0, 'ground1', unit({ owner: 0, attack: 3, hp: 4 }));
    place(s, 1, 'ground1', unit({ owner: 1, attack: 0, hp: 10, keywords: { spike: 2 } }));
    const r = run(s);
    expect(r.players[0].lanes.ground1.front?.hp).toBe(2); // took 2 spike
  });

  it('Lethal destroys the target and persists for the turn', () => {
    const s = blankState();
    place(s, 0, 'ground1', unit({ owner: 0, attack: 1, hp: 5, keywords: { lethal: true } }));
    place(s, 1, 'ground1', unit({ owner: 1, attack: 0, hp: 10 }));
    const r = run(s);
    expect(r.players[1].lanes.ground1.front).toBeUndefined();
    // Lethal is no longer consumed on use — it lasts the whole turn (like True Shield), so a
    // unit with reach/multi-hit can chain kills. The keyword remains on the attacker.
    expect(r.players[0].lanes.ground1.front?.keywords.lethal).toBe(true);
  });

<<<<<<< Updated upstream
  it('Undershot bypasses Shield, Tough, and Spike', () => {
=======
  it('Lethal and on-hit statuses do not affect an undefended leader — only plain attack damage lands', () => {
    const s = blankState();
    place(
      s,
      0,
      'ground1',
      unit({ owner: 0, attack: 3, hp: 5, keywords: { lethal: true }, onHit: { poison: true, freeze: true } }),
    );
    // No blocker in lane 1 — the attack falls through to the leader.
    const r = run(s);
    // Only the plain attack value lands; Lethal does not zero out the leader's HP.
    expect(r.players[1].leaderHp).toBe(RULES.LEADER_HP - 3);
    expect(r.players[1].leaderHp).toBeGreaterThan(0);
  });

  it('Pierce bypasses Shield, Tough, and Spike', () => {
>>>>>>> Stashed changes
    const s = blankState();
    place(s, 0, 'ground1', unit({ owner: 0, attack: 3, hp: 5, keywords: { undershot: true } }));
    place(
      s,
      1,
      'ground1',
      unit({ owner: 1, attack: 0, hp: 5, keywords: { shield: 2, tough: 2, spike: 2 } }),
    );
    const r = run(s);
    expect(r.players[1].lanes.ground1.front?.hp).toBe(2); // full 3 lands
    expect(r.players[1].lanes.ground1.front?.shield).toBe(2); // untouched
    expect(r.players[0].lanes.ground1.front?.hp).toBe(5); // no spike
  });

  it('Undershot targets the deepest (back) unit in a stack', () => {
    const s = blankState();
    place(s, 0, 'ground1', unit({ owner: 0, attack: 3, hp: 5, keywords: { undershot: true } }));
    place(s, 1, 'ground1', unit({ owner: 1, attack: 0, hp: 5 }));
    place(s, 1, 'ground1', unit({ owner: 1, attack: 0, hp: 4 }), 'back');
    const r = run(s);
    expect(r.players[1].lanes.ground1.back?.hp).toBe(1); // 4 - 3
    expect(r.players[1].lanes.ground1.front?.hp).toBe(5); // untouched
  });

  it('Immunity stops Undershot from bypassing defenses', () => {
    const s = blankState();
    place(s, 0, 'ground1', unit({ owner: 0, attack: 3, hp: 5, keywords: { undershot: true } }));
    place(s, 1, 'ground1', unit({ owner: 1, attack: 0, hp: 5, keywords: { immunity: true, shield: 1 } }));
    const r = run(s);
    expect(r.players[1].lanes.ground1.front?.hp).toBe(5); // shield still blocks
    expect(r.players[1].lanes.ground1.front?.shield).toBe(0);
  });

  it('True Shield blocks normal combat damage', () => {
    const s = blankState();
    place(s, 0, 'ground1', unit({ owner: 0, attack: 10, hp: 5 }));
    place(s, 1, 'ground1', unit({ owner: 1, attack: 0, hp: 5, keywords: { trueShield: true } }));
    const r = run(s);
    expect(r.players[1].lanes.ground1.front?.hp).toBe(5);
  });

  it('Undershot now pierces True Shield (and every other defense)', () => {
    const s = blankState();
    place(s, 0, 'ground1', unit({ owner: 0, attack: 10, hp: 5, keywords: { undershot: true } }));
    place(s, 1, 'ground1', unit({ owner: 1, attack: 0, hp: 5, keywords: { trueShield: true } }));
    const r = run(s);
    expect(r.players[1].lanes.ground1.front).toBeUndefined(); // True Shield no longer stops Undershot
  });

  it('the whole struck lane retaliates, including the un-hit Double Team back unit', () => {
    const s = blankState();
    place(s, 0, 'ground1', unit({ owner: 0, attack: 1, hp: 10 }));
    place(s, 1, 'ground1', unit({ owner: 1, attack: 2, hp: 5 }));         // front: hit
    place(s, 1, 'ground1', unit({ owner: 1, attack: 3, hp: 5 }), 'back'); // back: not personally hit
    const r = run(s);
    expect(r.players[1].lanes.ground1.front?.hp).toBe(4);  // 5 - 1 (only the front was hit)
    expect(r.players[0].lanes.ground1.front?.hp).toBe(5);  // 10 - (2 + 3): both retaliate
  });
});
