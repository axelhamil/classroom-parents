import { Button } from "@packages/ui/components/ui/button";
import { DialogFooter } from "@packages/ui/components/ui/dialog";
import { Form } from "@packages/ui/components/ui/form";
import { FormTextField } from "@packages/ui/components/ui/form-text-field";
import { toastSuccess } from "@packages/web-kit/api/errors/toast";
import { useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { type ChildDto, childrenQueryOptions } from "../../../shared/api/queries/children";
import { ChildAvatarField } from "../../../shared/children/child-avatar-field";
import { ChildHueField } from "../../../shared/children/child-hue-field";
import { ChildProfilePreview } from "../../../shared/children/child-profile-preview";
import { useChildProfileForm } from "../../../shared/children/use-child-profile-form";
import type { ChildHue } from "../../../shared/format/child-hue";

export interface CustomizeChildFormProps {
  child: ChildDto;
  hue: ChildHue;
  onDone: () => void;
}

export function CustomizeChildForm({ child, hue, onDone }: CustomizeChildFormProps) {
  const { t } = useTranslation("children");
  const queryClient = useQueryClient();
  const { form, submit, isPending } = useChildProfileForm({
    child,
    hue,
    failedCopy: t("customize.failed"),
    onSaved: (edited) => {
      void queryClient.invalidateQueries({ queryKey: childrenQueryOptions.queryKey });
      toastSuccess(t("customize.done", { label: edited.label }));
    },
    onDone,
  });

  return (
    <Form {...form}>
      <form onSubmit={submit} className="flex flex-col gap-6" noValidate>
        <FormTextField
          control={form.control}
          name="label"
          label={t("customize.label")}
          autoComplete="off"
          enterKeyHint="done"
        />
        <ChildHueField control={form.control} childId={child.id} />
        <ChildAvatarField control={form.control} child={child} />
        <ChildProfilePreview control={form.control} child={child} />
        <DialogFooter showCloseButton closeLabel={t("customize.cancel")}>
          <Button type="submit" disabled={isPending}>
            {isPending ? t("customize.pending") : t("customize.submit")}
          </Button>
        </DialogFooter>
      </form>
    </Form>
  );
}
