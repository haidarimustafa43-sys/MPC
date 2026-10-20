/**
 * A game action that is not possible in the current situation. The reason is
 * an i18n key so the UI can show a translated, student-friendly message.
 */
export class GameActionError extends Error {
  constructor(
    readonly reasonKey: string,
    readonly params: Record<string, string | number> = {},
  ) {
    super(`${reasonKey} ${JSON.stringify(params)}`);
    this.name = "GameActionError";
  }
}
