import { toastSuccess } from "@packages/web-kit/api/errors/toast";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import type { ChildDto } from "../../../shared/api/queries/children";
import type { EventItem } from "../../../shared/api/queries/events";
import { deadlineIcs, downloadIcs, icsFileName } from "../../../shared/calendar/ics";
import { type EventReminders, eventRemindersQueryOptions } from "../api/events.queries";

const RINGING_STATUSES: ReadonlySet<string> = new Set(["pending", "sent"]);

function ringingAt(reminders: EventReminders | undefined): Date[] {
  return (reminders?.reminders ?? []).flatMap(({ dueAt, status }) =>
    dueAt && RINGING_STATUSES.has(status) ? [new Date(dueAt)] : [],
  );
}

export function useAgendaDownload(event: EventItem, child: ChildDto | undefined): () => void {
  const { t } = useTranslation("events");
  const reminders = useQuery({ ...eventRemindersQueryOptions(event.id), enabled: !event.done });

  return () => {
    const summary = child
      ? t("share.deadline", { child: child.label, title: event.title })
      : event.title;
    const alarmsAt = event.done ? [] : ringingAt(reminders.data);
    const content = deadlineIcs({ ...event, summary, alarmsAt }, new Date());

    downloadIcs(icsFileName(event.title), content);
    toastSuccess(t("agenda.downloaded"));
  };
}
