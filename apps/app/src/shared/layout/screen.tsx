import { pageContainerVariants } from "@packages/ui/components/ui/page-container";
import { PageHeader } from "@packages/ui/components/ui/page-header";
import { cn } from "@packages/ui/libs/utils.js";
import type { ReactNode } from "react";

export interface ScreenProps {
  title: string;
  description?: string;
  aside?: ReactNode;
  children?: ReactNode;
}

export function Screen({ title, description, aside, children }: ScreenProps) {
  return (
    <main
      className={cn(pageContainerVariants({ width: "prose" }), "flex flex-col gap-6 py-6 md:py-10")}
    >
      <PageHeader title={title} description={description} actions={aside} />
      {children}
    </main>
  );
}
