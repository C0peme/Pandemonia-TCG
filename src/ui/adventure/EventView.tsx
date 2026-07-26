import { useContent } from '@ui/useContent';
import type { RunState } from '@adventure/schema';
import { eventForNode } from '@adventure/data/events';
import * as adv from '@adventure/store';

/** Event ('?') node: a narrative choice with a pure outcome per option. */
export function EventView({ run, nodeId }: { run: RunState; nodeId: string }) {
  const { registry } = useContent();
  const node = run.map.nodes[nodeId];
  if (!node) return null;
  const event = eventForNode(node.seed);

  return (
    <div className="advpanel advevent">
      <h2>{event.icon} {event.title}</h2>
      <p className="advevent__body">{event.body}</p>
      <div className="advevent__choices">
        {event.choices.map((choice, idx) => {
          const tooPoor = choice.cost !== undefined && run.coins < choice.cost;
          const tooSmall = choice.requiresDeck !== undefined && run.deck.length < choice.requiresDeck;
          const disabled = tooPoor || tooSmall;
          const note = tooPoor ? ' (not enough coins)' : tooSmall ? ' (deck too small)' : '';
          return (
            <button
              key={idx}
              className="advevent__choice"
              disabled={disabled}
              onClick={() => adv.chooseEventOption(registry, idx)}
            >
              <span>{choice.label}{choice.cost ? ` · ⊙ ${choice.cost}` : ''}</span>
              {note && <span className="advevent__note">{note}</span>}
            </button>
          );
        })}
      </div>
    </div>
  );
}
