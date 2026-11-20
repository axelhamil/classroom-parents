import { createContext, type ReactNode, useContext } from "react";

type SectionHeading = "h2" | "h3";

const SectionHeadingContext = createContext<SectionHeading>("h2");

/**
 * The heading level a card title takes where it is rendered: `h2` on its own in a page,
 * `h3` under a section that draws its own `h2`. Keeps the outline right without every card
 * being told where it sits.
 */
function useSectionHeading(): SectionHeading {
  return useContext(SectionHeadingContext);
}

/** Makes the card titles inside it `h3`, for a section that draws its own `h2`. */
function UnderSectionHeading({ children }: { children: ReactNode }) {
  return <SectionHeadingContext value="h3">{children}</SectionHeadingContext>;
}

export { UnderSectionHeading, useSectionHeading };
