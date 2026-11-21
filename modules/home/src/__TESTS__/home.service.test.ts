import { beforeEach, describe, expect, it } from "bun:test";
import { Option, Result } from "@packages/ddd-kit";
import { EventTypes } from "@packages/events";
import type { IOutboxRepository } from "@packages/outbox/outbox.port";
import { enqueuedEvents } from "@packages/outbox/testing/enqueued-events";
import { mockPort, type PortMock } from "@packages/test/bun";
import { mockInstrumentation } from "@packages/test/bun/instrumentation";
import { mockUnitOfWork } from "@packages/test/bun/unit-of-work";
import { z } from "zod";
import type { HomeBlockDto } from "../application/dto/home.dto";
import type { HomeError } from "../application/errors/home-errors";
import type { IHomeRepository, StoredHomeLayout } from "../application/ports/home-repository.port";
import { HomeService } from "../application/services/home.service";
import { type HomeBlock, HomeLayout } from "../domain/value-objects/home-layout.vo";
import { HomeNote } from "../domain/value-objects/home-note.vo";

const PARENT = "parent-1";
const NOW = new Date("2026-11-19T10:00:00.000Z");
const LAST_WEEK = new Date("2026-11-12T10:00:00.000Z");

const AGENDA: HomeBlock = { id: "agenda", w: 4, h: 2 };
const CHILD: HomeBlock = { id: "child:0193a1b2-c3d4", w: 2, h: 1 };

const AGENDA_REPLY: HomeBlockDto = { ...AGENDA, size: "xl" };
const CHILD_REPLY: HomeBlockDto = { ...CHILD, size: "m" };

const layoutOf = (blocks: HomeBlock[]) => HomeLayout.of(blocks).getValue();
const noteOf = (body: string) => HomeNote.create(body).getValue();

const storedLayout = (
  blocks: HomeBlock[] | null,
  revision: number,
): Result<StoredHomeLayout, HomeError> =>
  Result.ok({ layout: Option.fromNullable(blocks).map(layoutOf), revision });

let repository: PortMock<IHomeRepository>;
let outbox: PortMock<IOutboxRepository>;
let service: HomeService;

