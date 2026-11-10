import { authClient } from "./auth-client";

export interface GoogleSignInRequest {
  callbackPath: string;
  errorPath: string;
  loginHint?: string;
}

export function signInWithGoogle({ callbackPath, errorPath, loginHint }: GoogleSignInRequest) {
  const origin = window.location.origin;

  return authClient.signIn.social({
    provider: "google",
    callbackURL: new URL(callbackPath, origin).href,
    errorCallbackURL: new URL(errorPath, origin).href,
    loginHint,
  });
}
