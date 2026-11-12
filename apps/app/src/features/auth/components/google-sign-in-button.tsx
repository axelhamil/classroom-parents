import googleG from "@packages/ui/assets/google-g.svg";
import { Button } from "@packages/ui/components/ui/button";

export interface GoogleSignInButtonProps {
  label: string;
  pendingLabel: string;
  pending: boolean;
  onSignIn: () => void;
}

export function GoogleSignInButton({
  label,
  pendingLabel,
  pending,
  onSignIn,
}: GoogleSignInButtonProps) {
  return (
    <Button variant="google" size="lg" disabled={pending} onClick={onSignIn}>
      <img src={googleG} alt="" />
      {pending ? pendingLabel : label}
    </Button>
  );
}
