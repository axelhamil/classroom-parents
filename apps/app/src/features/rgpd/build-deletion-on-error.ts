import { apiErrorFields } from "@packages/web-kit/api/errors/api-error";
import { formatApiError } from "@packages/web-kit/api/errors/messages";
import type { TFunction } from "i18next";
import { toast } from "sonner";

type FieldErrorReporter = (message: string) => void;

export function buildDeletionOnError(
  fieldErrorCode: string,
  reportFieldError: FieldErrorReporter,
  tErrors: TFunction<"errors">,
  t: TFunction<"settings">,
) {
  return (err: unknown) => {
    const { code } = apiErrorFields(err);
    if (code === fieldErrorCode) {
      reportFieldError(t("deletion.invalidCredential"));
      return;
    }

    toast.error(formatApiError(err, t("deletion.requestFailed"), tErrors));
  };
}
