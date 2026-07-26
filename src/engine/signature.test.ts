import { describe, expect, it } from 'vitest';
import { damageLeader, signatureThreshold } from '@engine/damage';
import { grantSignatureIfRoom } from '@engine/signature';
import { RULES } from '@engine/constants';
import { blankState } from '@engine/testkit';
import type { GameEvent } from '@engine/events';

describe('signature delivery', () => {
  it('delivers the Signature card to hand when the leader hits the threshold', () => {
    const s = blankState();
    s.players[0].leaderHp = RULES.SIGNATURE_HP_THRESHOLD + 2;
    const events: GameEvent[] = [];
    damageLeader(s, 0, 2, events);
    expect(s.players[0].signatureUnlocked).toBe(true);
    expect(s.players[0].signatureGranted).toBe(true);
    expect(s.players[0].hand.some((c) => c.cardId === 'v0')).toBe(true);
    expect(events.some((e) => e.t === 'signatureGranted')).toBe(true);
  });

  it('waits for a free slot when the hand is full, then delivers', () => {
    const s = blankState();
    s.players[0].leaderHp = RULES.SIGNATURE_HP_THRESHOLD + 1;
    s.players[0].hand = Array.from({ length: RULES.HAND_CAP }, (_, i) => ({ iid: `h${i}`, cardId: 'v1' }));
    const events: GameEvent[] = [];
    damageLeader(s, 0, 1, events);
    expect(s.players[0].signaturePending).toBe(true);
    expect(s.players[0].signatureGranted).toBe(false);
    expect(s.players[0].hand).toHaveLength(RULES.HAND_CAP);

    // Free up a slot, then retry.
    s.players[0].hand = s.players[0].hand.slice(1);
    grantSignatureIfRoom(s, 0, events);
    expect(s.players[0].signatureGranted).toBe(true);
    expect(s.players[0].hand.some((c) => c.cardId === 'v0')).toBe(true);
  });

  it('delivers only once', () => {
    const s = blankState();
    s.players[0].leaderHp = 10;
    const events: GameEvent[] = [];
    damageLeader(s, 0, 1, events); // already below threshold; unlocks + grants
    const handAfterFirst = s.players[0].hand.length;
    grantSignatureIfRoom(s, 0, events);
    grantSignatureIfRoom(s, 0, events);
    expect(s.players[0].hand).toHaveLength(handAfterFirst);
  });
});

describe('signatureThreshold (dynamic — half of the leader\'s own max HP)', () => {
  it('is half of leaderMaxHp when set', () => {
    expect(signatureThreshold({ leaderMaxHp: 20 } as never)).toBe(10);
    expect(signatureThreshold({ leaderMaxHp: 12 } as never)).toBe(6);
  });

  it('falls back to half of RULES.LEADER_HP when leaderMaxHp is absent (test fixtures)', () => {
    expect(signatureThreshold({} as never)).toBe(RULES.LEADER_HP / 2);
    expect(signatureThreshold({} as never)).toBe(RULES.SIGNATURE_HP_THRESHOLD);
  });

  it('a smaller-max-HP leader unlocks the Signature at a proportionally lower HP', () => {
    const s = blankState();
    s.players[0].leaderMaxHp = 20; // e.g. a scaled-down Adventure enemy
    s.players[0].leaderHp = 11; // above their threshold (10)
    const events: GameEvent[] = [];
    damageLeader(s, 0, 1, events); // → 10, exactly at half their OWN max HP
    expect(s.players[0].signatureUnlocked).toBe(true);
  });

  it('a bigger-max-HP leader unlocks at a proportionally HIGHER absolute HP than the old fixed 15', () => {
    const s = blankState();
    s.players[0].leaderMaxHp = 40; // more than the standard 30 HP → threshold is 20, not 15
    s.players[0].leaderHp = 18; // below the OLD fixed constant (15)? No — above it (18 > 15).
    const events: GameEvent[] = [];
    damageLeader(s, 0, 0, events); // re-check with no HP change
    // Under the old fixed rule (≤15) this would stay locked; under the new rule
    // (≤20) it's already unlocked at 18 HP — proving the dynamic threshold is live.
    expect(s.players[0].signatureUnlocked).toBe(true);
  });
});
