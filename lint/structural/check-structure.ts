// The structural tier's entry point. `run-structural-checks.ts` runs nothing on
// import, so executing it directly prints nothing and exits 0. Run this through
// `lint/with-real-node.sh`, never a bare `node`.

import { architectureConfig } from "./arch.config.ts";
import { structuralChecks } from "./registry.ts";
import { reportStructuralChecks } from "./run-structural-checks.ts";

process.exitCode = reportStructuralChecks(structuralChecks, architectureConfig);
