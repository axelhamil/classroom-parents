import type { frCatalog } from "@packages/i18n";
import { PageFallback } from "@packages/ui/components/ui/page-fallback";
import { TextLink } from "@packages/ui/components/ui/text-link";

export interface NotFoundProps {
  copy: (typeof frCatalog)["common"]["notFound"];
}

export function NotFound({ copy }: NotFoundProps) {
  return (
    <PageFallback
      title={copy.title}
      description={copy.description}
      action={
        <TextLink href="/" className="w-fit">
          {copy.backHome}
        </TextLink>
      }
    />
  );
}
