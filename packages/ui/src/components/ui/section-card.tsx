import { type ReactNode, useId } from "react";

import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "./card";
import { useSectionHeading } from "./page-section";

export interface SectionCardProps {
  title: string;
  description?: ReactNode;
  tone?: "default" | "destructive";
  footer?: ReactNode;
  children?: ReactNode;
  "data-tour"?: string;
}

function SectionCard({
  title,
  description,
  tone = "default",
  footer,
  children,
  "data-tour": tourTarget,
}: SectionCardProps) {
  const titleId = useId();
  const Heading = useSectionHeading();

  return (
    <Card role="region" aria-labelledby={titleId} variant={tone} data-tour={tourTarget}>
      <CardHeader>
        <CardTitle asChild variant={tone}>
          <Heading id={titleId}>{title}</Heading>
        </CardTitle>
        {description ? <CardDescription>{description}</CardDescription> : null}
      </CardHeader>
      {children ? <CardContent className="flex flex-col gap-3">{children}</CardContent> : null}
      {footer ? <CardFooter className="flex-wrap gap-3">{footer}</CardFooter> : null}
    </Card>
  );
}

export { SectionCard };
