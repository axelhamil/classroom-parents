export interface ParentPreferences {
  country: string | null;
  language: string | null;
}

/** What the parent said elsewhere about where they live and read: a hint, so a failed read is no preference. */
export interface IParentPreferences {
  of(userId: string): Promise<ParentPreferences>;
}
