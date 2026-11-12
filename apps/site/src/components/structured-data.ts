import { frCatalog } from "@packages/i18n";
import { FAQ_QUESTIONS } from "./landing-details";

const { common, site } = frCatalog;

export function structuredData(siteUrl: string) {
  return {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "WebApplication",
        "@id": `${siteUrl}/#app`,
        name: common.brand,
        url: `${siteUrl}/`,
        applicationCategory: "EducationalApplication",
        operatingSystem: "Web, Android, iOS",
        inLanguage: "fr",
        description: site.meta.applicationDescription,
        audience: { "@type": "Audience", audienceType: site.meta.audience },
      },
      {
        "@type": "FAQPage",
        inLanguage: "fr",
        mainEntity: FAQ_QUESTIONS.map((question) => ({
          "@type": "Question",
          name: site.faq[question].question,
          acceptedAnswer: { "@type": "Answer", text: site.faq[question].answer },
        })),
      },
    ],
  };
}
