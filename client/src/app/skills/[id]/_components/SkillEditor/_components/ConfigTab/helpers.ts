/** Rough token estimate (≈4 chars/token). A skill is shared by agents on
 *  different models, so an exact count does not exist; this is a budget hint. */
export function approxTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

export function sameList(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((x, i) => x === b[i]);
}
