import type { NodeKind, RunState } from '@adventure/schema';
import { reachableNodeIds } from '@adventure/run';
import { trialById } from '@adventure/trials';
import { bossForAct } from '@adventure/data/bosses';
import * as adv from '@adventure/store';

const KIND_ICON: Record<NodeKind, string> = {
  combat: '⚔',
  store: '⌸',
  enhance: '✧',
  trial: '⌂',
  boss: '♛',
  elite: '☠',
  rest: '☾',
  event: '?',
};
const KIND_LABEL: Record<NodeKind, string> = {
  combat: 'Battle',
  store: 'Store',
  enhance: 'Enhancement',
  trial: 'Trial',
  boss: 'BOSS',
  elite: 'Elite',
  rest: 'Rest Site',
  event: 'Event',
};

const W = 700;
const ROW_H = 92;
const PAD = 56;

/** The act map: an SVG of layered nodes, start at the bottom, boss on top. */
export function MapView({ run }: { run: RunState }) {
  const { layers, nodes } = run.map;
  const H = PAD * 2 + (layers.length - 1) * ROW_H;
  const pos = (id: string): { x: number; y: number } => {
    const n = nodes[id]!;
    const width = layers[n.layer]!.length;
    return { x: ((n.col + 1) / (width + 1)) * W, y: H - PAD - n.layer * ROW_H };
  };
  const reachable = new Set(reachableNodeIds(run));

  return (
    <div className="advmap">
      <svg viewBox={`0 0 ${W} ${H}`} className="advmap__svg">
        {/* Edges under the nodes. */}
        {Object.values(nodes).map((n) =>
          n.next.map((t) => {
            const a = pos(n.id);
            const b = pos(t);
            const lit = run.currentNodeId === n.id && reachable.has(t);
            return (
              <line
                key={`${n.id}->${t}`}
                x1={a.x} y1={a.y - 26} x2={b.x} y2={b.y + 26}
                className={`advmap__edge${lit ? ' advmap__edge--lit' : ''}`}
              />
            );
          }),
        )}
        {Object.values(nodes).map((n) => {
          const { x, y } = pos(n.id);
          const canGo = reachable.has(n.id);
          const isCurrent = run.currentNodeId === n.id;
          const twist = n.twistId ? trialById(n.twistId) : undefined;
          const boss = n.kind === 'boss' ? bossForAct(n.seed, run.act) : undefined;
          const tip = boss
            ? `${boss.name} — ${boss.gimmick}`
            : `${KIND_LABEL[n.kind]}${twist ? ` — ${twist.name}: ${twist.blurb}` : ''}`;
          const cls = [
            'advmap__node',
            canGo ? 'advmap__node--go' : '',
            n.visited ? 'advmap__node--done' : '',
            isCurrent ? 'advmap__node--here' : '',
            n.kind === 'boss' ? 'advmap__node--boss' : '',
            n.kind === 'trial' ? 'advmap__node--trial' : '',
            n.kind === 'elite' ? 'advmap__node--elite' : '',
          ].filter(Boolean).join(' ');
          return (
            <g key={n.id} className={cls} onClick={() => canGo && adv.pickNode(n.id)}>
              <title>{tip}</title>
              <circle cx={x} cy={y} r={n.kind === 'boss' ? 30 : 24} />
              <text x={x} y={y + 1} textAnchor="middle" dominantBaseline="middle" className="advmap__icon">
                {n.kind === 'boss' && boss ? boss.icon : KIND_ICON[n.kind]}
              </text>
              <text x={x} y={y + (n.kind === 'boss' ? 46 : 40)} textAnchor="middle" className="advmap__label">
                {n.visited ? '✓' : n.kind === 'boss' && boss ? boss.name : KIND_LABEL[n.kind]}
              </text>
            </g>
          );
        })}
      </svg>
      <p className="muted advmap__hint">
        {run.currentNodeId === null
          ? 'Choose where to begin — any node on the bottom row.'
          : 'Follow the paths upward. The boss waits at the top.'}
      </p>
    </div>
  );
}
