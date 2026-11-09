/**
 * Half-written thread notes, one per derivation, for the life of the tab. The inbox pane reuses one
 * thread as the reviewer moves between rows, so a note typed on one row must still be there when
 * they come back to it.
 */
import { useSyncExternalStore } from "react";

const draftsByDerivationId = new Map<string, string>();
const listeners = new Set<() => void>();

const subscribeToThreadNoteDrafts = (listener: () => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

/** Sets the draft for one derivation; an empty one is forgotten. */
export const setThreadNoteDraft = (derivationId: string, text: string) => {
  if (text === "") draftsByDerivationId.delete(derivationId);
  else draftsByDerivationId.set(derivationId, text);
  for (const listener of listeners) listener();
};

export function useThreadNoteDraft(derivationId: string): string {
  const read = () => draftsByDerivationId.get(derivationId) ?? "";
  return useSyncExternalStore(subscribeToThreadNoteDrafts, read, read);
}
