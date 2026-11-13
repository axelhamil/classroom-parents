import { createFileRoute, redirect } from "@tanstack/react-router";
import { eventFiltersSearchSchema } from "../../shared/events/event-filters.schema";

export const Route = createFileRoute("/_protected/_shell/history")({
  beforeLoad: ({ search }) => {
    throw redirect({
      to: "/",
      search: { ...eventFiltersSearchSchema.parse(search), tab: "history" },
      replace: true,
    });
  },
});
