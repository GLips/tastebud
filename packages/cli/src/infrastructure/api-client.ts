/** The CLI's one reader of `fetch`: it only ever talks to Tastebud's own servers on 127.0.0.1. */
import { Effect } from "effect";

/** GETs a JSON body from a loopback port. A refused connection, a non-JSON body or the timeout all fail. */
export const fetchLoopbackJson = (port: number, path: string, timeout: `${number} second${"" | "s"}`) =>
  Effect.tryPromise((signal) =>
    fetch(`http://127.0.0.1:${port}${path}`, { signal }).then((response) => response.json()),
  ).pipe(Effect.timeout(timeout));
