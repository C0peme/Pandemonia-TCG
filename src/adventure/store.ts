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
/**
 * Named save slots, separate from the auto-persisted CURRENT run.
 *
 * The current run is written on every commit, so closing the tab never loses progress —
 * but starting a second run overwrote it. Slots let a run be banked and returned to.
 */
const LS_SLOTS_KEY = 'pandemonia.adventure.slots.v1';

export interface RunSlot {
  id: string;
  /** Epoch ms, for ordering and for showing when it was put down. */
  savedAt: number;
  run: RunState;
}

const loadSlots = (): RunSlot[] => {
  try {
    const raw = localStorage.getItem(LS_SLOTS_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    // Each slot is validated INDIVIDUALLY: one corrupt or outdated save must not take the
    // rest of the shelf with it.
    return parsed.flatMap((entry): RunSlot[] => {
      const e = entry as { id?: unknown; savedAt?: unknown; run?: unknown };
      const run = (() => { try { return parseRun(e.run); } catch { return null; } })();
      if (!run || typeof e.id !== 'string') return [];
      return [{ id: e.id, savedAt: typeof e.savedAt === 'number' ? e.savedAt : 0, run }];
    });
  } catch {
    return [];
  }
};

const writeSlots = (slots: RunSlot[]): void => {
  try {
    localStorage.setItem(LS_SLOTS_KEY, JSON.stringify(slots));
  } catch {
    /* storage full / unavailable — the in-memory list stays correct for this session */
  }
};

let slots: RunSlot[] = loadSlots();

/**
 * Saved runs, newest first — memoized so `useSyncExternalStore` gets a REFERENTIALLY
 * STABLE snapshot when nothing has changed.
 *
 * `getSlots` returning a fresh array every call broke that contract: React re-checks a
 * `useSyncExternalStore` snapshot on every render, and a snapshot that is never `===` to
 * its previous value looks like a perpetual store change, which manifested as an actual
 * infinite render loop ("Maximum update depth exceeded") the moment `SavedRuns` mounted.
 */
let sortedSlotsCache: RunSlot[] | null = null;
export const getSlots = (): RunSlot[] => {
  if (!sortedSlotsCache) sortedSlotsCache = [...slots].sort((a, b) => b.savedAt - a.savedAt);
  return sortedSlotsCache;
};

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

/**
 * Bank the current run to a slot. Saving the SAME run again overwrites its own slot
 * rather than piling up near-identical copies, so the button is a "checkpoint" the player
 * can hit repeatedly.
 *
 * Keyed on the run's seed + leader, which together identify a run for its whole life.
 */
export const saveRunToSlot = (): void => {
  if (!run) return;
  const id = `${run.leaderId}:${run.seed}`;
  slots = [...slots.filter((sl) => sl.id !== id), { id, savedAt: Date.now(), run: structuredClone(run) }];
  sortedSlotsCache = null;
  writeSlots(slots);
  for (const l of listeners) l();
};

/** Resume a saved run, replacing whatever is current. */
export const loadRunFromSlot = (id: string): void => {
  const slot = slots.find((sl) => sl.id === id);
  if (slot) commit(structuredClone(slot.run));
};

export const deleteSlot = (id: string): void => {
  slots = slots.filter((sl) => sl.id !== id);
  sortedSlotsCache = null;
  writeSlots(slots);
  for (const l of listeners) l();
};

/**
 * Export the current run as a downloadable `.json` file.
 *
 * A local slot only ever lives in ONE browser's storage — it cannot move to another
 * machine, survive a cleared profile, or be handed to someone else to inspect. A file can
 * do all three, which is also what makes it the actual answer to "how do I send you my
 * save": a slot has no way out of the browser it was written in.
 */
export const exportRunToFile = (): void => {
  if (!run) return;
  const blob = new Blob([JSON.stringify(run, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  // Named for what it is and when, so a folder of exports stays sortable/identifiable
  // without opening each one.
  a.download = `pandemonia-${run.leaderId}-act${run.act}-${new Date().toISOString().slice(0, 10)}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
};

/**
 * Import a run from file TEXT (already read by the caller — a real `<input type=file>`
 * read is async and belongs in the UI layer, not here) and make it the current run.
 *
 * Validated through the same `parseRun` every load goes through, so a hand-edited or
 * corrupted file is rejected rather than crashing the app — returns whether it worked.
 */
export const importRunFromText = (text: string): boolean => {
  try {
    const imported = parseRun(JSON.parse(text));
    commit(imported);
    return true;
  } catch {
    return false;
  }
};

// --- Actions (thin wrappers over the pure reducer) ------------------------------

/**
 * Bind a pure `run.ts` transition to the store: supply the current run, commit the result.
 *
 * Every action below is the same three moves — bail if there is no run, call the reducer,
 * commit — so they are generated from the reducer's own signature rather than hand-written
 * thirty times. That makes the no-run guard impossible to forget, and an argument-list change
 * in `run.ts` a type error here instead of a silently mismatched call.
 */
const bind =
  <A extends unknown[]>(fn: (run: RunState, ...args: A) => RunState) =>
  (...args: A): void => {
    if (run) commit(fn(run, ...args));
  };

export const startRun = (leaderId: string, seed: number, registry?: Registry, boonId?: string): void => commit(reducer.startRun(leaderId, seed, registry, boonId));
export const clearRun = (): void => commit(null);
<<<<<<< Updated upstream
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
=======

export const pickNode = bind(reducer.pickNode);
export const resolveCombat = bind(reducer.resolveCombat);
export const pickRelic = bind(reducer.pickRelic);
export const pickRewardCard = bind(reducer.pickRewardCard);
export const skipRewardCard = bind(reducer.skipRewardCard);
export const leaveNode = bind(reducer.leaveNode);
export const buyCard = bind(reducer.buyCard);
export const chooseTrialTwist = bind(reducer.chooseTrialTwist);
export const buyRelic = bind(reducer.buyRelic);
export const unbindRelic = bind(reducer.unbindRelic);
export const storeReroll = bind(reducer.storeReroll);
export const sellCard = bind(reducer.sellCard);
export const applyEnhancement = bind(reducer.applyEnhancement);
export const enhanceReroll = bind(reducer.enhanceReroll);
export const enhanceAttune = bind(reducer.enhanceAttune);
export const restHeal = bind(reducer.restHeal);
export const restKindle = bind(reducer.restKindle);
export const restMend = bind(reducer.restMend);
export const claimUnlock = bind(reducer.claimUnlock);
export const pickGainRelic = bind(reducer.pickGainRelic);
export const pickGainCard = bind(reducer.pickGainCard);
export const leaveGain = bind(reducer.leaveGain);
export const chooseEventOption = bind(reducer.chooseEventOption);
export const startCopperMech = bind(reducer.startCopperMech);
export const resolveCopperMech = bind(reducer.resolveCopperMech);
export const leaveCopperMech = bind(reducer.leaveCopperMech);
export const pickCopperRelic = bind(reducer.pickCopperRelic);

/** The one action whose caller-facing argument order differs from the reducer's, so it
 *  cannot be generated: the view passes (registry, uids), the reducer takes (uids, registry). */
export const resolveTrim = (registry: Registry, uids: string[]): void => { if (run) commit(reducer.resolveTrim(run, uids, registry)); };
>>>>>>> Stashed changes
