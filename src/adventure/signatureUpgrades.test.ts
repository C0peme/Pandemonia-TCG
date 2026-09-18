/**
 * The per-leader Signature buffs (act 2 boss reward).
 *
 * `SIGNATURE_UPGRADES` shipped empty for a long time — the delivery framework existed but
 * no leader had content, so `bossUnlock` fell through and every act-2 boss quietly paid a
 * bonus relic instead. These tests exist to keep that from silently happening again, and
 * to catch the failure mode the transform shape invites: a `card` function that matches
 * the wrong card type is a NO-OP, so an authoring slip produces an upgrade that claims to
 * do something and changes nothing.
 */
import { describe, expect, it } from 'vitest';
import { buildRegistry } from '@cards/registry';
import { starterCards, starterLeaders } from '@cards/data/starter';
import { SIGNATURE_UPGRADES, signatureUpgrade, applySignatureUpgrade } from '@adventure/hero';
import { ADVENTURE_STARTERS } from '@adventure/data/starters';
import { parseCard } from '@cards/schema';
import type { Card } from '@cards/schema';
import { GRANTABLE_KEYWORD_KEYS } from '@cards/schema';

const base = buildRegistry(starterCards, starterLeaders);
const sigOf = (leaderId: string): Card => {
  const leader = base.leaders.get(leaderId)!;
  const card = base.cards.get(leader.signatureCardId);
  if (!card) throw new Error(`${leaderId}: signature ${leader.signatureCardId} missing`);
  return card;
};
const authored = Object.keys(SIGNATURE_UPGRADES);

describe('SIGNATURE_UPGRADES', () => {
  it('is authored for every playable Adventure leader', () => {
    const missing = starterLeaders
      .filter((l) => ADVENTURE_STARTERS[l.id])
      .map((l) => l.id)
      .filter((id) => !SIGNATURE_UPGRADES[id]);
    expect(missing).toEqual([]);
  });

  it.each(authored)('%s: actually changes its signature card', (leaderId) => {
    const before = sigOf(leaderId);
    const after = applySignatureUpgrade(leaderId, before, true);
    // A transform that fell through its type guard would return an identical card.
    expect(after).not.toEqual(before);
    expect(after.id).toBe(before.id);
    expect(after.type).toBe(before.type);
  });

  it.each(authored)('%s: still produces a schema-valid card', (leaderId) => {
    const after = applySignatureUpgrade(leaderId, sigOf(leaderId), true);
    expect(() => parseCard(after)).not.toThrow();
  });

  it.each(authored)('%s: never mutates the base card definition', (leaderId) => {
    const before = sigOf(leaderId);
    const snapshot = structuredClone(before);
    applySignatureUpgrade(leaderId, before, true);
    // `applySignatureUpgrade` clones before transforming; if it ever stopped, the shared
    // registry def would be corrupted for every later fight in the run.
    expect(before).toEqual(snapshot);
  });

  it.each(authored)('%s: is inert until the buff is claimed', (leaderId) => {
    const before = sigOf(leaderId);
    expect(applySignatureUpgrade(leaderId, before, false)).toBe(before);
  });

  it.each(authored)('%s: carries display copy for the reward screen', (leaderId) => {
    const up = signatureUpgrade(leaderId)!;
    expect(up.name.length).toBeGreaterThan(0);
    expect(up.icon.length).toBeGreaterThan(0);
    expect(up.desc.length).toBeGreaterThan(0);
  });

  it('re-points every card id it references at something that exists', () => {
    for (const leaderId of authored) {
      const after = applySignatureUpgrade(leaderId, sigOf(leaderId), true);
      if (after.type !== 'spell') continue;
      for (const e of after.effects) {
        if (!e.cardId) continue;
        expect(base.cards.has(e.cardId), `${leaderId} -> ${e.cardId}`).toBe(true);
      }
    }
  });
});

