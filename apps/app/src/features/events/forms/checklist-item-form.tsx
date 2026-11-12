import { zodResolver } from "@hookform/resolvers/zod";
import { Button } from "@packages/ui/components/ui/button";
import { Form } from "@packages/ui/components/ui/form";
import { FormTextField } from "@packages/ui/components/ui/form-text-field";
import { PlusIcon } from "lucide-react";
import { useForm } from "react-hook-form";
import { useTranslation } from "react-i18next";
import { type ChecklistItemInput, checklistItemSchema } from "../events.schema";

export interface ChecklistItemFormProps {
  onAdd: (label: string) => void;
}

export function ChecklistItemForm({ onAdd }: ChecklistItemFormProps) {
  const { t } = useTranslation("events");
  const form = useForm<ChecklistItemInput>({
    resolver: zodResolver(checklistItemSchema),
    defaultValues: { label: "" },
  });

  return (
    <Form {...form}>
      <form
        onSubmit={form.handleSubmit((values) => {
          onAdd(values.label);
          form.reset();
        })}
        className="grid grid-cols-[minmax(0,1fr)_auto] items-end gap-2"
        noValidate
      >
        <FormTextField
          control={form.control}
          name="label"
          label={t("prepare.newItem")}
          autoComplete="off"
          enterKeyHint="done"
        />
        <Button type="submit" variant="outline">
          <PlusIcon aria-hidden />
          {t("prepare.add")}
        </Button>
      </form>
    </Form>
  );
}
