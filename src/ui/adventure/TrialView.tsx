import { useState } from 'react';
import { Scene } from '@ui/adventure/Scene';
import type { RunState } from '@adventure/schema';
import { trialById, twistSeverity, trialRewardBands, trialCoinMult } from '@adventure/trials';
import * as adv from '@adventure/store';

/**
 * Trial node: choose the condition, then fight.
 *
 * A Trial used to roll ONE twist. A twist is symmetric as a rule but not in effect —
 * "every unit has Immunity" is a shrug for a stat deck and deletes a poison deck's whole
 * game plan — so a single rolled twist landed as a coin flip on the player's archetype,
 * and the only response was to route around the node. Trials were measured as the second
 * deadliest node kind in the run, behind only bosses.
 *
 * Choosing from a shortlist made the twist a decision. Pricing it by SEVERITY is what
 * makes that decision a WAGER: before, every twist paid the same, so the shortlist was
 * only ever a search for the least inconvenient rule — and since a Trial has the same
 * enemy HP and deck size as a plain combat, taking the gentlest option made the node
 * strictly better than an ordinary fight. Now the gentle rule pays like the gentle rule,
 * and the reward is stated on the button before you commit to anything.
 */
const SEVERITY_LABEL: Record<1 | 2 | 3, string> = {
  1: 'Mild',
  2: 'Serious',
  3: 'Severe',
};

/** What a band list reads as on the reward line. */
const bandLabel = (bands: string[]): string =>
  bands.length === 1 ? `${bands[0]} relic` : `${bands.join(' / ')} relic`;

export function TrialView({ run, nodeId }: { run: RunState; nodeId: string }) {
  const node = run.map.nodes[nodeId];
  const [sel, setSel] = useState<string | null>(null);
  if (!node) return null;
  const choices = (node.twistChoices ?? []).map(trialById).filter((t) => t !== undefined);
  if (choices.length === 0) return null;

  return (
    <Scene
      kind="trial"
      icon="✦"
      title="Trial"
      flavour="A fight of ordinary strength, fought under a rule of your choosing. The harsher the rule you accept, the better it pays — pick the wager, not just the rule."
    >
      <div className="advtrial__choices">
        {choices.map((t) => {
          const severity = twistSeverity(t);
          return (
            <button
              key={t.id}
              className={`advtrial__twist advtrial__twist--sev${severity}${sel === t.id ? ' advtrial__twist--sel' : ''}`}
              onClick={() => setSel(t.id)}
            >
              <span className="advtrial__head">
                <strong>{t.name}</strong>
                <span className={`advtrial__sev advtrial__sev--${severity}`}>{SEVERITY_LABEL[severity]}</span>
              </span>
              <span className="muted">{t.blurb}</span>
              {/* Stated before the choice, not discovered after it — the whole point of
                  pricing the twist is that the player can weigh the two sides. */}
              <span className="advtrial__pays">
                Pays {bandLabel(trialRewardBands(severity))} · {Math.round(trialCoinMult(severity) * 100)}% coins
              </span>
            </button>
          );
        })}
      </div>
      <div className="advpanel__actions">
        <button className="btn-end" disabled={!sel} onClick={() => sel && adv.chooseTrialTwist(sel)}>
          {sel ? '⚔ Enter the Trial' : 'Choose a condition'}
        </button>
      </div>
    </Scene>
  );
}