describe('specific upgrades', () => {
  it('Kedou conjures the second signature card rather than doing both jobs at once', () => {
    const after = applySignatureUpgrade('kedou', sigOf('kedou'), true);
    expect(after.type).toBe('spell');
    if (after.type !== 'spell') return;
    expect(after.effects.some((e) => e.kind === 'conjure' && e.cardId === 'sig-scalding-veil')).toBe(true);
    // The base burn must survive alongside it.
    expect(after.effects.some((e) => e.kind === 'applyStatus' && e.status === 'burn')).toBe(true);
  });

  it("Scalding Veil grants on-hit burn, which a buff could not do before this pass", () => {
    const veil = base.cards.get('sig-scalding-veil')!;
    expect(veil.type).toBe('spell');
    if (veil.type !== 'spell') return;
    expect(veil.effects[0]).toMatchObject({ kind: 'buff', target: 'all-ally', onHit: { burn: 2 } });
  });

  it('Autopus re-points its summons at the Double-Team token', () => {
    const after = applySignatureUpgrade('autopus', sigOf('autopus'), true);
    if (after.type !== 'spell') throw new Error('expected a spell');
    const summons = after.effects.filter((e) => e.kind === 'summon');
    expect(summons.length).toBeGreaterThan(0);
    for (const s of summons) expect(s.cardId).toBe('critter-elite-pair');
    const token = base.cards.get('critter-elite-pair')!;
    expect(token.type === 'unit' && token.keywords.doubleTeam).toBe(true);
  });

  it('Eksana strikes twice', () => {
    const before = sigOf('eksana');
    const after = applySignatureUpgrade('eksana', before, true);
    if (before.type !== 'spell' || after.type !== 'spell') throw new Error('expected spells');
    const dmg = (c: typeof before) => c.effects.filter((e) => e.kind === 'damage').length;
    expect(dmg(after)).toBe(dmg(before) * 2);
  });

  it('Noctua grants a repeating Countdown from a signature that is now a SPELL', () => {
    // Death Goddess' Will was ground that granted its keywords to whatever bonded on top; it is
    // now a spell that grants them to a unit already in play. The upgrade had to move with it —
    // it used `grantKw`, which only touches a Foundation, so on a spell it did nothing at all.
    const after = applySignatureUpgrade('noctua', sigOf('noctua'), true);
    if (after.type !== 'spell') throw new Error('expected a spell');
    const buff = after.effects.find((e) => e.kind === 'buff');
    expect(buff?.target, 'aimed at a unit already on the board').toBe('ally');
    expect(buff?.keywords?.countdown).toMatchObject({ turns: 2, repeat: true });
    // A GRANTED countdown must repeat — the clock is the unit's age, so a one-shot would need
    // the target to be exactly `turns` old at the moment of the grant and would otherwise
    // never fire at all.
    expect(buff?.keywords?.countdown?.repeat, 'a granted countdown must repeat').toBe(true);
    // The original grants must survive the rewrite.
    expect(buff?.keywords?.immunity).toBe(true);
    expect(buff?.keywords?.zombified).toBe(true);
    expect(buff?.keywords?.growth).toEqual({ attack: 2, hp: 2 });
  });

  it("...and every keyword it grants is one a `buff` can actually wire up", () => {
    // The reason Countdown had to go: a `buff` merges keywords with a shallow `Object.assign`,
    // so anything outside `GRANTABLE_KEYWORD_KEYS` is authoring-only and would be a silent
    // no-op on the target. Asserted here rather than trusted, because nothing else checks it.
    const after = applySignatureUpgrade('noctua', sigOf('noctua'), true);
    if (after.type !== 'spell') throw new Error('expected a spell');
    for (const e of after.effects) {
      for (const k of Object.keys(e.keywords ?? {})) {
        expect(GRANTABLE_KEYWORD_KEYS, `${k} cannot be granted by a buff`).toContain(k);
      }
    }
  });

  it('Naife widens its buff to every ally instead of one', () => {
    const before = sigOf('naife');
    const after = applySignatureUpgrade('naife', before, true);
    if (before.type !== 'spell' || after.type !== 'spell') throw new Error('expected spells');
    expect(before.effects.find((e) => e.kind === 'buff')?.target).toBe('ally');
    expect(after.effects.find((e) => e.kind === 'buff')?.target).toBe('all-ally');
    expect(after.effects.filter((e) => e.kind === 'conjure' && e.cardId === 'tundra')).toHaveLength(2);
  });

  it('John Pork buries the enemy hand', () => {
    const after = applySignatureUpgrade('johnpork', sigOf('johnpork'), true);
    if (after.type !== 'spell') throw new Error('expected a spell');
    expect(after.effects.filter((e) => e.kind === 'conjure' && e.cardId === 'dead-weight')).toHaveLength(5);
    expect(after.effects.some((e) => e.kind === 'forget' && e.target === 'enemy')).toBe(true);
  });
});
