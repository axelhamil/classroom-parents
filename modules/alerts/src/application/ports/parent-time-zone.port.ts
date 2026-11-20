export interface IParentTimeZone {
  of(userId: string): Promise<string>;
}
