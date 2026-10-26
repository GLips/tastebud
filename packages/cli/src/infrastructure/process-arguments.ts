/** The command line, read from `process.argv` here and nowhere else. */
export const readProcessArguments = (): ReadonlyArray<string> => process.argv.slice(2);

export const processCurrentDirectory = (): string => process.cwd();