beforeEach(() => {
  repository = mockPort<IHomeRepository>();
  outbox = mockPort<IOutboxRepository>();

  repository.layoutOf.mockResolvedValue(storedLayout(null, 0));
  repository.writeLayout.mockResolvedValue(Result.ok(Option.some(1)));
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
  it("given a parent who never arranged their home, then the advised layout at revision 0 is returned", async () => {
    const result = await service.layout(PARENT);

    expect(result.getValue()).toEqual({ v: 3, blocks: null, revision: 0 });
  });

  it("given a parent arranging their home, then the layout is stored and announced with its revision", async () => {
    repository.layoutOf.mockResolvedValue(storedLayout([AGENDA], 3));
    repository.writeLayout.mockResolvedValue(Result.ok(Option.some(4)));

    const result = await service.setLayout(PARENT, {
      v: 3,
      blocks: [AGENDA, CHILD],
      baseRevision: 3,
    });

    expect(result.getValue()).toEqual({ v: 3, blocks: [AGENDA_REPLY, CHILD_REPLY], revision: 4 });
    expect(repository.writeLayout).toHaveBeenCalledWith(
      PARENT,
      Option.some(layoutOf([AGENDA, CHILD])),
      3,
      NOW,
    );
    expect(enqueuedEvents(outbox)).toEqual([
      {
        eventType: EventTypes.HOME_LAYOUT_CHANGED,
        aggregateId: PARENT,
        payload: { userId: PARENT, reset: false, revision: 4 },
      },
    ]);
  });

  it("given a layout changed elsewhere since the parent's base, then the save is refused as stale and nothing is announced", async () => {
    repository.layoutOf.mockResolvedValue(storedLayout([AGENDA], 5));
    repository.writeLayout.mockResolvedValue(Result.ok(Option.none()));

    const result = await service.setLayout(PARENT, { v: 3, blocks: [CHILD], baseRevision: 4 });

    expect(result.getError().code).toBe("HOME_LAYOUT_STALE");
    expect(enqueuedEvents(outbox)).toEqual([]);
  });

  it("given a parent resetting their home, then the advised layout comes back under a new revision, announced as a reset", async () => {
    repository.layoutOf.mockResolvedValue(storedLayout([AGENDA], 2));
    repository.writeLayout.mockResolvedValue(Result.ok(Option.some(3)));

    const result = await service.setLayout(PARENT, { v: 3, blocks: null, baseRevision: 2 });

    expect(result.getValue()).toEqual({ v: 3, blocks: null, revision: 3 });
    expect(repository.writeLayout).toHaveBeenCalledWith(PARENT, Option.none(), 2, NOW);
    expect(enqueuedEvents(outbox)).toEqual([
      {
        eventType: EventTypes.HOME_LAYOUT_CHANGED,
        aggregateId: PARENT,
        payload: { userId: PARENT, reset: true, revision: 3 },
      },
    ]);
  });

  it("given the layout already in force, then nothing is written nor announced and the current revision is returned", async () => {
    repository.layoutOf.mockResolvedValue(storedLayout([AGENDA, CHILD], 7));

    const result = await service.setLayout(PARENT, {
      v: 3,
      blocks: [AGENDA, CHILD],
      baseRevision: 7,
    });

    expect(result.getValue()).toEqual({ v: 3, blocks: [AGENDA_REPLY, CHILD_REPLY], revision: 7 });
    expect(repository.writeLayout).not.toHaveBeenCalled();
    expect(enqueuedEvents(outbox)).toEqual([]);
  });

  it("given the same block twice, then the layout is refused", async () => {
    const result = await service.setLayout(PARENT, {
      v: 3,
      blocks: [AGENDA, { ...AGENDA, w: 2 }],
      baseRevision: 0,
    });

    expect(result.getError().code).toBe("HOME_LAYOUT_INVALID");
    expect(repository.writeLayout).not.toHaveBeenCalled();
  });

  it("given more than 40 blocks, then the layout is refused", async () => {
    const blocks = Array.from({ length: 41 }, (_, index) => ({ ...AGENDA, id: `block-${index}` }));

    const result = await service.setLayout(PARENT, { v: 3, blocks, baseRevision: 0 });

    expect(result.getError().code).toBe("HOME_LAYOUT_INVALID");
  });

  it("given a block id outside the naming rule or longer than 80 characters, then the layout is refused", async () => {
    const malformed = await service.setLayout(PARENT, {
      v: 3,
      blocks: [{ ...AGENDA, id: "Agenda" }],
      baseRevision: 0,
    });
    const tooLong = await service.setLayout(PARENT, {
      v: 3,
      blocks: [{ ...AGENDA, id: `child:${"a".repeat(80)}` }],
      baseRevision: 0,
    });

    expect(malformed.getError().code).toBe("HOME_LAYOUT_INVALID");
    expect(tooLong.getError().code).toBe("HOME_LAYOUT_INVALID");
  });
});

