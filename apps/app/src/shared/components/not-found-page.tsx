import { Button } from "@packages/ui/components/ui/button";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
} from "@packages/ui/components/ui/empty";
import { pageContainerVariants } from "@packages/ui/components/ui/page-container";
import { TypographyH1 } from "@packages/ui/components/ui/typography";
import { cn } from "@packages/ui/libs/utils.js";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { MapPinOff } from "lucide-react";
import { useTranslation } from "react-i18next";
import { sessionQueryOptions } from "../api/queries/session";
import { AppShell } from "../layout/app-shell";

export function NotFoundPage() {
  const { t } = useTranslation();
  const { data: session } = useQuery(sessionQueryOptions);

  const page = (
    <main
      className={cn(
        pageContainerVariants({ width: "form" }),
        "flex flex-1 flex-col justify-center py-16",
      )}
    >
      <Empty>
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <MapPinOff aria-hidden />
          </EmptyMedia>
          <TypographyH1 variant="hero">{t("notFound.title")}</TypographyH1>
          <EmptyDescription>{t("notFound.description")}</EmptyDescription>
        </EmptyHeader>
        <EmptyContent>
          <Button asChild>
            <Link to="/">{t("notFound.backHome")}</Link>
          </Button>
        </EmptyContent>
      </Empty>
    </main>
  );

  if (!session) return <div className="flex min-h-dvh flex-col">{page}</div>;

  return <AppShell user={session.user}>{page}</AppShell>;
}
