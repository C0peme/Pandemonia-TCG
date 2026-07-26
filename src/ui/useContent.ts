import { createContext, useContext, useSyncExternalStore } from 'react';
import { getSnapshot, subscribe, type ContentSnapshot } from '@cards/store';
import type { Registry } from '@cards/registry';

/**
 * Live view of the content store (effective registry + decks + selection).
 * Re-renders the component whenever cards or decks are created/edited/deleted.
 */
export const useContent = (): ContentSnapshot => useSyncExternalStore(subscribe, getSnapshot, getSnapshot);

/**
 * Optional registry override. In multiplayer, the board must resolve card ids against the
 * HOST's shared registry (which a joining player does not have in their local store). Wrapping
 * the net board in `<RegistryProvider value={hostRegistry}>` makes every `useRegistry()` consumer
 * resolve against it, with no prop drilling.
 */
const RegistryContext = createContext<Registry | null>(null);
export const RegistryProvider = RegistryContext.Provider;

/** Effective registry — the override from context if present, else the live local store. */
export const useRegistry = (): Registry => {
  const override = useContext(RegistryContext);
  const live = useContent();
  return override ?? live.registry;
};
