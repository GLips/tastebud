// taste/no-long-comments: a run of comments (separated only by whitespace) may not pass maxWords
// words or maxLines lines, doubled for the run that opens a file. Past that, nobody re-reads a
// comment on the edit that invalidates it. Enabled only OUTSIDE the declared trees (test/,
// scripts/, lint/); inside them `arch/no-long-comments` reports, and both would double-report.

import { type Comment, defineRule, type ESTree } from "@oxlint/plugins";

import { numericRuleOption } from "../lib/rule-options.ts";

const DEFAULT_MAX_WORDS = 60;
const DEFAULT_MAX_LINES = 15;
const DEFAULT_HEADER_MULTIPLE = 2;

// Box drawing, bullets and JSDoc gutters hold no letter or digit, so they never count as words.
const HOLDS_A_WORD = /[\p{L}\p{N}]/u;
// `}{` between two JSX comments is not code, so it must not split the run.
const JSX_BETWEEN_COMMENTS = /^\s*\}\s*\{\s*$/u;

const wordCount = (comment: Comment): number =>
  comment.value.split(/\s+/u).filter((token) => HOLDS_A_WORD.test(token)).length;

const lineCount = (comment: Comment): number => comment.loc.end.line - comment.loc.start.line + 1;

const commentRuns = (comments: ReadonlyArray<Comment>, text: string): Array<Array<Comment>> => {
  const runs: Array<Array<Comment>> = [];
  let open: Array<Comment> | null = null;
  let previousEnd = 0;
  for (const comment of comments) {
    if (comment.type === "Shebang") continue;
    const between = text.slice(previousEnd, comment.start);
    if (open !== null && (between.trim() === "" || JSX_BETWEEN_COMMENTS.test(between))) {
      open.push(comment);
    } else {
      open = [comment];
      runs.push(open);
    }
    previousEnd = comment.end;
  }
  return runs;
};

const introducesTheFile = (run: ReadonlyArray<Comment>, program: ESTree.Program): boolean => {
  const first = program.body[0];
  return first === undefined || (run[0]?.start ?? 0) < first.start;
};

export const noLongCommentsRule = defineRule({
  meta: {
    type: "problem",
    schema: [
      {
        type: "object",
        properties: {
          maxWords: { type: "integer", minimum: 1 },
          maxLines: { type: "integer", minimum: 1 },
          headerMultiple: { type: "integer", minimum: 1 },
        },
        additionalProperties: false,
      },
    ],
    messages: {
      tooManyWords:
        "This comment runs to {{words}} words (limit {{maxWords}}). Keep what the code can't say (why, warnings, what it deliberately leaves out) and cut narration of what the lines below show. If it really needs this much, it's documentation: move it to docs and leave a one-line pointer.",
      tooManyLines:
        "This comment spans {{lines}} lines for {{words}} words (limit {{maxLines}} lines). Keep the line or two that name the thing and drop the frame around it.",
    },
  },
  create(context) {
    const option = context.options[0];
    const maxWords = numericRuleOption(option, "maxWords", DEFAULT_MAX_WORDS);
    const maxLines = numericRuleOption(option, "maxLines", DEFAULT_MAX_LINES);
    const headerMultiple = numericRuleOption(option, "headerMultiple", DEFAULT_HEADER_MULTIPLE);
    return {
      Program(program) {
        const { sourceCode } = context;
        for (const run of commentRuns(sourceCode.getAllComments(), sourceCode.text)) {
          const first = run[0];
          const last = run[run.length - 1];
          if (first === undefined || last === undefined) continue;
          const allowance = introducesTheFile(run, program) ? headerMultiple : 1;
          const loc = { start: first.loc.start, end: last.loc.end };
          const words = run.reduce((total, comment) => total + wordCount(comment), 0);
          // One report per run, words first: a run over both is long because of its prose.
          if (words > maxWords * allowance) {
            context.report({ loc, messageId: "tooManyWords", data: { words, maxWords: maxWords * allowance } });
            continue;
          }
          const lines = run.reduce((total, comment) => total + lineCount(comment), 0);
          if (lines > maxLines * allowance) {
            context.report({ loc, messageId: "tooManyLines", data: { lines, words, maxLines: maxLines * allowance } });
          }
        }
      },
    };
  },
});
