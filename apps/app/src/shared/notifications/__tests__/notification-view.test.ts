import { createI18n, frCatalog } from "@packages/i18n";
import { describe, expect, it } from "vitest";
import { type NotificationTarget, notificationView } from "../notification-view";
import type { NotificationItem } from "../notifications.queries";

type Content = NotificationItem["content"];

const HOME: NotificationTarget = { to: "/" };
const EVENT: NotificationTarget = { to: "/events/$eventId", params: { eventId: "e1" } };
const CHILDREN: NotificationTarget = { to: "/children" };
const MUSEUM = { id: "e1", title: "Sortie au musée" };

const CASES: [
  string,
  Content,
  NotificationItem["event"],
  string | null,
  string,
  NotificationTarget,
][] = [
  [
    "a reminder",
    { kind: "deadline_reminder", eventId: "e1" },
    MUSEUM,
    "Jade",
    "Rappel : Sortie au musée",
    EVENT,
  ],
  [
    "a reminder of a deleted deadline",
    { kind: "deadline_reminder", eventId: "e1" },
    null,
    "Jade",
    "Rappel d'une échéance",
    EVENT,
  ],
  [
    "grouped reminders",
    { kind: "deadline_reminders", count: 3 },
    MUSEUM,
    null,
    "3 rappels pour la prochaine demi-heure",
    HOME,
  ],
  [
    "one grouped reminder",
    { kind: "deadline_reminders", count: 1 },
    null,
    null,
    "1 rappel pour la prochaine demi-heure",
    HOME,
  ],
  [
    "the weekly digest",
    { kind: "weekly_digest", deadlines: 5, weekStart: "2026-11-23" },
    null,
    null,
    "Votre semaine : 5 échéances",
    HOME,
  ],
  [
    "a lost access",
    { kind: "access_lost" },
    null,
    "Jade",
    "Reconnectez le compte de Jade",
    CHILDREN,
  ],
  [
    "a lost access of an unknown child",
    { kind: "access_lost" },
    null,
    null,
    "Reconnectez le compte Google d'un enfant",
    CHILDREN,
  ],
  [
    "the school allowing the app",
    { kind: "school_allowed" },
    null,
    "Jade",
    "L'école a autorisé KeepUpKids pour Jade",
    CHILDREN,
  ],
  [
    "the school allowing the app for an unknown child",
    { kind: "school_allowed" },
    null,
    null,
    "L'école a autorisé KeepUpKids",
    CHILDREN,
  ],
  [
    "new deadlines",
    { kind: "new_deadlines", count: 3 },
    null,
    "Jade",
    "3 nouvelles échéances pour Jade",
    HOME,
  ],
  [
    "new deadlines of an unknown child",
    { kind: "new_deadlines", count: 1 },
    null,
    null,
    "1 nouvelle échéance",
    HOME,
  ],
  [
    "a moved deadline",
    { kind: "deadline_amended", eventId: "e1", reason: "moved" },
    MUSEUM,
    "Jade",
    "Date déplacée : Sortie au musée",
    EVENT,
  ],
  [
    "a cancelled deadline",
    { kind: "deadline_amended", eventId: "e1", reason: "cancelled" },
    MUSEUM,
    "Jade",
    "Échéance annulée : Sortie au musée",
    EVENT,
  ],
  [
    "a cancelled deadline since deleted",
    { kind: "deadline_amended", eventId: "e1", reason: "cancelled" },
    null,
    "Jade",
    "Une échéance a été annulée",
    EVENT,
  ],
  [
    "one date to check",
    { kind: "dates_to_check", eventIds: ["e1"] },
    MUSEUM,
    "Jade",
    "1 date à vérifier pour Jade",
    EVENT,
  ],
  [
    "two dates to check",
    { kind: "dates_to_check", eventIds: ["e1", "e2"] },
    MUSEUM,
    "Jade",
    "2 dates à vérifier pour Jade",
    HOME,
  ],
  [
    "dates to check of an unknown child",
    { kind: "dates_to_check", eventIds: ["e1", "e2"] },
    null,
    null,
    "2 dates à vérifier",
    HOME,
  ],
];

describe("notification view", () => {
  it.each(CASES)(
    "given %s, then the row reads its sentence and opens its target",
    async (_, content, event, child, sentence, target) => {
      const i18n = await createI18n({ locale: "fr", resources: frCatalog });

      const view = notificationView({ content, event }, child);

      expect(i18n.t(view.copy.key, { ns: "notifications", ...view.copy.values })).toBe(sentence);
      expect(view.target).toEqual(target);
    },
  );
});
