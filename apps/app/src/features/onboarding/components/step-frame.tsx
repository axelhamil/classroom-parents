import { StepperActions, StepperIntro, StepperMedia } from "@packages/ui/components/ui/stepper";
import { TypographyH1, TypographyLead } from "@packages/ui/components/ui/typography";
import type { ComponentProps, ReactNode } from "react";

export interface StepFrameProps {
  media: ReactNode;
  mediaTone?: ComponentProps<typeof StepperMedia>["tone"];
  title: string;
  description?: ReactNode;
  actions?: ReactNode;
  children?: ReactNode;
}

export function StepFrame({
  media,
  mediaTone,
  title,
  description,
  actions,
  children,
}: StepFrameProps) {
  return (
    <>
      <StepperIntro>
        <StepperMedia tone={mediaTone}>{media}</StepperMedia>
        <TypographyH1 variant="page" tabIndex={-1}>
          {title}
        </TypographyH1>
        {description && <TypographyLead>{description}</TypographyLead>}
      </StepperIntro>
      {children}
      {actions && <StepperActions>{actions}</StepperActions>}
    </>
  );
}
