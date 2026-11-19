import { beforeEach, describe, expect, it } from "bun:test";
import { Option, Result } from "@packages/ddd-kit";
import { EventTypes } from "@packages/events";
import type { IOutboxRepository } from "@packages/outbox/outbox.port";
import { enqueuedEvents } from "@packages/outbox/testing/enqueued-events";
import { mockPort, type PortMock } from "@packages/test/bun";
import { mockInstrumentation } from "@packages/test/bun/instrumentation";
import { mockUnitOfWork } from "@packages/test/bun/unit-of-work";
import type { IHomeRepository } from "../application/ports/home-repository.port";
import { HomeService } from "../application/services/home.service";
import { type HomeBlock, HomeLayout } from "../domain/value-objects/home-layout.vo";
import { HomeNote } from "../domain/value-objects/home-note.vo";

const PARENT = "parent-1";
const NOW = new Date("2026-11-19T10:00:00.000Z");
const LAST_WEEK = new Date("2026-11-12T10:00:00.000Z");

const AGENDA: HomeBlock = { id: "agenda", w: 8, h: 2, hidden: false };
const CHILD: HomeBlock = { id: "child:0193a1b2-c3d4", w: 4, h: 1, hidden: true };

const layoutOf = (blocks: HomeBlock[]) => HomeLayout.create(blocks).getValue();
const noteOf = (body: string) => HomeNote.create(body).getValue();

let repository: PortMock<IHomeRepository>;
let outbox: PortMock<IOutboxRepository>;
let service: HomeService;

beforeEach(() => {
  repository = mockPort<IHomeRepository>();
  outbox = mockPort<IOutboxRepository>();

  repository.layoutOf.mockResolvedValue(Result.ok(Option.none()));
  repository.saveLayout.mockResolvedValue(Result.ok());
  repository.clearLayout.mockResolvedValue(Result.ok());
  repository.noteOf.mockResolvedValue(Result.ok(Option.none()));
  repository.saveNote.mockResolvedValue(Result.ok());
  repository.clearNote.mockResolvedValue(Result.ok());

  service = new HomeService(
    repository,
    mockUnitOfWork().unitOfWork,
    outbox,
    mockInstrumentation(),
    () => NOW,
  );
});

describe("layout of the parent's home", () => {
  it("given a parent who never arranged their home, then no layout is returned", async () => {
    const result = await service.layout(PARENT);

    expect(result.getValue()).toEqual({ blocks: null });
  });

  it("given a parent arranging their home, then the layout is stored and announced", async () => {
    const result = await service.setLayout(PARENT, [AGENDA, CHILD]);

    expect(result.getValue()).toEqual({ blocks: [AGENDA, CHILD] });
    expect(repository.saveLayout).toHaveBeenCalledWith(PARENT, layoutOf([AGENDA, CHILD]), NOW);
    expect(enqueuedEvents(outbox)).toEqual([
      {
        eventType: EventTypes.HOME_LAYOUT_CHANGED,
        aggregateId: PARENT,
        payload: { userId: PARENT, reset: false },
      },
    ]);
  });

  it("given a parent resetting their home, then the layout is removed and announced as a reset", async () => {
    repository.layoutOf.mockResolvedValue(Result.ok(Option.some(layoutOf([AGENDA]))));

    const result = await service.setLayout(PARENT, null);

    expect(result.getValue()).toEqual({ blocks: null });
    expect(repository.clearLayout).toHaveBeenCalledWith(PARENT);
    expect(enqueuedEvents(outbox)).toEqual([
      {
        eventType: EventTypes.HOME_LAYOUT_CHANGED,
        aggregateId: PARENT,
        payload: { userId: PARENT, reset: true },
      },
    ]);
  });

  it("given the layout already in force, then nothing is written nor announced", async () => {
    repository.layoutOf.mockResolvedValue(Result.ok(Option.some(layoutOf([AGENDA, CHILD]))));

    const result = await service.setLayout(PARENT, [AGENDA, CHILD]);

    expect(result.getValue()).toEqual({ blocks: [AGENDA, CHILD] });
    expect(repository.saveLayout).not.toHaveBeenCalled();
    expect(enqueuedEvents(outbox)).toEqual([]);
  });

  it("given the same block twice, then the layout is refused", async () => {
    const result = await service.setLayout(PARENT, [AGENDA, { ...AGENDA, w: 12 }]);

    expect(result.getError().code).toBe("HOME_LAYOUT_INVALID");
    expect(repository.saveLayout).not.toHaveBeenCalled();
  });

  it("given more than 40 blocks, then the layout is refused", async () => {
    const blocks = Array.from({ length: 41 }, (_, index) => ({ ...AGENDA, id: `block-${index}` }));

    const result = await service.setLayout(PARENT, blocks);

    expect(result.getError().code).toBe("HOME_LAYOUT_INVALID");
  });

  it("given a block id outside the naming rule or longer than 80 characters, then the layout is refused", async () => {
    const malformed = await service.setLayout(PARENT, [{ ...AGENDA, id: "Agenda" }]);
    const tooLong = await service.setLayout(PARENT, [{ ...AGENDA, id: `child:${"a".repeat(80)}` }]);

    expect(malformed.getError().code).toBe("HOME_LAYOUT_INVALID");
    expect(tooLong.getError().code).toBe("HOME_LAYOUT_INVALID");
  });
});

