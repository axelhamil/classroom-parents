import { Button } from "@packages/ui/components/ui/button";
import { Form } from "@packages/ui/components/ui/form";
import { FormTextField } from "@packages/ui/components/ui/form-text-field";
import { StepperActions } from "@packages/ui/components/ui/stepper";
import { useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { type ChildDto, childrenQueryOptions } from "../../../shared/api/queries/children";
import { ChildAvatarField } from "../../../shared/children/child-avatar-field";
import { ChildHueField } from "../../../shared/children/child-hue-field";
import { ChildProfilePreview } from "../../../shared/children/child-profile-preview";
import { useChildProfileForm } from "../../../shared/children/use-child-profile-form";
import type { ChildHue } from "../../../shared/format/child-hue";

export interface ChildNameFormProps {
  child: ChildDto;
  hue: ChildHue;
  onDone: () => void;
}

export function ChildNameForm({ child, hue, onDone }: ChildNameFormProps) {
  const { t } = useTranslation("onboarding");
  const queryClient = useQueryClient();
  const { form, submit, isPending } = useChildProfileForm({
    child,
    hue,
    failedCopy: t("name.failed"),
    onSaved: (edited) =>
      queryClient.setQueryData(childrenQueryOptions.queryKey, (family: ChildDto[] = []) =>
        family.map((known) =>
          known.id === edited.id ? { ...known, label: edited.label, color: edited.color } : known,
        ),
      ),
    onDone,
  });

  return (
    <Form {...form}>
      <form onSubmit={submit} className="flex flex-1 flex-col gap-6" noValidate>
        <FormTextField
          control={form.control}
          name="label"
          label={t("name.label")}
          description={t("name.hint")}
          autoComplete="off"
          enterKeyHint="next"
        />
        <ChildHueField control={form.control} childId={child.id} />
        <ChildAvatarField control={form.control} child={child} />
        <ChildProfilePreview control={form.control} child={child} />
        <StepperActions>
          <Button type="submit" size="lg" disabled={isPending}>
            {isPending ? t("name.saving") : t("name.next")}
          </Button>
        </StepperActions>
      </form>
    </Form>
  );
}
