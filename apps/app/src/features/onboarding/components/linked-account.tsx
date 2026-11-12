import { Button } from "@packages/ui/components/ui/button";
import { LoadErrorAlert } from "@packages/ui/components/ui/load-error-alert";
import { Spinner } from "@packages/ui/components/ui/spinner";
import { TypographyH2, TypographyMuted } from "@packages/ui/components/ui/typography";
import { apiErrorFields } from "@packages/web-kit/api/errors/api-error";
import { formatApiError } from "@packages/web-kit/api/errors/messages";
import { toastError } from "@packages/web-kit/api/errors/toast";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import { z } from "zod";
import { type ChildDto, childrenQueryOptions } from "../../../shared/api/queries/children";
import {
  discardLinkedAccountsMutationOptions,
  registerChildMutationOptions,
  syncChildMutationOptions,
} from "../../../shared/children/child-link.mutations";
import { linkableAccountsQueryOptions } from "../../../shared/children/child-link.queries";

const unusableLinksSchema = z.object({ unusableLinkedAccountIds: z.array(z.string()).min(1) });

export interface LinkedAccountProps {
  onRegistered: (childId: string) => void;
  onRetry: () => void;
  retrying: boolean;
}

interface PendingProps {
  label: string;
}

function Pending({ label }: PendingProps) {
  return (
    <TypographyMuted aria-live="polite" className="flex items-center gap-2">
      <Spinner aria-hidden label={label} />
      {label}
    </TypographyMuted>
  );
}

export function LinkedAccount({ onRegistered, onRetry, retrying }: LinkedAccountProps) {
  const { t } = useTranslation("onboarding");
  const { t: tErrors } = useTranslation("errors");
  const queryClient = useQueryClient();
  const linkable = useQuery(linkableAccountsQueryOptions);
  const sync = useMutation(syncChildMutationOptions);
  const register = useMutation({
    ...registerChildMutationOptions,
    onSuccess: (child) => {
      queryClient.setQueryData(childrenQueryOptions.queryKey, (family: ChildDto[] = []) => [
        ...family.filter((known) => known.id !== child.id),
        child,
      ]);
      void queryClient.invalidateQueries({ queryKey: linkableAccountsQueryOptions.queryKey });
      sync.mutate(child.id);
      onRegistered(child.id);
    },
  });
  const discard = useMutation({
    ...discardLinkedAccountsMutationOptions,
    onSuccess: onRetry,
    onError: (error) => toastError(error, t("connect.noneDescription")),
  });
  const autoRegistered = useRef(false);
  const accounts = linkable.data;
  const onlyAccount = accounts?.length === 1 ? accounts[0] : undefined;

  useEffect(() => {
    if (autoRegistered.current || !onlyAccount) return;
    autoRegistered.current = true;
    register.mutate(onlyAccount.linkedAccountId);
  }, [onlyAccount, register.mutate]);

  const retry = (
    <Button variant="outline" disabled={retrying} onClick={onRetry}>
      {t("connect.retry")}
    </Button>
  );

  if (register.isPending || register.isSuccess) {
    const email =
      accounts?.find((account) => account.linkedAccountId === register.variables)?.googleEmail ??
      "";
    return <Pending label={t("connect.registering", { email })} />;
  }
  if (register.isError) {
    return (
      <LoadErrorAlert
        message={formatApiError(register.error, t("connect.noneDescription"), tErrors)}
        retry={retry}
      />
    );
  }

  if (linkable.isPending) return <Pending label={t("connect.checking")} />;
  if (linkable.isError) {
    const unusable = unusableLinksSchema.safeParse(apiErrorFields(linkable.error).metadata);

    return (
      <LoadErrorAlert
        message={formatApiError(linkable.error, t("connect.noneDescription"), tErrors)}
        retry={
          unusable.success ? (
            <Button
              variant="outline"
              disabled={discard.isPending || retrying}
              onClick={() => discard.mutate(unusable.data.unusableLinkedAccountIds)}
            >
              {t("connect.discard")}
            </Button>
          ) : (
            retry
          )
        }
      />
    );
  }

  if (linkable.data.length === 0) {
    return (
      <section className="flex flex-col items-start gap-3">
        <TypographyH2 variant="section">{t("connect.noneTitle")}</TypographyH2>
        <TypographyMuted>{t("connect.noneDescription")}</TypographyMuted>
        {retry}
      </section>
    );
  }

  if (linkable.data.length === 1) return <Pending label={t("connect.checking")} />;

  return (
    <section className="flex flex-col gap-3">
      <TypographyH2 variant="section">{t("connect.pickTitle")}</TypographyH2>
      <TypographyMuted>{t("connect.pickDescription")}</TypographyMuted>
      {linkable.data.map((account) => (
        <Button
          key={account.linkedAccountId}
          variant="outline"
          size="wrap"
          onClick={() => register.mutate(account.linkedAccountId)}
        >
          {account.googleEmail}
        </Button>
      ))}
    </section>
  );
}
