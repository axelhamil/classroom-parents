import type { ReactNode } from "react";

import { TypographyH1, TypographyMuted } from "./typography";

export interface PageHeaderProps {
  eyebrow?: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
}

function PageHeader({ eyebrow, title, description, actions }: PageHeaderProps) {
  return (
    <header
      data-slot="page-header"
      className="flex flex-col items-start gap-4 @lg:flex-row @lg:justify-between"
    >
      <div className="flex min-w-0 flex-col gap-2">
        {eyebrow}
        <TypographyH1 variant="page" className="break-words">
          {title}
        </TypographyH1>
        {typeof description === "string" ? (
          <TypographyMuted>{description}</TypographyMuted>
        ) : (
          description
        )}
      </div>
      {actions}
    </header>
  );
}

export { PageHeader };
