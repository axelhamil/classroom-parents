import { IP_HEADERS, scrubBreadcrumb, scrubEvent, scrubLog } from "@packages/sentry-scrub";
import * as Sentry from "@sentry/bun";
import { env } from "../env";
import { redactSecretPath } from "../secret-path";

function withoutFeedSecret<E extends Sentry.Event>(event: E): E {
  if (event.transaction) event.transaction = redactSecretPath(event.transaction);
  if (event.request?.url) event.request.url = redactSecretPath(event.request.url);
  for (const span of event.spans ?? [])
    if (span.description) span.description = redactSecretPath(span.description);

  return event;
}

if (env.SENTRY_DSN) {
  Sentry.init({
    dsn: env.SENTRY_DSN,
    environment: env.SENTRY_ENVIRONMENT ?? env.NODE_ENV,
    release: env.GIT_SHA,
    tracesSampleRate: env.SENTRY_TRACES_SAMPLE_RATE,
    integrations: [Sentry.pinoIntegration()],
    // v11 collects user info, cookies, headers, bodies and query data by default.
    // Opt out of every category that can carry PII; beforeSend stays as a second net.
    dataCollection: {
      userInfo: false,
      cookies: false,
      httpHeaders: { request: { deny: IP_HEADERS }, response: { deny: IP_HEADERS } },
      httpBodies: [],
      urlQueryParams: false,
      databaseQueryData: false,
      queues: false,
      stackFrameVariables: false,
      genAI: { inputs: false, outputs: false },
      graphQL: { document: false, variables: false },
    },
    beforeSend: (event) => scrubEvent(withoutFeedSecret(event)),
    beforeSendTransaction: withoutFeedSecret,
    beforeBreadcrumb: scrubBreadcrumb,
    beforeSendLog: scrubLog,
  });
}
