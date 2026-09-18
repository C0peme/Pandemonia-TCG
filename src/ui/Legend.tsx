/**
 * The Legend — one page that teaches the board's whole visual vocabulary.
 *
 * Everything the game says with a symbol is collected here, rendered in the EXACT chips the
 * board uses, so the colour language is learned alongside the glyphs: red chips threaten, blue
 * chips protect, gilt chips do something useful, violet chips are afflictions. A player who
 * reads this once should never need to hover a badge again.
 */
import { ABILITY_INFO, STATUS_INFO, ELEMENT_NAME } from '@cards/abilities';
import type { Keywords } from '@cards/schema';
import type { StatusState } from '@engine/types';
import { ELEMENTS, type Element } from '@engine/constants';
import { ElementRune } from '@ui/ElementRune';
import { badgeTone } from '@ui/App';

/** Keywords worth showing; the effect-only keys are folded into triggers and never worn. */
const HIDDEN: string[] = ['sacrifice', 'metamorphosis', 'countdown'];

type Row = { icon: string; name: string; desc: string; tone: 'atk' | 'def' | 'util' };

const abilityRows = (): Row[] =>
  (Object.keys(ABILITY_INFO) as (keyof Keywords)[])
    .filter((k) => !HIDDEN.includes(k as string))
    .map((k) => {
      const info = ABILITY_INFO[k];
      return { icon: info.icon, name: info.name, desc: info.describe(1), tone: badgeTone(k as string) };
    });

const statusRows = (): { icon: string; name: string; desc: string }[] =>
  (Object.keys(STATUS_INFO) as (keyof StatusState)[]).map((k) => {
    const info = STATUS_INFO[k];
    return { icon: info.icon, name: info.name, desc: info.describe(1) };
  });

/** Symbols the BOARD uses that aren't keywords or statuses — the rule cues. */
const BOARD_CUES: { icon: string; name: string; desc: string; tone: 'atk' | 'def' | 'util' }[] = [
  { icon: '⏳', name: 'Summoning sickness', desc: 'Played this turn — it cannot attack until your next turn.', tone: 'util' },
  { icon: '⇊', name: 'Water warning', desc: 'This unit would drown here: in Water its attack is pinned to 0 and it takes damage each turn.', tone: 'def' },
  { icon: '✕', name: 'Lane full', desc: 'No free slot. A lane holds two units only if one of them has Double Team.', tone: 'util' },
  { icon: '★', name: 'Signature', desc: 'At half your maximum HP, your leader’s Signature card is delivered to hand.', tone: 'util' },
  { icon: '↯', name: 'Energy', desc: 'Your spendable energy this turn. On a dimmed card it shows how much more you need.', tone: 'util' },
  { icon: '⬡', name: 'Environment', desc: 'Occupies a lane and grants its keyword to every unit in that lane, both sides.', tone: 'util' },
  { icon: '⌂', name: 'Foundation', desc: 'Fights alone until a unit is placed on it, then bonds and grants that unit its stats.', tone: 'util' },
  { icon: '◈', name: 'Banked element', desc: 'Overflow energy stored as an element. Pays that element’s pips; each element has a cap.', tone: 'util' },
];

function Chip({ icon, tone }: { icon: string; tone: 'atk' | 'def' | 'util' | 'status' }) {
  const cls = tone === 'status' ? 'statusbadge' : `kwbadge kwbadge--${tone}`;
  return (
    <span className={cls}>
      <span className="kwbadge__icon" aria-hidden="true">{icon}</span>
    </span>
  );
}

function Section({ title, hint, children }: { title: string; hint: string; children: React.ReactNode }) {
  return (
    <section className="legend__section">
      <h3 className="legend__title">{title}</h3>
      <p className="legend__hint">{hint}</p>
      <div className="legend__grid">{children}</div>
    </section>
  );
}

function Entry({ icon, name, desc, tone }: { icon: string; name: string; desc: string; tone: 'atk' | 'def' | 'util' | 'status' }) {
  return (
    <div className="legend__row">
      <Chip icon={icon} tone={tone} />
      <span className="legend__name">{name}</span>
      <span className="legend__desc">{desc}</span>
    </div>
  );
}

export function Legend() {
  const abilities = abilityRows();
  const byTone = (t: 'atk' | 'def' | 'util'): Row[] => abilities.filter((a) => a.tone === t);
  return (
    <div className="legend">
      <p className="legend__lede">
        Every symbol the board uses, in the same colours it uses them. Colour tells you what a
        badge <em>means</em> before you read the glyph.
      </p>

      <Section title="Elements" hint="Each card belongs to one element; pips on a card are what it costs in that element.">
        {ELEMENTS.map((e: Element) => (
          <div className="legend__row" key={e}>
            <ElementRune element={e} size={20} />
            <span className="legend__name">{ELEMENT_NAME[e]}</span>
            <span className="legend__desc">Cards, banked energy and leader caps are all tracked per element.</span>
          </div>
        ))}
      </Section>

      <Section title="Threats" hint="Red — this unit hits harder, further or nastier than its attack number suggests.">
        {byTone('atk').map((a) => <Entry key={a.name} {...a} tone="atk" />)}
      </Section>

      <Section title="Protection" hint="Blue — this unit is harder to remove than its health number suggests.">
        {byTone('def').map((a) => <Entry key={a.name} {...a} tone="def" />)}
      </Section>

      <Section title="Utility" hint="Gilt — useful, but not a direct combat threat or defence.">
        {byTone('util').map((a) => <Entry key={a.name} {...a} tone="util" />)}
      </Section>

      <Section title="Afflictions" hint="Violet — something is being done TO this unit. These wear off or must be cleansed.">
        {statusRows().map((s) => <Entry key={s.name} {...s} tone="status" />)}
      </Section>

      <Section title="Board cues" hint="Symbols the battlefield itself uses to show you a rule.">
        {BOARD_CUES.map((c) => <Entry key={c.name} {...c} />)}
      </Section>
    </div>
  );
}
