import { Button } from "@packages/ui/components/ui/button";
import { Form } from "@packages/ui/components/ui/form";
import { FormTextField } from "@packages/ui/components/ui/form-text-field";
import { useForm } from "react-hook-form";
import { useTranslation } from "react-i18next";

export interface ImportIcsLinkFormProps {
  pending: boolean;
  onImport: (url: string) => void;
}

/** The public iCalendar link a school publishes, read once by the server. */
export function ImportIcsLinkForm({ pending, onImport }: ImportIcsLinkFormProps) {
  const { t } = useTranslation("settings");
  const form = useForm<{ url: string }>({ defaultValues: { url: "" } });

  return (
    <Form {...form}>
      <form
        onSubmit={form.handleSubmit(({ url }) => onImport(url.trim()))}
        className="flex flex-col gap-2"
        noValidate
      >
        <FormTextField
          control={form.control}
          name="url"
          type="url"
          inputMode="url"
          label={t("schoolHolidays.own.importUrl")}
          description={t("schoolHolidays.own.importUrlHint")}
          placeholder="https://"
        />
        <Button type="submit" size="sm" variant="outline" className="self-start" disabled={pending}>
          {t("schoolHolidays.own.importUrlAction")}
        </Button>
      </form>
    </Form>
  );
}
