import { zodResolver } from "@hookform/resolvers/zod";
import { Button } from "@packages/ui/components/ui/button";
import { Form } from "@packages/ui/components/ui/form";
import { FormTextField } from "@packages/ui/components/ui/form-text-field";
import { StepperActions } from "@packages/ui/components/ui/stepper";
import { toastError } from "@packages/web-kit/api/errors/toast";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { useTranslation } from "react-i18next";
import { type ChildDto, childrenQueryOptions } from "../../../shared/api/queries/children";
import {
  type ChildLabelInput,
  childLabelSchema,
} from "../../../shared/children/child-label.schema";
import { renameChildMutationOptions } from "../../../shared/children/child-link.mutations";

export interface ChildNameFormProps {
  child: ChildDto;
  onDone: () => void;
}

export function ChildNameForm({ child, onDone }: ChildNameFormProps) {
  const { t } = useTranslation("onboarding");
  const queryClient = useQueryClient();
  const form = useForm<ChildLabelInput>({
    resolver: zodResolver(childLabelSchema),
    defaultValues: { label: child.label },
  });
  const rename = useMutation({
    ...renameChildMutationOptions,
    onSuccess: (renamed) => {
      queryClient.setQueryData(childrenQueryOptions.queryKey, (family: ChildDto[] = []) =>
        family.map((known) =>
          known.id === renamed.id ? { ...known, label: renamed.label } : known,
        ),
      );
      onDone();
    },
    onError: (error) => toastError(error, t("name.failed")),
  });
  const submit = ({ label }: ChildLabelInput) => {
    if (label === child.label) return onDone();

    rename.mutate({ id: child.id, label });
  };

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(submit)} className="flex flex-1 flex-col gap-6" noValidate>
        <FormTextField
          control={form.control}
          name="label"
          label={t("name.label")}
          description={t("name.hint")}
          autoComplete="off"
          enterKeyHint="next"
        />
        <StepperActions>
          <Button type="submit" size="lg" disabled={rename.isPending}>
            {rename.isPending ? t("name.saving") : t("name.next")}
          </Button>
        </StepperActions>
      </form>
    </Form>
  );
}
