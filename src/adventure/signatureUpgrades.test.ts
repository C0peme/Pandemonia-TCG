import { describe, expect, it } from 'vitest';
import { buildRegistry } from '@cards/registry';
import { parseCard } from '@cards/schema';
import { starterCards, starterLeaders } from '@cards/data/starter';
import { SIGNATURE_UPGRADES, applySignatureUpgrade, signatureUpgrade } from '@adventure/hero';
import { buildRunRegistry } from '@adventure/runRegistry';

const base = buildRegistry(starterCards, starterLeaders);

/** The leader's authored (unbuffed) signature card. */
const baseSignature = (leaderId: string) => {
  const leader = base.leaders.get(leaderId);
  if (!leader) throw new Error(`no leader ${leaderId}`);
  const card = base.cards.get(leader.signatureCardId);
  if (!card) throw new Error(`no signature card for ${leaderId}`);
  return card;
};

describe('signature buffs (act 2 boss reward)', () => {
  it('authors one for every shipped leader', () => {
    const missing = starterLeaders.filter((l) => !SIGNATURE_UPGRADES[l.id]).map((l) => l.id);
    expect(missing).toEqual([]);
  });

  it('keys every entry to a real leader', () => {
    const unknown = Object.keys(SIGNATURE_UPGRADES).filter((id) => !base.leaders.has(id));
    expect(unknown).toEqual([]);
  });

  it.each(starterLeaders.map((l) => l.id))('%s: the buff produces a schema-valid card', (leaderId) => {
    const buffed = applySignatureUpgrade(leaderId, baseSignature(leaderId), true);
    // The transform bypasses Zod (applySignatureUpgrade only clones), so nothing else
    // would catch a malformed effect or an out-of-range stat until it hit the engine.
    expect(() => parseCard(buffed)).not.toThrow();
  });

  it.each(starterLeaders.map((l) => l.id))('%s: the buff actually changes the card', (leaderId) => {
    const card = baseSignature(leaderId);
    const buffed = applySignatureUpgrade(leaderId, card, true);
    expect(buffed).not.toEqual(card);
  });

  it.each(starterLeaders.map((l) => l.id))('%s: the buff keeps the card id and rewrites its text', (leaderId) => {
    const card = baseSignature(leaderId);
    const buffed = applySignatureUpgrade(leaderId, card, true);
    // runRegistry re-keys the rewritten def by `buffed.id`; a changed id would file the
    // buff under a card nothing looks up, and the player would get the base signature.
    expect(buffed.id).toBe(card.id);
    // The detail panel renders `text` verbatim, so the base line would misdescribe it.
    expect(buffed.text).toBeDefined();
    expect(buffed.text).not.toBe(card.text);
  });

  it.each(starterLeaders.map((l) => l.id))('%s: the buff preserves the card type', (leaderId) => {
    const card = baseSignature(leaderId);
    expect(applySignatureUpgrade(leaderId, card, true).type).toBe(card.type);
  });

  it('does nothing until the buff is claimed', () => {
    for (const leader of starterLeaders) {
      const card = baseSignature(leader.id);
      expect(applySignatureUpgrade(leader.id, card, false)).toEqual(card);
    }
  });

  it('leaves a leader with no authored buff untouched', () => {
    const card = baseSignature('orsyric');
    expect(signatureUpgrade('not-a-leader')).toBeUndefined();
    expect(applySignatureUpgrade('not-a-leader', card, true)).toEqual(card);
  });

  it('seats the buffed signature in the run registry only when the run has claimed it', () => {
    const leaderId = 'kedou';
    const sigId = base.leaders.get(leaderId)!.signatureCardId;

    const unclaimed = buildRunRegistry(base, { deck: [], playerLeaderId: leaderId });
    expect(unclaimed.cards.get(sigId)).toEqual(base.cards.get(sigId));

    const claimed = buildRunRegistry(base, { deck: [], playerLeaderId: leaderId, signatureBuff: true });
    const seated = claimed.cards.get(sigId);
    expect(seated).toBeDefined();
    expect(seated).not.toEqual(base.cards.get(sigId));
    // ...and the base registry is never mutated by the swap.
    expect(base.cards.get(sigId)).toEqual(baseSignature(leaderId));
  });
});
