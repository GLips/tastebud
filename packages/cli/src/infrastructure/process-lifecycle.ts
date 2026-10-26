/** Ending the process and reading how long it has run, for the prompt hook's deadline. */
export const exitProcess = (code: number): never => process.exit(code);

/** Bun's `performance.now()` counts from process start, so module loading is charged too. */
export const millisSinceProcessStart = (): number => performance.now();
