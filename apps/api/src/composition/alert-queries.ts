import type { IAccessLossContextReader } from "@modules/alerts/application/ports/access-loss-context.port";
import type { IAlertContextReader } from "@modules/alerts/application/ports/alert-context-reader.port";
import type { IDigestAudience } from "@modules/alerts/application/ports/digest-audience.port";
import type { IParentTimeZone } from "@modules/alerts/application/ports/parent-time-zone.port";
import type { IInstrumentation } from "@packages/ddd-kit";
import { defineModule } from "inwire";
import { AccessLossContextQuery } from "../queries/access-loss-context.query";
import { AlertContextQuery } from "../queries/alert-context.query";
import { DigestAudienceQuery } from "../queries/digest-audience.query";
import { parentTimeZoneFor, type TimeZonePreference } from "./bindings";

export const alertQueriesModule = (appOrigin: string, preferences: () => TimeZonePreference) =>
  defineModule<{ IInstrumentation: IInstrumentation }>()((b) =>
    b
      .add("IParentTimeZone", (): IParentTimeZone => parentTimeZoneFor(preferences))
      .add(
        "IAlertContextReader",
        (c): IAlertContextReader =>
          new AlertContextQuery(c.IInstrumentation, appOrigin, c.IParentTimeZone),
      )
      .add("IDigestAudience", (c): IDigestAudience => new DigestAudienceQuery(c.IInstrumentation))
      .add(
        "IAccessLossContextReader",
        (c): IAccessLossContextReader => new AccessLossContextQuery(c.IInstrumentation),
      ),
  );
