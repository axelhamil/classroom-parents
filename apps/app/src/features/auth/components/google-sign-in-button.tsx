import googleG from "@packages/ui/assets/google-g.svg";
import { Button } from "@packages/ui/components/ui/button";
import { useTranslation } from "react-i18next";
import type { GoogleSignIn } from "../use-google-sign-in";

export interface GoogleSignInButtonProps {
  signIn: GoogleSignIn;
}

export function GoogleSignInButton({ signIn }: GoogleSignInButtonProps) {
  const { t } = useTranslation("auth");

  return (
    <Button variant="google" size="cta" disabled={signIn.pending} onClick={signIn.start}>
      <img src={googleG} alt="" />
      {signIn.pending ? t("login.pending") : t("login.google")}
    </Button>
  );
}
