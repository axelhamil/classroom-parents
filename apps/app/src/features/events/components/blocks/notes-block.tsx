import { DashboardPanelNote } from "@packages/ui/components/ui/dashboard";
import { NotesIcon } from "@packages/ui/components/ui/icons";
import { Textarea } from "@packages/ui/components/ui/textarea";
import { toastError } from "@packages/web-kit/api/errors/toast";
import { errorFallback } from "@packages/web-kit/i18n/get-errors-t";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { saveHomeNoteMutationOptions } from "../../api/home.mutations";
import { HOME_NOTE_KEY, homeNoteQueryOptions } from "../../api/home.queries";
import type { HomeBlockDefinition, HomeBlockProps } from "../../home-block";
import { useDebounced } from "../../hooks/use-debounced";
import { BlockPanel } from "./block-panel";

const NOTE_MAX = 4000;
const TYPING_PAUSE_MS = 1200;

interface NoteEditorProps {
  saved: string;
}

function NoteEditor({ saved }: NoteEditorProps) {
  const { t } = useTranslation("home");
  const queryClient = useQueryClient();
  const [body, setBody] = useState(saved);
  const save = useMutation({
    ...saveHomeNoteMutationOptions,
    onSuccess: (note) => queryClient.setQueryData(HOME_NOTE_KEY, note),
    onError: (error) => toastError(error, errorFallback("saveHomeNote")),
  });
  const { schedule, flush } = useDebounced(save.mutate, TYPING_PAUSE_MS);

  const type = (next: string) => {
    setBody(next);
    schedule(next);
  };

  return (
    <>
      <Textarea
        aria-label={t("blocks.notes.label")}
        placeholder={t("blocks.notes.placeholder")}
        maxLength={NOTE_MAX}
        value={body}
        onChange={(event) => type(event.target.value)}
        onBlur={flush}
        className="min-h-0 flex-1"
      />
      <DashboardPanelNote role="status">
        {save.isPending && t("blocks.notes.saving")}
        {save.isError && t("blocks.notes.failed")}
        {save.isSuccess && t("blocks.notes.saved")}
      </DashboardPanelNote>
    </>
  );
}

function NotesBlock({ title }: HomeBlockProps) {
  const query = useQuery(homeNoteQueryOptions);

  return (
    <BlockPanel title={title} icon={NotesIcon}>
      {query.data && <NoteEditor saved={query.data.body} />}
    </BlockPanel>
  );
}

export const notesBlock: HomeBlockDefinition = {
  id: "notes",
  titleKey: "blocks.notes.title",
  descriptionKey: "blocks.notes.description",
  icon: NotesIcon,
  Component: NotesBlock,
};
