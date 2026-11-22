import type { WrittenDate } from "../../domain/date-ahead";

export interface IWrittenDates {
  in(text: string): WrittenDate[];
}
