import { cva, type VariantProps } from "class-variance-authority";

/**
 * The width of a page, declared once per page. Every variant shares the fluid side gutter
 * (`--page-gutter`), so a banner, the app bar and the page content line up at any width.
 * - `full`: the whole screen, for pages of cards or lists that reflow into more columns.
 * - `reading`: a 70 character measure, for pages of running text (legal, help, a deadline).
 * - `form`: a lone form (sign-in) or a lone message.
 * - `wide`: the home, which lays out its own grid of blocks.
 * - `sheet`: the on-screen preview of the printed fridge planner.
 * - `landing`: the marketing site.
 */
const pageContainerVariants = cva("mx-auto w-full px-page-gutter", {
  variants: {
    width: {
      full: "",
      reading: "max-w-reading",
      form: "max-w-form",
      wide: "max-w-7xl",
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
