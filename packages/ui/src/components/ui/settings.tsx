import { cva, type VariantProps } from "class-variance-authority";
import { Slot } from "radix-ui";
import type * as React from "react";
import { type ReactNode, useId } from "react";

import { cn } from "../../libs/utils";
import { Button } from "./button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "./collapsible";
import { ShowMoreIcon } from "./icons";
import { Label } from "./label";
import { UnderSectionHeading } from "./page-section";
import { SectionCard } from "./section-card";
import { TypographyH2 } from "./typography";

export interface SettingsLayoutProps {
  /** The list of sections, with the search above it. */
  sidebar: ReactNode;
  /** Whether a section is open: on a phone the list and the open section are two screens. */
  sectionOpen: boolean;
  children: ReactNode;
}

/**
 * Settings on two panes from a tablet up: the list of sections pinned on the left, the open
 * section on the right. On a phone, the list is one screen and the open section another, as in
 * the settings of a phone. Why two panes: one section at a time keeps the page short and the
 * reading order straight, and the list says where the parent is.
 */
function SettingsLayout({ sidebar, sectionOpen, children }: SettingsLayoutProps) {
  return (
    <div
      data-slot="settings-layout"
      className="grid items-start gap-6 md:grid-cols-[var(--settings-sidebar-width)_minmax(0,1fr)] md:gap-10"
    >
      <div
        data-slot="settings-sidebar"
        className={cn(
          "flex flex-col gap-4 md:sticky md:top-[calc(var(--app-bar-height)+1rem)]",
          sectionOpen && "max-md:hidden",
        )}
      >
        {sidebar}
      </div>
      <div data-slot="settings-pane" className={cn("min-w-0", !sectionOpen && "max-md:hidden")}>
        {children}
      </div>
    </div>
  );
}

/** The list of settings sections. `aria-label` is required: the page holds other navigations. */
function SettingsNav({
  className,
  children,
  ...props
}: React.ComponentProps<"nav"> & { "aria-label": string }) {
  return (
    <nav data-slot="settings-nav" className={className} {...props}>
      <ul className="flex flex-col max-md:divide-y max-md:rounded-surface max-md:border max-md:bg-card max-md:shadow-rest md:gap-0.5">
        {children}
      </ul>
    </nav>
  );
}

export interface SettingsNavLinkProps extends React.ComponentProps<"a"> {
  asChild?: boolean;
}

/**
 * One section of the list. The router marks the open one `aria-current="page"`, and that alone
 * draws it as current. On a phone the row opens the section, so it ends on a chevron.
 */
function SettingsNavLink({ asChild = false, className, ...props }: SettingsNavLinkProps) {
  const Comp = asChild ? Slot.Root : "a";

  return (
    <li>
      <Comp
        data-slot="settings-nav-link"
        className={cn(
          "group/settings-link flex min-h-control-lg items-center gap-3 px-block text-small text-foreground outline-none transition-colors focus-visible:ring focus-visible:ring-ring max-md:focus-visible:ring-inset md:min-h-control md:rounded-full md:px-3 md:text-muted-foreground md:hover:bg-accent/50 md:hover:text-foreground md:aria-[current=page]:bg-accent md:aria-[current=page]:text-primary [&_svg]:size-icon [&_svg]:shrink-0",
          className,
        )}
        {...props}
      />
    </li>
  );
}

/** The icon, label and phone chevron a `SettingsNavLink` lays out, kept apart so it can wrap a router link. */
function SettingsNavLinkContent({ icon, children }: { icon: ReactNode; children: ReactNode }) {
  return (
    <>
      {icon}
      <span className="flex-1">{children}</span>
      <ShowMoreIcon aria-hidden className="-rotate-90 text-muted-foreground md:hidden" />
    </>
  );
}

export interface SettingsSectionProps {
  title: string;
  /** The way back to the list of sections, shown on a phone only. */
  back: ReactNode;
  children: ReactNode;
}

/** The open section: its title as the page's `h2`, its groups below, each titled `h3`. */
function SettingsSection({ title, back, children }: SettingsSectionProps) {
  const titleId = useId();

  return (
    <section aria-labelledby={titleId} data-slot="settings-section" className="flex flex-col gap-6">
      <div className="flex flex-col items-start gap-2">
        <div className="md:hidden">{back}</div>
        <TypographyH2 id={titleId}>{title}</TypographyH2>
      </div>
      <UnderSectionHeading>{children}</UnderSectionHeading>
    </section>
  );
}

