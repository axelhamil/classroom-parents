import { CLASSROOM_SCOPES } from "@packages/classroom-scopes";
import type { frCatalog } from "@packages/i18n";
import { Badge } from "@packages/ui/components/ui/badge";
import { Item, ItemContent, ItemMedia } from "@packages/ui/components/ui/item";
import { PageHeader } from "@packages/ui/components/ui/page-header";
import { SectionCard } from "@packages/ui/components/ui/section-card";
import { TextLink } from "@packages/ui/components/ui/text-link";
import {
  TypographyInline,
  TypographyList,
  TypographyMuted,
  TypographyP,
} from "@packages/ui/components/ui/typography";
import { BanIcon } from "lucide-react";
import type { ReactNode } from "react";

type SchoolsCopy = (typeof frCatalog)["site"]["schools"];
type ClassroomScope = (typeof CLASSROOM_SCOPES)[number];

export const SCHOOL_GUIDE_PATH = "/ecoles";

const ADMIN_STEPS = ["console", "path", "manage", "search", "scope", "access"] as const;

const SCOPE_LABELS = {
  "https://www.googleapis.com/auth/classroom.courses.readonly": "courses",
  "https://www.googleapis.com/auth/classroom.announcements.readonly": "announcements",
  "https://www.googleapis.com/auth/classroom.student-submissions.me.readonly": "submissions",
} as const satisfies Record<ClassroomScope, keyof SchoolsCopy["scopes"]>;

const NEVER = ["write", "keep", "ads", "erase"] as const;

export interface SchoolAdminGuideProps {
  copy: SchoolsCopy;
  privacyUrl: string;
  subProcessorsUrl: string;
  contactEmail: string;
  children: ReactNode;
}

export function SchoolAdminGuide({
  copy,
  privacyUrl,
  subProcessorsUrl,
  contactEmail,
  children,
}: SchoolAdminGuideProps) {
  return (
    <>
      <PageHeader
        eyebrow={<TypographyMuted>{copy.eyebrow}</TypographyMuted>}
        title={copy.title}
        description={copy.lead}
      />

      <SectionCard title={copy.steps.title}>
        <ol className="flex flex-col gap-2">
          {ADMIN_STEPS.map((step, index) => (
            <li key={step}>
              <Item variant="muted">
                <ItemMedia>
                  <Badge variant="secondary">{index + 1}</Badge>
                </ItemMedia>
                <ItemContent>
                  <TypographyP>{copy.steps[step]}</TypographyP>
                </ItemContent>
              </Item>
            </li>
          ))}
        </ol>
      </SectionCard>

      <SectionCard title={copy.clientId.label}>{children}</SectionCard>

      <SectionCard title={copy.scopes.title}>
        <TypographyList>
          {CLASSROOM_SCOPES.map((scope) => (
            <li key={scope} className="flex flex-col gap-1">
              {copy.scopes[SCOPE_LABELS[scope]]}
              <TypographyInline font="mono" size="xs" className="wrap-anywhere">
                {scope}
              </TypographyInline>
            </li>
          ))}
        </TypographyList>
      </SectionCard>

      <SectionCard title={copy.delay.title}>
        <TypographyP>{copy.delay.body}</TypographyP>
        <TypographyMuted>{copy.delay.classroom}</TypographyMuted>
      </SectionCard>

      <SectionCard title={copy.reads.title}>
        <TypographyP>{copy.reads.body}</TypographyP>
      </SectionCard>

      <SectionCard title={copy.never.title}>
        <TypographyList>
          {NEVER.map((key) => (
            <li key={key} className="flex items-start gap-2">
              <BanIcon aria-hidden />
              {copy.never[key]}
            </li>
          ))}
        </TypographyList>
      </SectionCard>

      <SectionCard title={copy.data.title}>
        <TypographyP>{copy.data.body}</TypographyP>
        <div className="flex flex-wrap gap-4">
          <TextLink href={subProcessorsUrl}>{copy.data.subProcessors}</TextLink>
          <TextLink href={privacyUrl}>{copy.data.privacy}</TextLink>
        </div>
      </SectionCard>

      <SectionCard title={copy.contact.title}>
        <TypographyP>
          {copy.contact.body} <TextLink href={`mailto:${contactEmail}`}>{contactEmail}</TextLink>
        </TypographyP>
      </SectionCard>
    </>
  );
}
