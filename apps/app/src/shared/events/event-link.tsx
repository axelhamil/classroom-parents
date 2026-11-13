import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";

export interface EventLinkProps {
  eventId: string;
  className?: string;
  children: ReactNode;
}

export function EventLink({ eventId, ...props }: EventLinkProps) {
  return (
    <Link
      from="/"
      to="/"
      search={(prev) => ({ ...prev, event: eventId })}
      mask={{ to: "/events/$eventId", params: { eventId } }}
      {...props}
    />
  );
}