const settingsGroupVariants = cva(
  "scroll-mt-[calc(var(--app-bar-height)+1rem)] outline-none focus-visible:ring focus-visible:ring-ring",
  {
    variants: {
      width: {
        row: "max-w-settings",
        wide: "",
      },
    },
    defaultVariants: { width: "row" },
  },
);

export interface SettingsGroupProps extends VariantProps<typeof settingsGroupVariants> {
  /** The anchor the settings search lands on. */
  id: string;
  title: string;
  description?: ReactNode;
  tone?: "default" | "destructive";
  footer?: ReactNode;
  children?: ReactNode;
  "data-tour"?: string;
}

/**
 * A card of settings rows under one title. It can take the focus, so the search can land the
 * keyboard on the setting it found. Its rows stay readable (`width="row"`); a grid that needs
 * the room, the palettes, takes the pane's width (`width="wide"`).
 */
function SettingsGroup({
  id,
  title,
  description,
  tone = "default",
  width,
  footer,
  children,
  "data-tour": tourTarget,
}: SettingsGroupProps) {
  return (
    <SectionCard
      id={id}
      tabIndex={-1}
      title={title}
      description={description}
      tone={tone}
      footer={footer}
      data-tour={tourTarget}
      className={settingsGroupVariants({ width })}
      compactTitle
    >
      {children}
    </SectionCard>
  );
}

export interface SettingsRowProps {
  label: ReactNode;
  /** One line that says what the setting does, or what its current position does. */
  description?: ReactNode;
  /** The id of the control, so the label names it. Omit when the control carries its own name (a button). */
  controlId?: string;
  control?: ReactNode;
  /** What unfolds under the row: an alert, a sub-form, the long help. */
  children?: ReactNode;
}

/** The id a row's description takes, for the control's `aria-describedby`. */
function settingsRowDescriptionId(controlId: string): string {
  return `${controlId}-description`;
}

/**
 * One setting: its label and one line of help on the left, its control on the right. Below the
 * width where both fit, the control wraps under the label instead of squeezing it.
 */
function SettingsRow({ label, description, controlId, control, children }: SettingsRowProps) {
  return (
    <div data-slot="settings-row" className="flex flex-col gap-3 not-first:border-t not-first:pt-3">
      <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3">
        <div className="flex min-w-48 flex-1 flex-col gap-0.5">
          {controlId ? (
            <Label htmlFor={controlId}>{label}</Label>
          ) : (
            <span className="text-small font-medium">{label}</span>
          )}
          {description ? (
            <p
              id={controlId ? settingsRowDescriptionId(controlId) : undefined}
              className="text-small text-muted-foreground"
            >
              {description}
            </p>
          ) : null}
        </div>
        {control ? <div className="flex shrink-0 items-center gap-2">{control}</div> : null}
      </div>
      {children}
    </div>
  );
}

export interface SettingsMoreProps {
  /** The trigger's text, « En savoir plus ». */
  label: string;
  children: ReactNode;
}

/** The long help of a setting, folded under one line so the rows stay short. */
function SettingsMore({ label, children }: SettingsMoreProps) {
  return (
    <Collapsible data-slot="settings-more" className="flex flex-col items-start gap-2">
      <CollapsibleTrigger asChild>
        <Button
          type="button"
          variant="link"
          size="sm"
          className="group/more h-auto px-0 has-[>svg]:px-0"
        >
          {label}
          <ShowMoreIcon
            aria-hidden
            className="transition-transform duration-(--duration-fast) group-data-[state=open]/more:rotate-180"
          />
        </Button>
      </CollapsibleTrigger>
      <CollapsibleContent className="flex flex-col gap-2 text-small text-muted-foreground">
        {children}
      </CollapsibleContent>
    </Collapsible>
  );
}

/**
 * The one save button of a form that only makes sense complete. It sticks to the bottom of the
 * screen, above the phone's navigation, so it stays in reach while the form scrolls; the caller
 * shows it only when something changed.
 */
function SettingsSaveBar({ children }: { children: ReactNode }) {
  return (
    <div
      data-slot="settings-save-bar"
      className="sticky bottom-[calc(var(--nav-height)+0.75rem)] z-10 flex justify-end md:bottom-4"
    >
      <div className="rounded-full bg-card p-1 shadow-float">{children}</div>
    </div>
  );
}

export {
  SettingsGroup,
  SettingsLayout,
  SettingsMore,
  SettingsNav,
  SettingsNavLink,
  SettingsNavLinkContent,
  SettingsRow,
  SettingsSaveBar,
  SettingsSection,
  settingsRowDescriptionId,
};
