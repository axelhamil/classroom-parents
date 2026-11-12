import { useEffect, useRef, useState } from "react";
import type { GoogleSignIn } from "./use-google-sign-in";

export const AUTO_START_FALLBACK_MS = 4000;

export function useAutoGoogleSignIn(
  enabled: boolean,
  signIn: GoogleSignIn,
  onStarted: () => void,
): boolean {
  const [waiting, setWaiting] = useState(enabled);
  const started = useRef(false);
  const { start } = signIn;

  useEffect(() => {
    if (!enabled || started.current) return;

    started.current = true;
    start();
    onStarted();
  }, [enabled, start, onStarted]);

  useEffect(() => {
    if (!waiting) return;

    const timer = setTimeout(() => setWaiting(false), AUTO_START_FALLBACK_MS);
    return () => clearTimeout(timer);
  }, [waiting]);

  return waiting && !signIn.failed;
}
