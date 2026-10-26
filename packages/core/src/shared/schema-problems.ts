import { type Schema, SchemaIssue } from "effect";

const formatIssues = SchemaIssue.makeFormatterStandardSchemaV1();

/** `derivedKinds.idea.sources: …`, so a problem names its field. */
export const formatSchemaProblems = (error: Schema.SchemaError): Array<string> =>
  formatIssues(error.issue).issues.map(({ path, message }) =>
    path === undefined || path.length === 0 ? message : `${path.map(String).join(".")}: ${message}`,
  );
