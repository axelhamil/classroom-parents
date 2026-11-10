import { pageContainerVariants } from "@packages/ui/components/ui/page-container";
import { PageHeader } from "@packages/ui/components/ui/page-header";
import { Separator } from "@packages/ui/components/ui/separator";
import { TextLink } from "@packages/ui/components/ui/text-link";
import { TypographyH2, TypographyList, TypographyP } from "@packages/ui/components/ui/typography";
import { cn } from "@packages/ui/libs/utils.js";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { ContactLink } from "./components/contact-link";

export const Route = createFileRoute("/legal/data-rights")({
  component: DataRightsPage,
});

function DataRightsPage() {
  const { t } = useTranslation("common");

  return (
    <main className={cn(pageContainerVariants({ width: "prose" }), "flex flex-col gap-8 py-8")}>
      <PageHeader
        title={t("legal.dataRights.title")}
        description={t("legal.dataRights.subtitle")}
      />

      <Separator />

      <section className="flex flex-col gap-3">
        <TypographyH2>Retirer un enfant</TypographyH2>
        <TypographyP>
          Depuis l'écran Enfants, retirez le compte d'un enfant : nous révoquons auprès de Google
          l'accès qu'il avait donné, supprimons ses jetons, puis effaçons ses cours, ses échéances
          et leurs alertes. C'est immédiat et définitif.
        </TypographyP>
      </section>

      <section className="flex flex-col gap-3">
        <TypographyH2>Supprimer votre compte (article 17)</TypographyH2>
        <TypographyP>
          Depuis Réglages, demandez la suppression de votre compte. Par sécurité, une connexion
          Google de moins de 24 heures est demandée. La suppression prend effet après un délai de 7
          jours, pendant lequel vous pouvez l'annuler depuis l'application.
        </TypographyP>
        <TypographyP>À l'issue de ce délai, nous effaçons définitivement :</TypographyP>
        <TypographyList>
          <li>votre compte, vos sessions et vos réglages ;</li>
          <li>les comptes de vos enfants, après révocation de leurs accès Google ;</li>
          <li>toutes les échéances, leurs corrections et leurs alertes ;</li>
          <li>les abonnements aux notifications de vos appareils ;</li>
          <li>l'historique interne des événements liés à votre compte.</li>
        </TypographyList>
        <TypographyP>
          Rien n'est anonymisé ni gardé à part : seul l'e-mail qui confirme la suppression est
          envoyé, puis effacé sous 7 jours.
        </TypographyP>
      </section>

      <section className="flex flex-col gap-3">
        <TypographyH2>Accès, rectification, portabilité et autres droits</TypographyH2>
        <TypographyP>
          Vous pouvez corriger une échéance directement dans l'application. Pour obtenir une copie
          de vos données, les faire rectifier, limiter ou vous opposer à un traitement, écrivez à{" "}
          <ContactLink />. Nous répondons sous un mois.
        </TypographyP>
        <TypographyP>
          Si notre réponse ne vous satisfait pas, vous pouvez saisir la CNIL (cnil.fr).
        </TypographyP>
      </section>

      <section className="flex flex-col gap-3">
        <TypographyH2>Pages liées</TypographyH2>
        <TextLink asChild>
          <Link to="/legal/privacy-policy">Politique de confidentialité</Link>
        </TextLink>
        <TextLink asChild>
          <Link to="/legal/sub-processors">Registre des sous-traitants</Link>
        </TextLink>
      </section>
    </main>
  );
}
