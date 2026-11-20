import { Button } from "@packages/ui/components/ui/button";
import { Field, FieldLabel } from "@packages/ui/components/ui/field";
import { Textarea } from "@packages/ui/components/ui/textarea";
import { toastSuccess } from "@packages/web-kit/api/errors/toast";
import { Copy, Mail } from "lucide-react";
import { useId, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

export interface SchoolRequestMessageProps {
  subject: string;
  initialBody: string;
}

function mailtoHref(subject: string, body: string): string {
  return `mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}

export function SchoolRequestMessage({ subject, initialBody }: SchoolRequestMessageProps) {
  const { t } = useTranslation("help");
  const fieldId = useId();
  const [body, setBody] = useState(initialBody);

  const copy = () =>
    void navigator.clipboard
      .writeText(body)
      .then(() => toastSuccess(t("school.message.copied")))
      .catch(() => toast.error(t("school.message.copyFailed")));

  return (
    <>
      <Field>
        <FieldLabel htmlFor={fieldId}>{t("school.message.label")}</FieldLabel>
        <Textarea
          id={fieldId}
          value={body}
          onChange={(event) => setBody(event.target.value)}
          rows={14}
        />
      </Field>

      <div className="flex flex-wrap gap-3">
        <Button asChild>
          <a href={mailtoHref(subject, body)}>
            <Mail aria-hidden />
            {t("school.message.open")}
          </a>
        </Button>
        <Button type="button" variant="outline" onClick={copy}>
          <Copy aria-hidden />
          {t("school.message.copy")}
        </Button>
      </div>
    </>
  );
}
