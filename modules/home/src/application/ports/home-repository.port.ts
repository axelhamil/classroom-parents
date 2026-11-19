import type { Option, Result } from "@packages/ddd-kit";
import type { HomeLayout } from "../../domain/value-objects/home-layout.vo";
import type { HomeNote } from "../../domain/value-objects/home-note.vo";
import type { HomeError } from "../errors/home-errors";

export interface StoredHomeNote {
  note: HomeNote;
  updatedAt: Date;
}

export interface IHomeRepository {
  layoutOf(userId: string): Promise<Result<Option<HomeLayout>, HomeError>>;

  saveLayout(userId: string, layout: HomeLayout, at: Date): Promise<Result<void, HomeError>>;

  clearLayout(userId: string): Promise<Result<void, HomeError>>;

  noteOf(userId: string): Promise<Result<Option<StoredHomeNote>, HomeError>>;

  saveNote(userId: string, note: HomeNote, at: Date): Promise<Result<void, HomeError>>;

  clearNote(userId: string): Promise<Result<void, HomeError>>;
}
