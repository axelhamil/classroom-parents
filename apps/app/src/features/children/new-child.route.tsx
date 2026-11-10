import { Button } from "@packages/ui/components/ui/button";
import { LoadErrorAlert } from "@packages/ui/components/ui/load-error-alert";
import { TypographyH2, TypographyMuted, TypographyP } from "@packages/ui/components/ui/typography";
import { apiErrorFields } from "@packages/web-kit/api/errors/api-error";
import { formatApiError } from "@packages/web-kit/api/errors/messages";
import { toastError } from "@packages/web-kit/api/errors/toast";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { LoaderCircle } from "lucide-react";
import { useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import { z } from "zod";
import { Screen } from "../../shared/layout/screen";
import {
  ADD_CHILD,
  discardLinkedAccountsMutationOptions,
  registerChildMutationOptions,
  syncChildMutationOptions,
} from "./api/children.mutations";
import {
  childrenQueryOptions,
  firstEventQueryOptions,
  linkableAccountsQueryOptions,
} from "./api/children.queries";
import { newChildSearchSchema } from "./children.schema";
import { AddChildExplainer } from "./components/add-child-explainer";
import { ChildCard } from "./components/child-card";
import { useStartChildLink } from "./hooks/use-start-child-link";

export const Route = createFileRoute("/_protected/_shell/children/new")({
  validateSearch: newChildSearchSchema,
  component: NewChildPage,
});

const unusableLinksSchema = z.object({ unusableLinkedAccountIds: z.array(z.string()).min(1) });

function NewChildPage() {
  const { t } = useTranslation("children");
  const { linked } = Route.useSearch();
  const start = useStartChildLink();

  return (
    <Screen title={t("new.title")} description={t("new.description")}>
      {linked === 1 ? (
        <LinkedAccountStep />
      ) : (
        <AddChildExplainer starting={start.isPending} onStart={() => start.mutate(ADD_CHILD)} />
      )}
    </Screen>
  );
}

interface PendingProps {
  label: string;
}

function Pending({ label }: PendingProps) {
  return (
    <TypographyMuted aria-live="polite" className="flex items-center gap-2">
      <LoaderCircle aria-hidden className="size-4 animate-spin motion-reduce:animate-none" />
      {label}
    </TypographyMuted>
  );
}

function LinkedAccountStep() {
  const { t } = useTranslation("children");
  const { t: tErrors } = useTranslation("errors");
  const queryClient = useQueryClient();
  const linkable = useQuery(linkableAccountsQueryOptions);
  const start = useStartChildLink();
  const sync = useMutation(syncChildMutationOptions);
  const register = useMutation({
    ...registerChildMutationOptions,
    onSuccess: (child) => {
      void queryClient.invalidateQueries({ queryKey: childrenQueryOptions.queryKey });
      sync.mutate(child.id);
    },
  });
  const discard = useMutation({
    ...discardLinkedAccountsMutationOptions,
    onSuccess: () => start.mutate(ADD_CHILD),
    onError: (error) => toastError(error, t("reconnect.failed")),
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
    <Button variant="outline" disabled={start.isPending} onClick={() => start.mutate(ADD_CHILD)}>
      {t("new.retry")}
    </Button>
  );

  if (register.isSuccess) return <FirstSync childId={register.data.id} />;
  if (register.isPending) {
    const email =
      accounts?.find((account) => account.linkedAccountId === register.variables)?.googleEmail ??
      "";
    return <Pending label={t("new.registering", { email })} />;
  }
  if (register.isError) {
    return (
      <LoadErrorAlert
        message={formatApiError(register.error, t("new.noneDescription"), tErrors)}
        retry={retry}
      />
    );
  }

  if (linkable.isPending) return <Pending label={t("new.checking")} />;
  if (linkable.isError) {
    const unusable = unusableLinksSchema.safeParse(apiErrorFields(linkable.error).metadata);
    const message = formatApiError(linkable.error, t("new.noneDescription"), tErrors);

    return (
      <LoadErrorAlert
        message={message}
        retry={
          unusable.success ? (
            <Button
              variant="outline"
              disabled={discard.isPending || start.isPending}
              onClick={() => discard.mutate(unusable.data.unusableLinkedAccountIds)}
            >
              {t("new.discard")}
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
        <TypographyH2 variant="section">{t("new.noneTitle")}</TypographyH2>
        <TypographyMuted>{t("new.noneDescription")}</TypographyMuted>
        {retry}
      </section>
    );
  }

  if (linkable.data.length === 1) return <Pending label={t("new.checking")} />;

  return (
    <section className="flex flex-col gap-3">
      <TypographyH2 variant="section">{t("new.pickTitle")}</TypographyH2>
      <TypographyMuted>{t("new.pickDescription")}</TypographyMuted>
      {linkable.data.map((account) => (
        <Button
          key={account.linkedAccountId}
          variant="outline"
          size="lg"
          onClick={() => register.mutate(account.linkedAccountId)}
        >
          {account.googleEmail}
        </Button>
      ))}
    </section>
  );
}

interface FirstSyncProps {
  childId: string;
}

function FirstSync({ childId }: FirstSyncProps) {
  const { t } = useTranslation("children");
  const child = useQuery({
    ...childrenQueryOptions,
    select: (children) => children.find((candidate) => candidate.id === childId),
  }).data;
  const connected = child?.status === "connected";
  const ready = connected && !child.syncing && Boolean(child.lastSyncedAt);
  const running = !child || (connected && !ready);
  const firstEvent = useQuery(firstEventQueryOptions(childId, ready)).data;

  return (
    <section aria-labelledby="first-sync-title" className="flex flex-col gap-4">
      <TypographyH2 id="first-sync-title" variant="section">
        {t("firstSync.title")}
      </TypographyH2>

      {child && <ChildCard child={child} />}

      {running && <Pending label={t("firstSync.running")} />}
      {ready && (
        <div aria-live="polite" className="flex flex-col gap-1">
          <TypographyP>{t("firstSync.done")}</TypographyP>
          <TypographyMuted>
            {firstEvent
              ? t("firstSync.firstEvent", { title: firstEvent.title })
              : t("firstSync.noEvent")}
          </TypographyMuted>
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        <Button asChild>
          <Link to="/">{t("firstSync.toEvents")}</Link>
        </Button>
        <Button asChild variant="outline">
          <Link to="/children/new">{t("firstSync.addAnother")}</Link>
        </Button>
      </div>
    </section>
  );
}
