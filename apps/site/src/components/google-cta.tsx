import googleG from "@packages/ui/assets/google-g.svg?url";
import { Button } from "@packages/ui/components/ui/button";

export interface GoogleCtaProps {
  href: string;
  label: string;
}

export function GoogleCta({ href, label }: GoogleCtaProps) {
  return (
    <Button variant="google" size="cta" asChild>
      <a href={href}>
        <img src={googleG} alt="" width={24} height={24} />
        {label}
      </a>
    </Button>
  );
}
