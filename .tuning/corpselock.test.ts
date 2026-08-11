import { it } from 'vitest';
import { probeHeroDisable } from './heroDisable';

/**
 * Cancerous Growth, reversed (borrow now / repay next round) vs the same power switched off.
 * Pre-change baseline was 61 / 61 / delta 0.0 over the same 384 games.
 */
it('corpselock: reversed power contribution', () => {
  const r = probeHeroDisable('corpselock');
  console.log(`\nRamp with power    : ${r.control.toFixed(1)}`);
  console.log(`Ramp power disabled: ${r.disabled.toFixed(1)}`);
  console.log(`delta              : ${r.delta >= 0 ? '+' : ''}${r.delta.toFixed(1)}  (was 0.0)`);
  console.log(`activations/game   : ${r.actsPerGame.toFixed(2)}   games: ${r.games * 2}`);
}, 3_600_000);
