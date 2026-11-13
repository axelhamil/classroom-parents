import { pageContainerVariants } from "@packages/ui/components/ui/page-container";
import { PageHeader } from "@packages/ui/components/ui/page-header";
import { cn } from "@packages/ui/libs/utils.js";
import type { ReactNode } from "react";

export interface ScreenProps {
  title: string;
  description?: string;
  actions?: ReactNode;
  width?: "prose" | "app" | "wide";
  children: ReactNode;
}

export function Screen({ title, description, actions, width = "prose", children }: ScreenProps) {
  return (
    <main
      className={cn(
        pageContainerVariants({ width }),
        "@container flex flex-1 flex-col gap-6 pt-2 pb-10 md:gap-8 md:pt-4 md:pb-12",
      )}
    >
      <PageHeader title={title} description={description} actions={actions} />
      {children}
    </main>
  );
}
