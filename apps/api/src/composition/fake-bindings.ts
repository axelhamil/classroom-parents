import type { IGoogleOAuthClient } from "@modules/children/application/ports/google-oauth-client.port";
import type { IAnnouncementExtractor } from "@modules/classroom-sync/application/ports/announcement-extractor.port";
import type { IClassroomClient } from "@modules/classroom-sync/application/ports/classroom-client.port";
import { Option } from "@packages/ddd-kit";
import { defineModule } from "inwire";
import { assertFakesAllowed, type FakeProviders, fakeProviders } from "../dev/fake-providers";
import type { env } from "../shared/env";

interface ProviderBindings {
  IGoogleOAuthClient: IGoogleOAuthClient;
  IClassroomClient: IClassroomClient;
  IAnnouncementExtractor: IAnnouncementExtractor;
}

type FakesSource = Pick<typeof env, "FAKE_PROVIDERS" | "NODE_ENV" | "DATABASE_URL">;

export const fakeProviderBindings = (source: FakesSource) => {
  if (!source.FAKE_PROVIDERS)
    return defineModule<ProviderBindings>()((b) =>
      b.add("FakeProviders", (): Option<FakeProviders> => Option.none()),
    );

  assertFakesAllowed(source);
  const fakes = fakeProviders();

  return defineModule<ProviderBindings>()((b) =>
    b
      .override("IGoogleOAuthClient", () => fakes.googleOAuth)
      .override("IClassroomClient", () => fakes.classroom)
      .override("IAnnouncementExtractor", () => fakes.extractor)
      .add("FakeProviders", (): Option<FakeProviders> => Option.some(fakes)),
  );
};
