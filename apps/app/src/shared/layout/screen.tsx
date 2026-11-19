import { type PageWidth, pageContainerVariants } from "@packages/ui/components/ui/page-container";
import { PageHeader } from "@packages/ui/components/ui/page-header";
import { cn } from "@packages/ui/libs/utils.js";
import type { ReactNode } from "react";

type ScreenWidth = Exclude<PageWidth, "landing" | "sheet">;

export interface ScreenProps {
  eyebrow?: ReactNode;
  title: string;
  description?: ReactNode;
  actions?: ReactNode;
  width: ScreenWidth;
  children: ReactNode;
}

export function Screen({ eyebrow, title, description, actions, width, children }: ScreenProps) {
  return (
    <main
      className={cn(
        pageContainerVariants({ width }),
        "@container flex flex-1 flex-col gap-6 pt-2 pb-10 md:gap-8 md:pt-4 md:pb-12",
      )}
    >
      <PageHeader eyebrow={eyebrow} title={title} description={description} actions={actions} />
      {children}
    </main>
  );
}
