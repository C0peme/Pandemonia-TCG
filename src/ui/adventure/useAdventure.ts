import { useSyncExternalStore } from 'react';
import { getRun, subscribe } from '@adventure/store';
import type { RunState } from '@adventure/schema';

/** Live view of the current Adventure run (null = no run in progress). */
export const useAdventure = (): RunState | null => useSyncExternalStore(subscribe, getRun, getRun);
