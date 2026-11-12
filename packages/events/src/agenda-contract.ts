export const CLASSROOM_CATEGORIES = [
  "assessment",
  "homework",
  "school_trip",
  "swimming",
  "document_due",
] as const;

export const EVENT_CATEGORIES = [...CLASSROOM_CATEGORIES, "other"] as const;

export const EVENT_TITLE_MAX = 120;

export const EVENT_DESCRIPTION_MAX = 2000;
