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
import { TextLink } from "@packages/ui/components/ui/text-link";
import { TypographyH2, TypographyP } from "@packages/ui/components/ui/typography";
import { cn } from "@packages/ui/libs/utils.js";
import { createFileRoute } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { SUB_PROCESSOR_KEYS } from "../../shared/sub-processor-labels";
import { SUB_PROCESSORS } from "../../shared/sub-processors.config";
import { ContactLink } from "./components/contact-link";

export const Route = createFileRoute("/legal/sub-processors")({
  component: SubProcessorsPage,
});

function SubProcessorTable() {
  const { t } = useTranslation("common");

  return (
    <Table>
      <TableCaption>{t("legal.subProcessors.tableCaption")}</TableCaption>
      <TableHeader>
        <TableRow>
          <TableHead>{t("legal.subProcessors.table.name")}</TableHead>
          <TableHead>{t("legal.subProcessors.table.purpose")}</TableHead>
          <TableHead>{t("legal.subProcessors.table.region")}</TableHead>
          <TableHead>{t("legal.subProcessors.table.dpa")}</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {SUB_PROCESSORS.map((sp) => (
          <TableRow key={sp.name}>
            <TableCell>
              <TextLink href={sp.url} target="_blank" rel="noopener noreferrer">
                {sp.name}
              </TextLink>
            </TableCell>
            <TableCell className="min-w-56 whitespace-normal">
              {t(SUB_PROCESSOR_KEYS[sp.id].purpose)}
            </TableCell>
            <TableCell>{t(SUB_PROCESSOR_KEYS[sp.id].region)}</TableCell>
            <TableCell>
              {sp.dpaUrl ? (
                <TextLink href={sp.dpaUrl} target="_blank" rel="noopener noreferrer">
                  {t("legal.subProcessors.dpaLink")}
                </TextLink>
              ) : (
                t("legal.subProcessors.noDpa")
              )}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

function SubProcessorsPage() {
  const { t } = useTranslation("common");
  return (
    <main className={cn(pageContainerVariants({ width: "prose" }), "flex flex-col gap-8 py-8")}>
      <PageHeader
        title={t("legal.subProcessors.title")}
        description={t("legal.subProcessors.subtitle")}
      />

      <Separator />

      <section className="flex flex-col gap-3">
        <TypographyH2>Qu'est-ce qu'un sous-traitant ?</TypographyH2>
        <TypographyP>
          Un prestataire qui traite des données personnelles pour notre compte, au sens de l'article
          28 du RGPD. Chacun ne reçoit que ce qui est nécessaire à sa mission et s'engage par
          contrat à protéger ces données.
        </TypographyP>
      </section>

      <section className="flex flex-col gap-3">
        <TypographyH2>Sous-traitants actuels</TypographyH2>
        <SubProcessorTable />
      </section>

      <section className="flex flex-col gap-3">
        <TypographyH2>Changements</TypographyH2>
        <TypographyP>
          Nous vous prévenons par e-mail au moins 30 jours avant d'ajouter ou de remplacer un
          sous-traitant. Pour toute question : <ContactLink />.
        </TypographyP>
      </section>
    </main>
  );
}
