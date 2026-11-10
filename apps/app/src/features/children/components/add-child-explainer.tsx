import { Button } from "@packages/ui/components/ui/button";
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@packages/ui/components/ui/card";
import { ListRow, ListRowMedia } from "@packages/ui/components/ui/list-row";
import { TypographyMuted } from "@packages/ui/components/ui/typography";
import { BookOpen, Megaphone, PenOff } from "lucide-react";
import { useTranslation } from "react-i18next";

const READ_ONLY_ITEMS = [
  { key: "new.readOnlyCourses", icon: BookOpen },
  { key: "new.readOnlyAnnouncements", icon: Megaphone },
  { key: "new.readOnlyNever", icon: PenOff },
] as const;

export interface AddChildExplainerProps {
  onStart: () => void;
  starting: boolean;
}

export function AddChildExplainer({ onStart, starting }: AddChildExplainerProps) {
  const { t } = useTranslation("children");

  return (
    <Card>
      <CardHeader>
        <CardTitle asChild>
          <h2>{t("new.readOnlyTitle")}</h2>
        </CardTitle>
      </CardHeader>

      <CardContent>
        <ul className="flex flex-col">
          {READ_ONLY_ITEMS.map(({ key, icon: Icon }) => (
            <ListRow key={key} variant="plain">
              <ListRowMedia>
                <Icon aria-hidden />
                {t(key)}
              </ListRowMedia>
            </ListRow>
          ))}
        </ul>
      </CardContent>

      <CardFooter className="flex flex-col items-stretch gap-3">
        <Button size="lg" disabled={starting} onClick={onStart}>
          {starting ? t("new.starting") : t("new.start")}
        </Button>
        <TypographyMuted>{t("new.hint")}</TypographyMuted>
      </CardFooter>
    </Card>
  );
}
