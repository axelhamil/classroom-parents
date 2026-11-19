import { captureError } from "../observability/sentry";
import { offlineStorageAvailable, readOffline, writeOffline } from "./offline-store";
import { forgetOfflineData } from "./query-persistence";

const SESSION_KEY = "session";

interface StorableSession {
  user: { id: string; pendingDeletionUntil?: Date | string | null };
  session: { token: string; expiresAt: Date | string };
}

interface SessionReply<TSession> {
  data: TSession | null;
  error: { status: number } | null;
}

function keepsAgendaOffline(session: StorableSession | null): session is StorableSession {
  return session !== null && !session.user.pendingDeletionUntil;
}

async function rememberSession(session: StorableSession | null): Promise<void> {
  if (!keepsAgendaOffline(session)) return forgetOfflineData();
  if (!offlineStorageAvailable()) return;

  await writeOffline(SESSION_KEY, { ...session, session: { ...session.session, token: "" } });
}

async function savedSession<TSession extends StorableSession>(): Promise<TSession | undefined> {
  if (!offlineStorageAvailable()) return undefined;

  const saved = await readOffline<TSession>(SESSION_KEY);

  return saved && new Date(saved.session.expiresAt).getTime() > Date.now() ? saved : undefined;
}

function isNetworkFailure(error: unknown): boolean {
  return error instanceof TypeError;
}

/**
 * Reads the session from the server and keeps a copy without its token for offline
 * launches; when the request cannot leave the device, answers with that copy until it
 * expires. A signed-out answer or an account awaiting deletion wipes every offline copy.
 */
export async function sessionOrOffline<TSession extends StorableSession>(
  fetchSession: () => Promise<SessionReply<TSession>>,
  onOfflineAnswer: () => void,
): Promise<SessionReply<TSession>> {
  try {
    const reply = await fetchSession();
    if (!reply.error || reply.error.status === 401)
      void rememberSession(reply.data).catch((error: unknown) =>
        captureError(error, { area: "offline" }),
      );

    return reply;
  } catch (error) {
    const saved = isNetworkFailure(error) ? await savedSession<TSession>() : undefined;
    if (!saved) throw error;

    onOfflineAnswer();
    return { data: saved, error: null };
  }
}
