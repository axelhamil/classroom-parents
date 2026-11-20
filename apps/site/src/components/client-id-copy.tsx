import { CopyableValue } from "@packages/ui/components/ui/copyable-value";
import { TooltipProvider } from "@packages/ui/components/ui/tooltip";
import { TypographyMuted } from "@packages/ui/components/ui/typography";
import { useState } from "react";

export interface ClientIdCopyProps {
  clientId: string;
  copyLabel: string;
  copiedLabel: string;
}

export function ClientIdCopy({ clientId, copyLabel, copiedLabel }: ClientIdCopyProps) {
  const [copied, setCopied] = useState(false);

  return (
    <TooltipProvider>
      <CopyableValue value={clientId} copyLabel={copyLabel} onCopied={() => setCopied(true)} />
      <TypographyMuted aria-live="polite">{copied ? copiedLabel : ""}</TypographyMuted>
    </TooltipProvider>
  );
}
