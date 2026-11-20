import { type IInstrumentation, type IUnitOfWork, Option, Result } from "@packages/ddd-kit";
import { EventTypes } from "@packages/events";
import { emitEvent } from "@packages/outbox/event-emitter";
import type { IOutboxRepository } from "@packages/outbox/outbox.port";
import { type HomeBlock, HomeLayout } from "../../domain/value-objects/home-layout.vo";
import { HomeNote } from "../../domain/value-objects/home-note.vo";
import type { HomeLayoutBody, HomeLayoutDto, HomeNoteDto } from "../dto/home.dto";
import { type HomeError, layoutInvalid, layoutStale, noteInvalid } from "../errors/home-errors";
import type {
  IHomeRepository,
  StoredHomeLayout,
  StoredHomeNote,
} from "../ports/home-repository.port";

type Outcome<T> = Promise<Result<T, HomeError>>;

type LayoutChoice = Option<HomeLayout>;

type NoteChoice = Option<HomeNote>;

function layoutDtoOf({ layout, revision }: StoredHomeLayout): HomeLayoutDto {
  return { blocks: layout.map(({ value }) => [...value.blocks]).toNull(), revision };
}

function noteDtoOf(stored: Option<StoredHomeNote>): HomeNoteDto {
  return {
    body: stored.map(({ note }) => note.value).unwrapOr(""),
    updatedAt: stored.map(({ updatedAt }) => updatedAt.toISOString()).toNull(),
  };
}

function sameValue<T extends { equals(other: T): boolean }>(
  current: Option<T>,
  next: Option<T>,
): boolean {
  return current.equals(next, (left, right) => left.equals(right));
}

export class HomeService {
  constructor(
    private readonly home: IHomeRepository,
    private readonly transactions: IUnitOfWork,
    private readonly outbox: IOutboxRepository,
    private readonly instrumentation: IInstrumentation,
    private readonly clock: () => Date = () => new Date(),
  ) {}

  async layout(userId: string): Outcome<HomeLayoutDto> {
    return this.span("layout", async () => (await this.home.layoutOf(userId)).map(layoutDtoOf));
  }

  async setLayout(
    userId: string,
    { blocks, baseRevision }: HomeLayoutBody,
  ): Outcome<HomeLayoutDto> {
    return this.span("setLayout", async () => {
      const choice = this.layoutChoiceOf(blocks);
      if (choice.isFailure) return Result.fail(choice.getError());

      const stored = await this.transactions.run(() =>
        this.storeLayout(userId, choice.getValue(), baseRevision),
      );

      return stored.map(layoutDtoOf);
    });
  }

  async note(userId: string): Outcome<HomeNoteDto> {
    return this.span("note", async () => (await this.home.noteOf(userId)).map(noteDtoOf));
  }

  async setNote(userId: string, body: string): Outcome<HomeNoteDto> {
    return this.span("setNote", async () => {
      const choice = this.noteChoiceOf(body);
      if (choice.isFailure) return Result.fail(choice.getError());

      const stored = await this.transactions.run(() => this.storeNote(userId, choice.getValue()));

      return stored.map(noteDtoOf);
    });
  }

  private layoutChoiceOf(blocks: HomeBlock[] | null): Result<LayoutChoice, HomeError> {
    if (blocks === null) return Result.ok(Option.none());

    return HomeLayout.of(blocks)
      .map((layout) => Option.some(layout))
      .mapError(layoutInvalid);
  }

  private noteChoiceOf(body: string): Result<NoteChoice, HomeError> {
    if (body.trim() === "") return Result.ok(Option.none());

    return HomeNote.create(body)
      .map((note) => Option.some(note))
      .mapError(noteInvalid);
  }

  private async storeLayout(
    userId: string,
    choice: LayoutChoice,
    baseRevision: number,
  ): Outcome<StoredHomeLayout> {
    const current = await this.home.layoutOf(userId);
    if (current.isFailure) return Result.fail(current.getError());
    if (sameValue(current.getValue().layout, choice)) return Result.ok(current.getValue());

    const written = await this.home.writeLayout(userId, choice, baseRevision, this.clock());
    if (written.isFailure) return Result.fail(written.getError());

    const revision = written.getValue();
    if (revision.isNone()) return Result.fail(layoutStale(baseRevision));

    return Result.ok(await this.announceLayout(userId, choice, revision.unwrap()));
  }

  private async announceLayout(
    userId: string,
    layout: LayoutChoice,
    revision: number,
  ): Promise<StoredHomeLayout> {
    await emitEvent(this.outbox, EventTypes.HOME_LAYOUT_CHANGED, "user", userId, {
      userId,
      reset: layout.isNone(),
      revision,
    });
    return { layout, revision };
  }

  private async storeNote(userId: string, choice: NoteChoice): Outcome<Option<StoredHomeNote>> {
    const current = await this.home.noteOf(userId);
    if (current.isFailure) return Result.fail(current.getError());

    const currentNote = current.getValue();
    if (
      sameValue(
        currentNote.map(({ note }) => note),
        choice,
      )
    )
      return Result.ok(currentNote);

    const at = this.clock();
    const written = choice.isSome()
      ? await this.home.saveNote(userId, choice.unwrap(), at)
      : await this.home.clearNote(userId);
    if (written.isFailure) return Result.fail(written.getError());

    await emitEvent(this.outbox, EventTypes.HOME_NOTE_CHANGED, "user", userId, {
      userId,
      cleared: choice.isNone(),
    });
    return Result.ok(choice.map((note) => ({ note, updatedAt: at })));
  }

  private span<T>(method: string, work: () => Promise<T>): Promise<T> {
    return this.instrumentation.startSpan(
      { name: `HomeService > ${method}`, op: "function" },
      work,
    );
  }
}
