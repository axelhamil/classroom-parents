import { cva } from "class-variance-authority";

const pageContainerVariants = cva("mx-auto w-full px-4 sm:px-6", {
  variants: {
    width: {
      app: "max-w-5xl",
      prose: "max-w-3xl",
      form: "max-w-md",
      landing: "max-w-2xl lg:max-w-6xl",
    },
  },
  defaultVariants: {
    width: "app",
  },
});

export { pageContainerVariants };
