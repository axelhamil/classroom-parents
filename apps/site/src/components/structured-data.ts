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

export function schoolGuideStructuredData(siteUrl: string, path: string) {
  const { schools } = site;
  const url = `${siteUrl}${path}`;

  return {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "TechArticle",
        "@id": `${url}#guide`,
        headline: schools.title,
        description: schools.meta.description,
        url,
        inLanguage: "fr",
        about: { "@id": `${siteUrl}/#app` },
        audience: { "@type": "Audience", audienceType: schools.meta.audience },
      },
      {
        "@type": "BreadcrumbList",
        itemListElement: [
          { "@type": "ListItem", position: 1, name: common.brand, item: `${siteUrl}/` },
          { "@type": "ListItem", position: 2, name: schools.meta.breadcrumb, item: url },
        ],
      },
    ],
  };
}
