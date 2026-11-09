/**
 * The kind's accept label in running text. A one-word label is a verb ("Believe" → "believe it");
 * a phrase like "Worth building" isn't, so sentences quote it instead of conjugating it.
 */
const isVerbLabel = (acceptLabel: string): boolean => !acceptLabel.includes(" ");

/** "believe it", or "mark it “Worth building”". */
export const acceptItPhrase = (acceptLabel: string): string =>
  isVerbLabel(acceptLabel) ? `${acceptLabel.toLowerCase()} it` : `mark it “${acceptLabel}”`;
