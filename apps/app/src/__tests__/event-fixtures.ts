import { CHILD } from "./family-fixtures";

export const EVENT_BASE = {
  id: "0f6b6a2c-3c1d-4f0e-9a43-5d2b1c7e8f90",
  childId: CHILD.id,
  status: "confirmed",
  source: "announcement",
  done: false,
  announcementUrl: "https://classroom.google.com/c/abc/p/def",
  receivedAt: "2026-11-05T10:00:00.000Z",
  edited: false,
  editedFields: [],
  checklist: { done: [], removed: [], extra: [] },
};