describe("note pinned on the parent's home", () => {
  it("given a parent who never wrote a note, then the note is empty", async () => {
    const result = await service.note(PARENT);

    expect(result.getValue()).toEqual({ body: "", updatedAt: null });
  });

  it("given a parent writing a note, then it is stored trimmed and announced without its content", async () => {
    const result = await service.setNote(PARENT, "  Piscine le jeudi  ");

    expect(result.getValue()).toEqual({ body: "Piscine le jeudi", updatedAt: NOW.toISOString() });
    expect(repository.saveNote).toHaveBeenCalledWith(PARENT, noteOf("Piscine le jeudi"), NOW);
    expect(enqueuedEvents(outbox)).toEqual([
      {
        eventType: EventTypes.HOME_NOTE_CHANGED,
        aggregateId: PARENT,
        payload: { userId: PARENT, cleared: false },
      },
    ]);
  });

  it("given a parent emptying their note, then it is removed and announced as cleared", async () => {
    repository.noteOf.mockResolvedValue(
      Result.ok(Option.some({ note: noteOf("Piscine"), updatedAt: LAST_WEEK })),
    );

    const result = await service.setNote(PARENT, "   ");

    expect(result.getValue()).toEqual({ body: "", updatedAt: null });
    expect(repository.clearNote).toHaveBeenCalledWith(PARENT);
    expect(enqueuedEvents(outbox)).toEqual([
      {
        eventType: EventTypes.HOME_NOTE_CHANGED,
        aggregateId: PARENT,
        payload: { userId: PARENT, cleared: true },
      },
    ]);
  });

  it("given the note already in force, then nothing is written nor announced", async () => {
    repository.noteOf.mockResolvedValue(
      Result.ok(Option.some({ note: noteOf("Piscine"), updatedAt: LAST_WEEK })),
    );

    const result = await service.setNote(PARENT, "Piscine ");

    expect(result.getValue()).toEqual({ body: "Piscine", updatedAt: LAST_WEEK.toISOString() });
    expect(repository.saveNote).not.toHaveBeenCalled();
    expect(enqueuedEvents(outbox)).toEqual([]);
  });

  it("given a note longer than 4000 characters, then it is refused", async () => {
    const result = await service.setNote(PARENT, "a".repeat(4001));

    expect(result.getError().code).toBe("HOME_NOTE_INVALID");
    expect(repository.saveNote).not.toHaveBeenCalled();
  });
});
