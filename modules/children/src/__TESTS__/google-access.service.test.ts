import { beforeEach, describe, expect, it } from "bun:test";
import { Option } from "@packages/ddd-kit";
import { EventTypes } from "@packages/events";
import type { IOutboxRepository } from "@packages/outbox/outbox.port";
import { enqueuedEvents } from "@packages/outbox/testing/enqueued-events";
import type { PortMock } from "@packages/test/bun";
import type { IChildRepository } from "../application/ports/child-repository.port";
import type { IGoogleCredentialStore } from "../application/ports/google-credential-store.port";
import type {
  GoogleAccess,
  IGoogleOAuthClient,
} from "../application/ports/google-oauth-client.port";
import type { GoogleAccessService } from "../application/services/google-access.service";
import {
  child,
  childrenHarness,
  credentials,
  fail,
  LINKED,
  NOW,
  ok,
  PARENT,
} from "./children-harness";

let repo: PortMock<IChildRepository>;
let store: PortMock<IGoogleCredentialStore>;
let google: PortMock<IGoogleOAuthClient>;
let outbox: PortMock<IOutboxRepository>;
let access: GoogleAccessService;

beforeEach(() => {
  ({ repo, store, google, outbox, access } = childrenHarness());
});

describe("accessTokenFor", () => {
  it("given an expired access token, then it refreshes once, stores the new token and returns it in clear", async () => {
    const owned = child();
    repo.findForSystem.mockResolvedValue(ok(Option.some(owned)));
    store.read.mockResolvedValue(
      ok(
        Option.some(
          credentials({ accessTokenExpiresAt: Option.some(new Date(NOW.getTime() - 1000)) }),
        ),
      ),
    );
    const refreshed: GoogleAccess = {
      accessToken: "ya29.fresh",
      expiresAt: new Date(NOW.getTime() + 3600_000),
      refreshToken: Option.none(),
    };
    google.refresh.mockResolvedValue(ok(refreshed));

    const result = await access.accessTokenFor(owned.id.value);

    expect(result.getValue()).toBe("ya29.fresh");
    expect(google.refresh).toHaveBeenCalledTimes(1);
    expect(google.refresh).toHaveBeenCalledWith("1//refresh");
    expect(store.replace).toHaveBeenCalledWith(PARENT, LINKED, refreshed);
  });

  it("given a live access token, then no refresh", async () => {
    const owned = child();
    repo.findForSystem.mockResolvedValue(ok(Option.some(owned)));

    const result = await access.accessTokenFor(owned.id.value);

    expect(result.getValue()).toBe("ya29.live");
    expect(google.refresh).not.toHaveBeenCalled();
  });

  it("given invalid_grant, then the child needs reconnect, CHILD_NEEDS_RECONNECT is enqueued and CHILD_TOKEN_INVALID_GRANT returned", async () => {
    const owned = child();
    repo.findForSystem.mockResolvedValue(ok(Option.some(owned)));
    store.read.mockResolvedValue(ok(Option.some(credentials({ accessToken: Option.none() }))));
    google.refresh.mockResolvedValue(fail<GoogleAccess>("CHILD_TOKEN_INVALID_GRANT"));

    const result = await access.accessTokenFor(owned.id.value);

    expect(result.getError().code).toBe("CHILD_TOKEN_INVALID_GRANT");
    expect(owned.get("status").value).toBe("needs_reconnect");
    expect(repo.save).toHaveBeenCalledWith(owned);
    expect(enqueuedEvents(outbox)).toEqual([
      {
        eventType: EventTypes.CHILD_NEEDS_RECONNECT,
        aggregateId: owned.id.value,
        payload: {
          userId: PARENT,
          childId: owned.id.value,
          cause: "invalid_grant",
          actorUserId: null,
        },
      },
    ]);
  });
});
