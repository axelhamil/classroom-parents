import { Button } from "@packages/ui/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@packages/ui/components/ui/card";
import { ListRow, ListRowAction, ListRowContent } from "@packages/ui/components/ui/list-row";
import { TypographyInline } from "@packages/ui/components/ui/typography";
import { toastError, toastSuccess } from "@packages/web-kit/api/errors/toast";
import { errorFallback } from "@packages/web-kit/i18n/get-errors-t";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import type { EventItem } from "../../../shared/api/queries/events";
import { deadlineLabel } from "../../../shared/format/deadline-label";
import { confirmEventMutationOptions } from "../api/events.mutations";

export interface ReviewCardProps {
  events: readonly EventItem[];
  now: Date;
}

export function ReviewCard({ events, now }: ReviewCardProps) {
  const { t } = useTranslation("events");
  const queryClient = useQueryClient();
  const confirm = useMutation({
    ...confirmEventMutationOptions,
    onSuccess: () => {
      toastSuccess(t("review.confirmed"));
      void queryClient.invalidateQueries({ queryKey: ["events"] });
    },
    onError: (error) => toastError(error, errorFallback("confirmEvent")),
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle asChild>
          <h2>{t("review.title")}</h2>
        </CardTitle>
        <CardDescription>{t("review.description")}</CardDescription>
      </CardHeader>
      <CardContent>
        <ul className="flex flex-col">
          {events.map((event) => (
            <ListRow key={event.id} variant="ruled" className="flex-col items-start py-2">
              <ListRowContent className="w-full min-w-0">
                <TypographyInline weight="semibold" className="line-clamp-2 wrap-anywhere">
                  {event.title}
                </TypographyInline>
                <TypographyInline tone="muted" size="sm">
                  {deadlineLabel(event.deadlineDate, event.deadlineTime, now)}
                </TypographyInline>
              </ListRowContent>
              <ListRowAction>
                <Button
                  type="button"
                  size="sm"
                  disabled={confirm.isPending && confirm.variables === event.id}
                  onClick={() => confirm.mutate(event.id)}
                >
                  {t("review.confirm")}
                </Button>
                <Button asChild size="sm" variant="outline">
                  <Link to="/events/$eventId/edit" params={{ eventId: event.id }}>
                    {t("review.edit")}
                  </Link>
                </Button>
              </ListRowAction>
            </ListRow>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}
