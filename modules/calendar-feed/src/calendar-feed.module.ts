import type { IInstrumentation, IUnitOfWork } from "@packages/ddd-kit";
import type { IOutboxRepository } from "@packages/outbox/outbox.port";
import { defineModule } from "inwire";
import type { CalendarFeedSettings } from "./application/config/calendar-feed-settings";
import type { ICalendarFeedRepository } from "./application/ports/calendar-feed-repository.port";
import type { IFeedChildren } from "./application/ports/feed-children.port";
import type { IFeedEntries } from "./application/ports/feed-entries.port";
import { CalendarFeedService } from "./application/services/calendar-feed.service";
import { randomFeedSecrets } from "./infrastructure/adapters/random-feed-secrets";
import { DrizzleCalendarFeedRepository } from "./infrastructure/repositories/drizzle-calendar-feed.repository";

export interface CalendarFeedPrerequisites {
  IInstrumentation: IInstrumentation;
  ITransactionService: IUnitOfWork;
  IOutboxRepository: IOutboxRepository;
  IFeedChildren: IFeedChildren;
  IFeedEntries: IFeedEntries;
  calendarFeedSettings: CalendarFeedSettings;
}

export const calendarFeedModule = defineModule<CalendarFeedPrerequisites>()((b) =>
  b
    .add(
      "ICalendarFeedRepository",
      (c): ICalendarFeedRepository => new DrizzleCalendarFeedRepository(c.IInstrumentation),
    )
    .add(
      "CalendarFeedService",
      (c) =>
        new CalendarFeedService(
          c.ICalendarFeedRepository,
          c.IFeedChildren,
          c.IFeedEntries,
          randomFeedSecrets,
          c.ITransactionService,
          c.IOutboxRepository,
          c.IInstrumentation,
          c.calendarFeedSettings,
        ),
    ),
);
