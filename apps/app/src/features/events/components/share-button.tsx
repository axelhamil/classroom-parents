import { Button } from "@packages/ui/components/ui/button";
import { toastSuccess } from "@packages/web-kit/api/errors/toast";
import { CheckIcon, Share2Icon } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { type SharedText, shareOrCopy } from "../../../shared/events/share";

const FEEDBACK_MS = 2000;

export interface ShareButtonProps {
  label: string;
  payload: () => SharedText;
}

export function ShareButton({ label, payload }: ShareButtonProps) {
  const { t } = useTranslation("events");
  const [copied, setCopied] = useState(false);

  const share = async () => {
    const outcome = await shareOrCopy(payload());
    if (outcome === "failed") {
      toast.error(t("share.failed"));
      return;
    }
    if (outcome !== "copied") return;

    toastSuccess(t("share.copied"));
    setCopied(true);
    window.setTimeout(() => setCopied(false), FEEDBACK_MS);
  };

  return (
    <Button type="button" variant="outline" onClick={() => void share()}>
      {copied ? (
        <CheckIcon key="copied" data-slot="feedback-icon" aria-hidden />
      ) : (
        <Share2Icon key="share" data-slot="feedback-icon" aria-hidden />
      )}
      {label}
    </Button>
  );
}
