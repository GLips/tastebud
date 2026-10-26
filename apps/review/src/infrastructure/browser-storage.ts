/**
 * The browser's own storage, the review UI's only memory outside the store. Every read tolerates server
 * rendering, where neither storage exists.
 */
import { useLocalStorage } from "@mantine/hooks";

/** One value remembered across visits, as a React state pair. */
export const useRememberedBrowserValue = <T>(key: string, defaultValue: T) => useLocalStorage<T>({ key, defaultValue });

export const readRememberedBrowserText = (key: string): string | undefined =>
  typeof localStorage === "undefined" ? undefined : (localStorage.getItem(key) ?? undefined);

export const rememberBrowserText = (key: string, value: string): void => localStorage.setItem(key, value);

/** Text kept for this tab only: it survives a reload and moving between screens, not a new tab. */
export const readTabSessionText = (key: string): string | undefined =>
  typeof sessionStorage === "undefined" ? undefined : (sessionStorage.getItem(key) ?? undefined);

export const writeTabSessionText = (key: string, value: string): void => sessionStorage.setItem(key, value);
