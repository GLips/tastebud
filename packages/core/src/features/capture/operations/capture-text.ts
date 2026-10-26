/** The text `capture` prints. */
import { quoted } from "#core/domains/record-text/index.ts";
import type { SourceView } from "#core/domains/record-views/index.ts";

export const renderCaptureText = (result: { readonly source: SourceView; readonly path: string }) =>
  [
    `Captured ${result.source.kindLabel} ${result.source.source.id}`,
    `  ${quoted(result.source.source.quote)}`,
    ...(result.source.source.captured_in === undefined
      ? []
      : [`  captured in: ${result.source.source.captured_in.join(", ")}`]),
  ].join("\n");
