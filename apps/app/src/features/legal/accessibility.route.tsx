import { pageContainerVariants } from "@packages/ui/components/ui/page-container";
import { PageHeader } from "@packages/ui/components/ui/page-header";
import { Separator } from "@packages/ui/components/ui/separator";
import { TypographyH2, TypographyList, TypographyP } from "@packages/ui/components/ui/typography";
import { cn } from "@packages/ui/libs/utils.js";
import { createFileRoute } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { ContactLink } from "./components/contact-link";

export const Route = createFileRoute("/legal/accessibility")({
  component: AccessibilityPage,
});

function AccessibilityPage() {
  const { t } = useTranslation("common");
  return (
    <main className={cn(pageContainerVariants({ width: "prose" }), "flex flex-col gap-8 py-8")}>
      <PageHeader
        title={t("legal.accessibility.title")}
        description={t("legal.accessibility.subtitle")}
      />

      <Separator />

      <section className="flex flex-col gap-3">
        <TypographyH2>État de conformité</TypographyH2>
        <TypographyP>
          L'application vise la conformité au niveau AA des WCAG 2.1 et au RGAA 4.1. Elle est
          partiellement conforme : aucun audit externe n'a encore été mené.
        </TypographyP>
      </section>

      <section className="flex flex-col gap-3">
        <TypographyH2>Ce qui est vérifié</TypographyH2>
        <TypographyList>
          <li>
            Chaque page est contrôlée automatiquement (axe) en thème clair et sombre, avec un seul
            titre principal et une seule zone de contenu.
          </li>
          <li>Les contrastes des couleurs atteignent le niveau AA.</li>
          <li>Tout se fait au clavier, et les cibles tactiles mesurent au moins 44 pixels.</li>
        </TypographyList>
      </section>

      <section className="flex flex-col gap-3">
        <TypographyH2>Technologies</TypographyH2>
        <TypographyP>HTML5, CSS, ARIA et React 19.</TypographyP>
      </section>

      <section className="flex flex-col gap-3">
        <TypographyH2>Nous signaler un problème</TypographyH2>
        <TypographyP>
          Si un contenu vous est inaccessible, écrivez à <ContactLink /> : nous vous répondons sous
          15 jours ouvrés et vous transmettons l'information sous une autre forme.
        </TypographyP>
      </section>

      <section className="flex flex-col gap-3">
        <TypographyH2>Recours</TypographyH2>
        <TypographyP>
          Si notre réponse ne vous satisfait pas, vous pouvez saisir le Défenseur des droits
          (defenseurdesdroits.fr).
        </TypographyP>
      </section>
    </main>
  );
}
