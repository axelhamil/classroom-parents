import { z } from "zod";
import { defineEventContribution } from "../contribution";

export const homeEvents = defineEventContribution({
  types: {
    HOME_LAYOUT_CHANGED: "home.layout.changed",
    HOME_NOTE_CHANGED: "home.note.changed",
  },
  payloads: {
    "home.layout.changed": z.object({ userId: z.string(), reset: z.boolean() }),
    "home.note.changed": z.object({ userId: z.string(), cleared: z.boolean() }),
  },
  retention: {
    "home.layout.changed": "operational",
    "home.note.changed": "operational",
  },
  visibility: {
    "home.layout.changed": "public",
    "home.note.changed": "public",
  },
  descriptions: {
    "home.layout.changed":
      "A parent rearranged the blocks of their home screen, or reset it to the default layout.",
    "home.note.changed": "A parent wrote or cleared the free note pinned on their home screen.",
  },
});
