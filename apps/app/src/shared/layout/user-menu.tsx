import { Avatar, AvatarFallback, AvatarImage } from "@packages/ui/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@packages/ui/components/ui/dropdown-menu";
import { IconButton } from "@packages/ui/components/ui/icon-button";
import { TypographyMuted } from "@packages/ui/components/ui/typography";
import { initialsOf } from "@packages/ui/libs/initials.js";
import { Link } from "@tanstack/react-router";
import { LogOut, Settings } from "lucide-react";
import { useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { SignOutDialog } from "../auth/sign-out-dialog";
import { useSignOut } from "../auth/use-sign-out";
import { ThemeRadioItems } from "../components/theme-toggle";

export interface ShellUser {
  name: string;
  email: string;
  image?: string | null;
}

export interface UserMenuProps {
  user: ShellUser;
  className?: string;
}

export function UserMenu({ user, className }: UserMenuProps) {
  const { t } = useTranslation("common");
  const signOut = useSignOut();
  const [confirmingSignOut, setConfirmingSignOut] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const initials = initialsOf(user.name || user.email);

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <IconButton
            ref={triggerRef}
            variant="ghost"
            size="icon-lg"
            label={t("userMenu.openMenu")}
            accessibleName={t("userMenu.openMenuWithInitials", { initials })}
            className={className}
          >
            <Avatar>
              {user.image && <AvatarImage src={user.image} alt="" referrerPolicy="no-referrer" />}
              <AvatarFallback>{initials}</AvatarFallback>
            </Avatar>
          </IconButton>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-64">
          <DropdownMenuLabel className="flex min-w-0 flex-col">
            <span className="wrap-anywhere">{user.name}</span>
            <TypographyMuted className="wrap-anywhere">{user.email}</TypographyMuted>
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuItem asChild>
            <Link to="/settings">
              <Settings />
              {t("nav.settings")}
            </Link>
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <ThemeRadioItems origin={triggerRef} />
          <DropdownMenuSeparator />
          <DropdownMenuItem
            disabled={signOut.isPending}
            onSelect={() => setConfirmingSignOut(true)}
          >
            <LogOut />
            {signOut.isPending ? t("userMenu.signingOut") : t("userMenu.signOut")}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <SignOutDialog
        open={confirmingSignOut}
        onOpenChange={setConfirmingSignOut}
        onConfirm={() => signOut.mutate()}
        onCloseAutoFocus={(event) => {
          event.preventDefault();
          triggerRef.current?.focus();
        }}
      />
    </>
  );
}
