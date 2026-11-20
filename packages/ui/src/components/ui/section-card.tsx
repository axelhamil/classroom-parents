import { type ReactNode, useId } from "react";

import { cn } from "../../libs/utils";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "./card";
import { useSectionHeading } from "./page-section";

export interface SectionCardProps {
  title: string;
  description?: ReactNode;
  tone?: "default" | "destructive";
  footer?: ReactNode;
  children?: ReactNode;
  "data-tour"?: string;
  /** The anchor a link or a search lands on; the card then takes the focus (`tabIndex={-1}`). */
  id?: string;
  tabIndex?: number;
  /** Layout only (width, placement), for a composition built on it. */
  className?: string;
  /** A smaller title, for cards that sit in a pane under a section's own title. */
  compactTitle?: boolean;
}

function SectionCard({
  title,
  description,
  tone = "default",
  footer,
  children,
  "data-tour": tourTarget,
  id,
  tabIndex,
  className,
  compactTitle = false,
}: SectionCardProps) {
  const titleId = useId();
  const Heading = useSectionHeading();

  return (
    <Card
      id={id}
      role="region"
      aria-labelledby={titleId}
      tabIndex={tabIndex}
      variant={tone}
      data-tour={tourTarget}
      className={className}
    >
      <CardHeader>
        <CardTitle asChild variant={tone} className={cn(compactTitle && "text-heading")}>
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
