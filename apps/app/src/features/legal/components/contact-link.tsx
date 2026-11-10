import { TextLink } from "@packages/ui/components/ui/text-link";
import { env } from "../../../shared/env";

export function ContactLink() {
  return <TextLink href={`mailto:${env.VITE_CONTACT_EMAIL}`}>{env.VITE_CONTACT_EMAIL}</TextLink>;
}
