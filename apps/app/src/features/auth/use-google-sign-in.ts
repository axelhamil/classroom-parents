import { useMutation } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { signInWithGoogleMutationOptions } from "./api/auth.mutations";
import { resolveAuthError } from "./auth-error";

export interface GoogleSignIn {
  pending: boolean;
  start: () => void;
}

export function useGoogleSignIn(redirect?: string): GoogleSignIn {
  const { t } = useTranslation("auth");
  const { t: tErrors } = useTranslation("errors");
  const signIn = useMutation({
    ...signInWithGoogleMutationOptions,
    onError: (error) => toast.error(resolveAuthError(error, "login.failed", t, tErrors)),
  });

  return { pending: signIn.isPending, start: () => signIn.mutate(redirect) };
}
