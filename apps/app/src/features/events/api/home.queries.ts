import { throwApiError } from "@packages/web-kit/api/errors/api-error";
import { queryOptions } from "@tanstack/react-query";
import type { InferResponseType } from "hono/client";
import { api } from "../../../shared/api/api-client";

const $layout = api.home.layout.$get;
const $note = api.home.note.$get;

export type HomeLayoutReply = InferResponseType<typeof $layout, 200>;
export type HomeNote = InferResponseType<typeof $note, 200>;

export const HOME_LAYOUT_KEY = ["home", "layout"] as const;
export const HOME_NOTE_KEY = ["home", "note"] as const;

export const homeLayoutQueryOptions = queryOptions({
  queryKey: HOME_LAYOUT_KEY,
  queryFn: async ({ signal }): Promise<HomeLayoutReply> => {
    const res = await $layout(undefined, { init: { signal } });
    if (!res.ok) await throwApiError(res, "loadHomeLayout");
    return res.json();
  },
});

export const homeNoteQueryOptions = queryOptions({
  queryKey: HOME_NOTE_KEY,
  queryFn: async ({ signal }): Promise<HomeNote> => {
    const res = await $note(undefined, { init: { signal } });
    if (!res.ok) await throwApiError(res, "loadHomeNote");
    return res.json();
  },
});
