import { describe, expect, it } from 'vitest';
import { resolveCombat } from '@engine/combat';
import { blankState, place, unit } from '@engine/testkit';
import { RULES } from '@engine/constants';
import type { GameState } from '@engine/types';

const run = (s: GameState) => resolveCombat(s).state;

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

  it('Branch Shot hits adjacent lanes only, with no retaliation', () => {
    const s = blankState();
    place(s, 0, 'ground1', unit({ owner: 0, attack: 3, hp: 5, keywords: { branchShot: true } }));
    place(s, 1, 'heights', unit({ owner: 1, attack: 0, hp: 5 }));
    place(s, 1, 'ground1', unit({ owner: 1, attack: 9, hp: 5 })); // own lane: must be ignored
    place(s, 1, 'ground2', unit({ owner: 1, attack: 0, hp: 5 }));
    const r = run(s);
    expect(r.players[1].lanes.heights.front?.hp).toBe(2);
    expect(r.players[1].lanes.ground2.front?.hp).toBe(2);
    expect(r.players[1].lanes.ground1.front?.hp).toBe(5); // own lane untouched
    expect(r.players[0].lanes.ground1.front?.hp).toBe(5); // no retaliation
  });

  it('Splash hits own + adjacent lanes; only the own-lane unit retaliates', () => {
    const s = blankState();
    place(s, 0, 'ground1', unit({ owner: 0, attack: 3, hp: 10, keywords: { splashDamage: true } }));
    place(s, 1, 'ground1', unit({ owner: 1, attack: 2, hp: 5 }));
    place(s, 1, 'heights', unit({ owner: 1, attack: 5, hp: 5 }));
    place(s, 1, 'ground2', unit({ owner: 1, attack: 5, hp: 5 }));
    const r = run(s);
    expect(r.players[1].lanes.ground1.front?.hp).toBe(2);
    expect(r.players[1].lanes.heights.front?.hp).toBe(2);
    expect(r.players[1].lanes.ground2.front?.hp).toBe(2);
    expect(r.players[0].lanes.ground1.front?.hp).toBe(8); // only own-lane (2) retaliates
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

  it('Pierce bypasses Shield, Tough, and Spike', () => {
    const s = blankState();
    place(s, 0, 'ground1', unit({ owner: 0, attack: 3, hp: 5, keywords: { pierce: true } }));
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

  it('Pierce targets the deepest (back) unit in a stack', () => {
    const s = blankState();
    place(s, 0, 'ground1', unit({ owner: 0, attack: 3, hp: 5, keywords: { pierce: true } }));
    place(s, 1, 'ground1', unit({ owner: 1, attack: 0, hp: 5 }));
    place(s, 1, 'ground1', unit({ owner: 1, attack: 0, hp: 4 }), 'back');
    const r = run(s);
    expect(r.players[1].lanes.ground1.back?.hp).toBe(1); // 4 - 3
    expect(r.players[1].lanes.ground1.front?.hp).toBe(5); // untouched
  });

  it('Immunity stops Pierce from bypassing defenses', () => {
    const s = blankState();
    place(s, 0, 'ground1', unit({ owner: 0, attack: 3, hp: 5, keywords: { pierce: true } }));
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

  it('Pierce now pierces True Shield (and every other defense)', () => {
    const s = blankState();
    place(s, 0, 'ground1', unit({ owner: 0, attack: 10, hp: 5, keywords: { pierce: true } }));
    place(s, 1, 'ground1', unit({ owner: 1, attack: 0, hp: 5, keywords: { trueShield: true } }));
    const r = run(s);
    expect(r.players[1].lanes.ground1.front).toBeUndefined(); // True Shield no longer stops Pierce
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
