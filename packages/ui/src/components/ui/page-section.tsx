import { createContext, type ReactNode, useContext, useId } from "react";

import { TypographyH2 } from "./typography";

type SectionHeading = "h2" | "h3";

const SectionHeadingContext = createContext<SectionHeading>("h2");

/**
 * The heading level a card title takes where it is rendered: `h2` on its own in a page,
 * `h3` inside a `PageSection`, whose own title is the `h2`. Keeps the outline right without
 * every card being told where it sits.
 */
function useSectionHeading(): SectionHeading {
  return useContext(SectionHeadingContext);
}

export interface PageSectionProps {
  id: string;
  title: string;
  children: ReactNode;
}

/**
 * A named group of cards on a long page, reachable by its `id` from a `SectionNav`. Inside a
 * `CardColumns` it is one block: its title and cards never split across two columns, so a
 * column always opens on a section title (measured against a grid per section, which leaves
 * twice the empty height). It stops below the sticky section nav when jumped to.
 */
function PageSection({ id, title, children }: PageSectionProps) {
  const titleId = useId();

  return (
    <section
      id={id}
      aria-labelledby={titleId}
      data-slot="page-section"
      className="scroll-mt-4 space-y-6 break-inside-avoid not-first:mt-10 lg:scroll-mt-section-nav"
    >
      <TypographyH2 id={titleId} className="mb-3">
        {title}
      </TypographyH2>
      <SectionHeadingContext value="h3">{children}</SectionHeadingContext>
    </section>
  );
}

export { PageSection, useSectionHeading };
