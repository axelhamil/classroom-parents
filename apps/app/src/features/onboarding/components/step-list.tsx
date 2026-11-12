import { Hint } from "@packages/ui/components/ui/hint";
import {
  Item,
  ItemContent,
  ItemDescription,
  ItemGroup,
  ItemMedia,
  ItemTitle,
} from "@packages/ui/components/ui/item";
import { Spinner } from "@packages/ui/components/ui/spinner";
import type { LucideIcon } from "lucide-react";

export interface StepListEntry {
  id: string;
  icon: LucideIcon;
  title: string;
  detail?: string;
  hint?: string;
  busy?: boolean;
}

export interface StepListProps {
  entries: readonly StepListEntry[];
  label?: string;
}

export function StepList({ entries, label }: StepListProps) {
  return (
    <ItemGroup aria-label={label}>
      {entries.map(({ id, icon: Icon, title, detail, hint, busy = false }) => (
        <Item key={id} role="listitem" size="sm">
          <ItemMedia variant="icon">
            {busy ? <Spinner aria-hidden label={title} /> : <Icon aria-hidden />}
          </ItemMedia>
          <ItemContent>
            <ItemTitle>{hint ? <Hint text={hint}>{title}</Hint> : title}</ItemTitle>
            {detail && <ItemDescription>{detail}</ItemDescription>}
          </ItemContent>
        </Item>
      ))}
    </ItemGroup>
  );
}
