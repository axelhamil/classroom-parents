import { cva, type VariantProps } from "class-variance-authority";

/**
 * The width of a page, declared once per page. Every variant shares the fluid side gutter
 * (`--page-gutter`), so a banner, the app bar and the page content line up at any width.
 * - `full`: the whole screen, the default of every page. Its sections reflow into columns
 *   (`SectionGrid`, `CardGrid`) and its running text keeps its measure (`ReadingText`).
 * - `form`: a lone form (sign-in) or a lone message (the error fallback).
 * - `sheet`: the on-screen preview of the printed fridge planner.
 * - `landing`: the marketing site.
 */
const pageContainerVariants = cva("mx-auto w-full px-page-gutter", {
  variants: {
    width: {
      full: "",
      form: "max-w-form",
      sheet: "max-w-5xl",
      landing: "max-w-7xl",
    },
  },
  defaultVariants: {
    width: "full",
  },
});

type PageWidth = NonNullable<VariantProps<typeof pageContainerVariants>["width"]>;

export { type PageWidth, pageContainerVariants };
