import { Avatar, AvatarFallback, AvatarImage } from "@packages/ui/components/ui/avatar";
import { Button } from "@packages/ui/components/ui/button";
import { SignOutIcon } from "@packages/ui/components/ui/icons";
import { Item, ItemContent, ItemMedia, ItemTitle } from "@packages/ui/components/ui/item";
import { SettingsGroup, SettingsRow } from "@packages/ui/components/ui/settings";
import { TypographyMuted } from "@packages/ui/components/ui/typography";
import { initialsOf } from "@packages/ui/libs/initials.js";
import { useTranslation } from "react-i18next";
import { SignOutDialog } from "../../../shared/auth/sign-out-dialog";
import { useSignOut } from "../../../shared/auth/use-sign-out";
import type { ShellUser } from "../../../shared/layout/user-menu";
import { SETTINGS_ANCHORS } from "../settings-search-index";

export interface AccountCardProps {
  user: ShellUser;
}

export function AccountCard({ user }: AccountCardProps) {
  const { t } = useTranslation("settings");
  const signOut = useSignOut();

  return (
    <SettingsGroup
      id={SETTINGS_ANCHORS.account}
      title={t("account.title")}
      description={t("account.description")}
    >
      <Item size="sm">
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
      <SettingsRow
        label={t("signOut.title")}
        description={t("signOut.description")}
        control={
          <SignOutDialog
            trigger={
              <Button type="button" variant="outline" size="sm" disabled={signOut.isPending}>
                <SignOutIcon />
                {signOut.isPending ? t("signOut.pending") : t("signOut.action")}
              </Button>
            }
            onConfirm={() => signOut.mutate()}
          />
        }
      />
    </SettingsGroup>
  );
}
