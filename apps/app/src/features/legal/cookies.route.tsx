import { pageContainerVariants } from "@packages/ui/components/ui/page-container";
import { PageHeader } from "@packages/ui/components/ui/page-header";
import { Separator } from "@packages/ui/components/ui/separator";
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@packages/ui/components/ui/table";
import {
  TypographyH2,
  TypographyInlineCode,
  TypographyP,
} from "@packages/ui/components/ui/typography";
import { cn } from "@packages/ui/libs/utils.js";
import { createFileRoute } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { COOKIE_INVENTORY, type CookieInfo } from "./cookies.config";

export const Route = createFileRoute("/legal/cookies")({
  component: CookiesPage,
});

interface CookieTableProps {
  cookies: readonly CookieInfo[];
  caption: string;
}

function CookieTable({ cookies, caption }: CookieTableProps) {
  const { t } = useTranslation("common");

  return (
    <Table>
      <TableCaption>{caption}</TableCaption>
      <TableHeader>
        <TableRow>
          <TableHead>{t("legal.cookies.table.name")}</TableHead>
          <TableHead>{t("legal.cookies.table.provider")}</TableHead>
          <TableHead>{t("legal.cookies.table.purpose")}</TableHead>
          <TableHead>{t("legal.cookies.table.retention")}</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {cookies.map((cookie) => (
          <TableRow key={cookie.name}>
            <TableCell>
              <TypographyInlineCode>{cookie.name}</TypographyInlineCode>
            </TableCell>
            <TableCell>{cookie.provider}</TableCell>
            <TableCell className="min-w-56 whitespace-normal">{cookie.purpose}</TableCell>
            <TableCell>{cookie.retention}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

function CookiesPage() {
  const { t } = useTranslation("common");
  return (
    <main className={cn(pageContainerVariants({ width: "prose" }), "flex flex-col gap-8 py-8")}>
      <PageHeader title={t("legal.cookies.title")} description={t("legal.cookies.subtitle")} />

      <Separator />

      <section className="flex flex-col gap-3">
        <TypographyH2>Seulement le nécessaire</TypographyH2>
        <TypographyP>
          L'application ne dépose que les cookies indispensables à votre connexion et à l'affichage.
          Aucun cookie de mesure d'audience ni de publicité : aucun consentement n'est donc demandé.
          Le thème clair ou sombre est retenu dans le stockage de votre navigateur, sans cookie.
        </TypographyP>
      </section>

      <section className="flex flex-col gap-3">
        <TypographyH2>Cookies déposés</TypographyH2>
        <CookieTable cookies={COOKIE_INVENTORY} caption={t("legal.cookies.tableCaption")} />
      </section>
    </main>
  );
}
