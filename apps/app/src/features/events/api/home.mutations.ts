import { throwApiError } from "@packages/web-kit/api/errors/api-error";
import { mutationOptions } from "@tanstack/react-query";
import type { InferRequestType } from "hono/client";
import { api } from "../../../shared/api/api-client";

const $saveLayout = api.home.layout.$put;
const $saveNote = api.home.note.$put;

export type HomeLayoutBody = InferRequestType<typeof $saveLayout>["json"];

export const saveHomeLayoutMutationOptions = mutationOptions({
  mutationKey: ["home", "layout", "save"] as const,
  scope: { id: "home-layout" },
  networkMode: "online",
  mutationFn: async (body: HomeLayoutBody) => {
    const res = await $saveLayout({ json: body });
    if (!res.ok) await throwApiError(res, "saveHomeLayout");
    return res.json();
  },
});

export const saveHomeNoteMutationOptions = mutationOptions({
  mutationKey: ["home", "note", "save"] as const,
  mutationFn: async (body: string) => {
    const res = await $saveNote({ json: { body } });
    if (!res.ok) await throwApiError(res, "saveHomeNote");
    return res.json();
  },
});
