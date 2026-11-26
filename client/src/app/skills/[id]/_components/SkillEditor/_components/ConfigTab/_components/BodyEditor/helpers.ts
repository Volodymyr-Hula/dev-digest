/** Rough token estimate (≈4 chars/token). A skill is shared by agents on
 *  different models, so an exact count does not exist; this is a budget hint. */
export function approxTokens(text: string): number {
  return Math.ceil(text.length / 4);
}
