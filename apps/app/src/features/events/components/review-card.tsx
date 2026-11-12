import { Button } from "@packages/ui/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@packages/ui/components/ui/card";
import { ListRow, ListRowAction } from "@packages/ui/components/ui/list-row";
import { toastError, toastSuccess } from "@packages/web-kit/api/errors/toast";
import { errorFallback } from "@packages/web-kit/i18n/get-errors-t";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import type { EventItem } from "../../../shared/api/queries/events";
import { EventCard } from "../../../shared/events/event-card";
import type { ChildHue } from "../../../shared/format/child-hue";
import { confirmEventMutationOptions } from "../api/events.mutations";

export interface ReviewCardProps {
  events: readonly EventItem[];
  childLabel: (childId: string) => string;
  childColor: (childId: string) => ChildHue;
}

export function ReviewCard({ events, childLabel, childColor }: ReviewCardProps) {
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
        <ul className="flex flex-col gap-2">
          {events.map((event) => (
            <ListRow key={event.id} variant="plain" className="flex-col items-stretch">
              <EventCard
                event={event}
                childLabel={childLabel(event.childId)}
                hue={childColor(event.childId)}
              />
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
