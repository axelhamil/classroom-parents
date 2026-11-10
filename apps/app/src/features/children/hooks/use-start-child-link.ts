import { toastError } from "@packages/web-kit/api/errors/toast";
import { useMutation } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { startChildLinkMutationOptions } from "../api/children.mutations";

export function useStartChildLink() {
  const { t } = useTranslation("children");

  return useMutation({
    ...startChildLinkMutationOptions,
    onError: (error) => toastError(error, t("reconnect.failed")),
  });
}
