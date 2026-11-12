import { Avatar, AvatarFallback, AvatarImage } from "@packages/ui/components/ui/avatar";
import { Button } from "@packages/ui/components/ui/button";
import { Item, ItemContent, ItemMedia, ItemTitle } from "@packages/ui/components/ui/item";
import { SectionCard } from "@packages/ui/components/ui/section-card";
import { TypographyMuted } from "@packages/ui/components/ui/typography";
import { initialsOf } from "@packages/ui/libs/initials.js";
import { LogOut } from "lucide-react";
import { useTranslation } from "react-i18next";
import { SignOutDialog } from "../../../shared/auth/sign-out-dialog";
import { useSignOut } from "../../../shared/auth/use-sign-out";
import type { ShellUser } from "../../../shared/layout/user-menu";

export interface AccountCardProps {
  user: ShellUser;
}

export function AccountCard({ user }: AccountCardProps) {
  const { t } = useTranslation("settings");
  const signOut = useSignOut();

  return (
    <SectionCard
      title={t("account.title")}
      description={t("account.description")}
      footer={
        <SignOutDialog
          trigger={
            <Button type="button" variant="outline" disabled={signOut.isPending}>
              <LogOut />
              {signOut.isPending ? t("signOut.pending") : t("signOut.action")}
            </Button>
          }
          onConfirm={() => signOut.mutate()}
        />
      }
    >
      <Item variant="muted">
        <ItemMedia>
          <Avatar size="lg">
            {user.image ? (
              <AvatarImage src={user.image} alt="" referrerPolicy="no-referrer" />
            ) : null}
            <AvatarFallback>{initialsOf(user.name || user.email)}</AvatarFallback>
          </Avatar>
        </ItemMedia>
        <ItemContent className="min-w-0">
          <ItemTitle className="wrap-anywhere">{user.name}</ItemTitle>
          <TypographyMuted className="wrap-anywhere">{user.email}</TypographyMuted>
        </ItemContent>
      </Item>
      <TypographyMuted>{t("signOut.description")}</TypographyMuted>
    </SectionCard>
  );
}
