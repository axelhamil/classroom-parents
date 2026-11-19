import { zodResolver } from "@hookform/resolvers/zod";
import { toastError } from "@packages/web-kit/api/errors/toast";
import { useMutation } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import type { ChildDto } from "../api/queries/children";
import type { ChildHue } from "../format/child-hue";
import { type EditedChild, editChildMutationOptions } from "./child-link.mutations";
import {
  type ChildProfileInput,
  childProfileSchema,
  hasChanges,
  profileChanges,
} from "./child-profile.schema";

export interface ChildProfileFormOptions {
  child: ChildDto;
  hue: ChildHue;
  failedCopy: string;
  onSaved: (edited: EditedChild) => void;
  onDone: () => void;
}

export function useChildProfileForm({
  child,
  hue,
  failedCopy,
  onSaved,
  onDone,
}: ChildProfileFormOptions) {
  const current: ChildProfileInput = { label: child.label, color: hue };
  const form = useForm<ChildProfileInput>({
    resolver: zodResolver(childProfileSchema),
    defaultValues: current,
  });
  const edit = useMutation({
    ...editChildMutationOptions,
    onSuccess: (edited) => {
      onSaved(edited);
      onDone();
    },
    onError: (error) => toastError(error, failedCopy),
  });

  const submit = form.handleSubmit((values) => {
    const changes = profileChanges(current, values);
    if (!hasChanges(changes)) return onDone();

    edit.mutate({ id: child.id, changes });
  });

  return { form, submit, isPending: edit.isPending };
}
