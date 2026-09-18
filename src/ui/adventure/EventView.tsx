import { useContent } from '@ui/useContent';
import { Scene } from '@ui/adventure/Scene';
import type { RunState } from '@adventure/schema';
import { pickEvent, eventById, choiceSummary } from '@adventure/data/events';
import { requirementMet } from '@adventure/run';
import * as adv from '@adventure/store';

/** Event ('?') node: a narrative choice with a pure outcome per option. */
export function EventView({ run, nodeId }: { run: RunState; nodeId: string }) {
  const { registry } = useContent();
  const node = run.map.nodes[nodeId];
  if (!node) return null;
  // Read the event the node RECORDED on entry rather than re-picking: the pick prefers
  // unseen events and `seenEvents` grows, so a fresh lookup could show a different event
  // from the one `chooseEventOption` would resolve.
  const event = eventById(node.eventId ?? '') ?? pickEvent(node.seed, run.seenEvents, run.eventFlags);

  return (
    // The event's own body is the flavour, so the banner carries only its title —
    // the prose is the hero of this panel rather than a grey italic afterthought.
    <Scene kind="event" icon={event.icon} title={event.title}>
      <p className="advevent__body">{event.body}</p>
      {/* A deposit is the one payout in the run that lives outside the deck, the tray and
          the coin purse — without a line saying it exists, the player has no way to know
          they are owed anything. */}
      {run.eventBank > 0 && (
        <p className="advevent__banked">⊙ {run.eventBank} is being held for you somewhere on this road.</p>
      )}
      <div className="advevent__choices">
        {event.choices.map((choice, idx) => {
          const short = choice.cost !== undefined ? choice.cost - run.coins : 0;
          const tooPoor = short > 0;
          // An HP price is never allowed to be lethal (see `chooseEventOption`), so the
          // gate is "would this leave you standing", not "can you afford it".
          const tooHurt = choice.hpCost !== undefined && run.hp <= choice.hpCost;
          const tooSmall = choice.requiresDeck !== undefined && run.deck.length < choice.requiresDeck;
          // Gated on EXACTLY the predicate the reducer gates the transition on. A choice
          // whose `requires` fails is hidden rather than greyed: it is not a locked door
          // the player can work toward at this node, it is simply an offer that was never
          // made to this run (the bank has nothing of yours; you own no relic to sell).
          if (!requirementMet(run, choice.requires)) return null;
          const disabled = tooPoor || tooHurt || tooSmall;
          const note = tooPoor
            ? `⊙ ${short} short`
            : tooHurt
              ? `Needs more than ${choice.hpCost} HP — you have ${run.hp}`
              : tooSmall
                ? `Needs ${choice.requiresDeck} cards — you have ${run.deck.length}`
                : '';
          return (
            <button
              key={idx}
              className="advevent__choice"
              disabled={disabled}
              onClick={() => adv.chooseEventOption(registry, idx)}
            >
              <span>
                {choice.label}
                {choice.cost ? ` · ⊙ ${choice.cost}` : ''}
                {choice.hpCost ? <span className="advevent__blood"> · ❤ {choice.hpCost}</span> : null}
              </span>
              {/* Exactly what the option does, DERIVED from the outcome the reducer will
                  apply — so it can never drift from the effect the way the hand-written
                  label above it can. The label is flavour; this is the contract. */}
              <span className="advevent__effect">{choiceSummary(choice, registry)}</span>
              {note && <span className="advevent__note">{note}</span>}
            </button>
          );
        })}
      </div>
    </Scene>
  );
}
