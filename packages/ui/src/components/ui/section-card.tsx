import { type ReactNode, useId } from "react";

import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "./card";

export interface SectionCardProps {
  title: string;
  description?: ReactNode;
  tone?: "default" | "destructive";
  footer?: ReactNode;
  children?: ReactNode;
}

function SectionCard({ title, description, tone = "default", footer, children }: SectionCardProps) {
  const titleId = useId();

  return (
    <Card role="region" aria-labelledby={titleId} variant={tone} className="animate-enter">
      <CardHeader>
        <CardTitle asChild variant={tone}>
          <h2 id={titleId}>{title}</h2>
        </CardTitle>
        {description ? <CardDescription>{description}</CardDescription> : null}
      </CardHeader>
      {children ? <CardContent className="flex flex-col gap-4">{children}</CardContent> : null}
      {footer ? <CardFooter className="flex-wrap gap-3">{footer}</CardFooter> : null}
    </Card>
  );
}

export { SectionCard };