describe("layout sent by a client still on fixed sizes", () => {
  it("given a layout in S, M, L and XL, then it is stored and answered in cases, 1x1, 2x1, 2x2 and 4x2", async () => {
    const result = await service.setLayout(PARENT, {
      blocks: [
        { id: "today", size: "s" },
        { id: "notes", size: "m" },
        { id: "review", size: "l" },
        { id: "calendar", size: "xl" },
      ],
      baseRevision: 0,
    });

    const inCases: HomeBlock[] = [
      { id: "today", w: 1, h: 1 },
      { id: "notes", w: 2, h: 1 },
      { id: "review", w: 2, h: 2 },
      { id: "calendar", w: 4, h: 2 },
    ];
    expect(result.getValue()).toEqual({
      v: 3,
      blocks: [
        { id: "today", w: 1, h: 1, size: "s" },
        { id: "notes", w: 2, h: 1, size: "m" },
        { id: "review", w: 2, h: 2, size: "l" },
        { id: "calendar", w: 4, h: 2, size: "xl" },
      ],
      revision: 1,
    });
    expect(repository.writeLayout).toHaveBeenCalledWith(
      PARENT,
      Option.some(layoutOf(inCases)),
      0,
      NOW,
    );
  });

  it("given the layout already in force sent in fixed sizes, then nothing is written nor announced", async () => {
    repository.layoutOf.mockResolvedValue(storedLayout([AGENDA, CHILD], 7));

    const result = await service.setLayout(PARENT, {
      blocks: [
        { id: "agenda", size: "xl" },
        { id: "child:0193a1b2-c3d4", size: "m" },
      ],
      baseRevision: 7,
    });

    expect(result.getValue()).toEqual({ v: 3, blocks: [AGENDA_REPLY, CHILD_REPLY], revision: 7 });
    expect(repository.writeLayout).not.toHaveBeenCalled();
    expect(enqueuedEvents(outbox)).toEqual([]);
  });

  it("given a reset sent without a version, then the advised layout comes back announced as a reset", async () => {
    repository.layoutOf.mockResolvedValue(storedLayout([AGENDA], 2));
    repository.writeLayout.mockResolvedValue(Result.ok(Option.some(3)));

    const result = await service.setLayout(PARENT, { blocks: null, baseRevision: 2 });

    expect(result.getValue()).toEqual({ v: 3, blocks: null, revision: 3 });
    expect(enqueuedEvents(outbox)).toEqual([
      {
        eventType: EventTypes.HOME_LAYOUT_CHANGED,
        aggregateId: PARENT,
        payload: { userId: PARENT, reset: true, revision: 3 },
      },
    ]);
  });
});

describe("reply read by a client loaded before the sizes in cases, with the block schema of develop 8c51fb3a", () => {
  const clientBlockSchema = z.object({
    id: z.string(),
    size: z.enum(["s", "m", "l", "xl"]),
  });

  const clientReplySchema = z.object({
    blocks: z.array(clientBlockSchema).nullable(),
    revision: z.number(),
  });

  const STORED: HomeBlock[] = [
    { id: "today", w: 1, h: 1 },
    { id: "notes", w: 2, h: 1 },
    { id: "review", w: 2, h: 2 },
    { id: "calendar", w: 4, h: 2 },
    { id: "progress", w: 1, h: 3 },
  ];

  it("given a stored layout, then the old client reads each block at the fixed size it had", async () => {
    repository.layoutOf.mockResolvedValue(storedLayout(STORED, 5));

    const reply = clientReplySchema.parse((await service.layout(PARENT)).getValue());

    expect(reply.blocks?.map(({ size }) => size)).toEqual(["s", "m", "l", "xl", "l"]);
  });

  it("given the old client saving the layout it read, then nothing is written nor announced", async () => {
    repository.layoutOf.mockResolvedValue(storedLayout(STORED.slice(0, 4), 5));
    const reply = clientReplySchema.parse((await service.layout(PARENT)).getValue());

    const saved = await service.setLayout(PARENT, { blocks: reply.blocks, baseRevision: 5 });

    expect(saved.getValue().revision).toBe(5);
    expect(repository.writeLayout).not.toHaveBeenCalled();
    expect(enqueuedEvents(outbox)).toEqual([]);
  });
});

describe("size of a block in cases", () => {
  it.each([
    ["wider than 4 columns", { w: 5, h: 1 }],
    ["taller than 8 rows", { w: 1, h: 9 }],
    ["without width", { w: 0, h: 1 }],
    ["without height", { w: 1, h: 0 }],
    ["in part of a case", { w: 1.5, h: 1 }],
  ])("given a block %s, then the layout is refused", async (_, size) => {
    const result = await service.setLayout(PARENT, {
      v: 3,
      blocks: [{ id: "agenda", ...size }],
      baseRevision: 0,
    });

    expect(result.getError().code).toBe("HOME_LAYOUT_INVALID");
    expect(repository.writeLayout).not.toHaveBeenCalled();
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
