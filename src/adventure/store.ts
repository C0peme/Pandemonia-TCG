/**
 * Persistent Adventure run store (mirrors the cards/store.ts vanilla-store pattern).
 *
 * Holds the current run (or null), persists it to localStorage on every commit, and
 * notifies subscribers so React can bind via useSyncExternalStore. All game logic
 * lives in the pure reducer (run.ts); this module only wires persistence.
 */
import type { Registry } from '@cards/registry';
import { parseRun, type RunState } from '@adventure/schema';
import * as reducer from '@adventure/run';

const LS_KEY = 'pandemonia.adventure.v1';

const loadRun = (): RunState | null => {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return null;
    return parseRun(JSON.parse(raw));
  } catch {
    return null;
  }
};

const saveRun = (run: RunState | null): void => {
  try {
    if (run === null) localStorage.removeItem(LS_KEY);
    else localStorage.setItem(LS_KEY, JSON.stringify(run));
  } catch {
    /* storage full / unavailable — keep working in-memory */
  }
};

let run: RunState | null = loadRun();
const listeners = new Set<() => void>();

const commit = (next: RunState | null): void => {
  if (next === run) return; // reducer rejected the transition — nothing changed
  run = next;
  saveRun(run);
  for (const l of listeners) l();
};

export const subscribe = (listener: () => void): (() => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

export const getRun = (): RunState | null => run;

// --- Actions (thin wrappers over the pure reducer) ------------------------------

export const startRun = (leaderId: string, seed: number, registry?: Registry): void => commit(reducer.startRun(leaderId, seed, registry));
export const clearRun = (): void => commit(null);
export const pickNode = (id: string): void => { if (run) commit(reducer.pickNode(run, id)); };
export const resolveCombat = (registry: Registry, won: boolean, playerHp?: number): void => { if (run) commit(reducer.resolveCombat(run, registry, won, playerHp)); };
export const pickRelic = (relicId: string): void => { if (run) commit(reducer.pickRelic(run, relicId)); };
export const pickRewardCard = (cardId: string): void => { if (run) commit(reducer.pickRewardCard(run, cardId)); };
export const skipRewardCard = (): void => { if (run) commit(reducer.skipRewardCard(run)); };
export const leaveNode = (): void => { if (run) commit(reducer.leaveNode(run)); };
export const buyCard = (registry: Registry, offerIdx: number): void => { if (run) commit(reducer.buyCard(run, registry, offerIdx)); };
export const sellCard = (registry: Registry, uid: string): void => { if (run) commit(reducer.sellCard(run, registry, uid)); };
export const applyEnhancement = (registry: Registry, uid: string): void => { if (run) commit(reducer.applyEnhancement(run, registry, uid)); };
export const enhanceAttune = (element: import('@cards/schema').Element): void => { if (run) commit(reducer.enhanceAttune(run, element)); };
export const restHeal = (): void => { if (run) commit(reducer.restHeal(run)); };
export const restTakeCard = (registry: Registry, cardId: string): void => { if (run) commit(reducer.restTakeCard(run, registry, cardId)); };
export const restKindle = (uid1: string, uid2: string): void => { if (run) commit(reducer.restKindle(run, uid1, uid2)); };
export const claimUnlock = (): void => { if (run) commit(reducer.claimUnlock(run)); };
export const chooseEventOption = (registry: Registry, idx: number): void => { if (run) commit(reducer.chooseEventOption(run, registry, idx)); };
export const startCopperMech = (): void => { if (run) commit(reducer.startCopperMech(run)); };
export const resolveCopperMech = (damage: number, killed: boolean): void => { if (run) commit(reducer.resolveCopperMech(run, damage, killed)); };
export const leaveCopperMech = (): void => { if (run) commit(reducer.leaveCopperMech(run)); };
