import type { IPushSender } from "@modules/alerts/application/ports/push-sender.port";
import type { IGoogleOAuthClient } from "@modules/children/application/ports/google-oauth-client.port";
import type { IAnnouncementExtractor } from "@modules/classroom-sync/application/ports/announcement-extractor.port";
import type { IClassroomClient } from "@modules/classroom-sync/application/ports/classroom-client.port";
import { Option } from "@packages/ddd-kit";
import { defineModule } from "inwire";
import type { FakeProviders } from "../dev/fake-providers";
import type { env } from "../shared/env";

interface ProviderBindings {
  IGoogleOAuthClient: IGoogleOAuthClient;
  IClassroomClient: IClassroomClient;
  IAnnouncementExtractor: IAnnouncementExtractor;
  IPushSender: IPushSender;
}

type FakesSource = Pick<typeof env, "FAKE_PROVIDERS" | "NODE_ENV" | "DATABASE_URL">;

export const fakeProviderBindings = async (source: FakesSource) => {
  if (!source.FAKE_PROVIDERS)
    return defineModule<ProviderBindings>()((b) =>
      b.add("FakeProviders", (): Option<FakeProviders> => Option.none()),
    );

  const { assertFakesAllowed, fakeProviders } = await import("../dev/fake-providers");
  assertFakesAllowed(source);
  const fakes = fakeProviders();

  return defineModule<ProviderBindings>()((b) =>
    b
      .override("IGoogleOAuthClient", () => fakes.googleOAuth)
      .override("IClassroomClient", () => fakes.classroom)
      .override("IAnnouncementExtractor", () => fakes.extractor)
      .override("IPushSender", () => fakes.push)
      .add("FakeProviders", (): Option<FakeProviders> => Option.some(fakes)),
  );
};
