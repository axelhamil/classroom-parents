import { throwApiError } from "@packages/web-kit/api/errors/api-error";
import { mutationOptions } from "@tanstack/react-query";
import { api } from "../../../shared/api/api-client";

const $export = api.me.export.$post;

const FALLBACK_FILE_NAME = "keepupkids-data.json";

export interface DataExport {
  fileName: string;
  content: Blob;
}

function fileNameOf(disposition: string | null): string {
  return disposition?.match(/filename="([^"]+)"/)?.[1] ?? FALLBACK_FILE_NAME;
}

export const exportDataMutationOptions = mutationOptions({
  mutationKey: ["account", "export"] as const,
  mutationFn: async (): Promise<DataExport> => {
    const res = await $export();
    if (!res.ok) await throwApiError(res, "exportData");

    return {
      fileName: fileNameOf(res.headers.get("Content-Disposition")),
      content: await res.blob(),
    };
  },
});
