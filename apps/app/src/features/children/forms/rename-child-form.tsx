import { zodResolver } from "@hookform/resolvers/zod";
import { Button } from "@packages/ui/components/ui/button";
import { DialogFooter } from "@packages/ui/components/ui/dialog";
import { Form } from "@packages/ui/components/ui/form";
import { FormTextField } from "@packages/ui/components/ui/form-text-field";
import { toastError, toastSuccess } from "@packages/web-kit/api/errors/toast";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { useTranslation } from "react-i18next";
import { childrenQueryOptions } from "../../../shared/api/queries/children";
import {
  type ChildLabelInput,
  childLabelSchema,
} from "../../../shared/children/child-label.schema";
import { renameChildMutationOptions } from "../../../shared/children/child-link.mutations";

export interface RenameChildFormProps {
  childId: string;
  label: string;
  onDone: () => void;
}

export function RenameChildForm({ childId, label, onDone }: RenameChildFormProps) {
  const { t } = useTranslation("children");
  const queryClient = useQueryClient();
  const form = useForm<ChildLabelInput>({
    resolver: zodResolver(childLabelSchema),
    defaultValues: { label },
  });
  const rename = useMutation({
    ...renameChildMutationOptions,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: childrenQueryOptions.queryKey });
      toastSuccess(t("rename.done"));
      onDone();
    },
    onError: (error) => toastError(error, t("rename.failed")),
  });

  return (
    <Form {...form}>
      <form
        onSubmit={form.handleSubmit((values) => rename.mutate({ id: childId, ...values }))}
        className="flex flex-col gap-4"
        noValidate
      >
        <FormTextField
          control={form.control}
          name="label"
          label={t("rename.label")}
          autoComplete="off"
          enterKeyHint="done"
        />
        <DialogFooter showCloseButton closeLabel={t("rename.cancel")}>
          <Button type="submit" disabled={rename.isPending}>
            {rename.isPending ? t("rename.pending") : t("rename.submit")}
          </Button>
        </DialogFooter>
      </form>
    </Form>
  );
}
