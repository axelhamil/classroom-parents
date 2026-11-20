import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@packages/ui/components/ui/command";
import {
  SettingsNav,
  SettingsNavLink,
  SettingsNavLinkContent,
} from "@packages/ui/components/ui/settings";
import { Link, useNavigate } from "@tanstack/react-router";
import { type RefObject, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  SETTINGS_ANCHORS,
  SETTINGS_SEARCH,
  type SettingsSearchEntry,
} from "../settings-search-index";
import { SECTION_ICONS, SECTION_PATHS, SETTINGS_SECTIONS } from "../settings-sections";

export function SettingsSidebar() {
  return (
    <>
      <SettingsSearch />
      <SettingsSectionList />
    </>
  );
}

function SettingsSectionList() {
  const { t } = useTranslation("settings");

  return (
    <SettingsNav aria-label={t("sections.label")}>
      {SETTINGS_SECTIONS.map((id) => {
        const Icon = SECTION_ICONS[id];

        return (
          <SettingsNavLink key={id} asChild>
            <Link to={SECTION_PATHS[id]} data-tour={`settings-${id}`}>
              <SettingsNavLinkContent icon={<Icon aria-hidden />}>
                {t(`sections.${id}`)}
              </SettingsNavLinkContent>
            </Link>
          </SettingsNavLink>
        );
      })}
    </SettingsNav>
  );
}

function useFocusShortcut(input: RefObject<HTMLInputElement | null>) {
  useEffect(() => {
    const focusSearch = (event: KeyboardEvent) => {
      if (event.key.toLowerCase() !== "k" || !(event.metaKey || event.ctrlKey)) return;

      event.preventDefault();
      input.current?.focus();
    };
    window.addEventListener("keydown", focusSearch);

    return () => window.removeEventListener("keydown", focusSearch);
  }, [input]);
}

function SettingsSearch() {
  const { t } = useTranslation("settings");
  const navigate = useNavigate();
  const [query, setQuery] = useState("");
  const input = useRef<HTMLInputElement>(null);
  useFocusShortcut(input);

  const open = ({ section, anchor }: SettingsSearchEntry) => {
    const target = SETTINGS_ANCHORS[anchor];
    setQuery("");

    void navigate({ to: SECTION_PATHS[section], hash: target }).then(() =>
      document.getElementById(target)?.focus(),
    );
  };

  return (
    <Command label={t("search.label")}>
      <CommandInput
        ref={input}
        value={query}
        onValueChange={setQuery}
        placeholder={t("search.placeholder")}
        aria-label={t("search.label")}
      />
      <CommandList className={query ? undefined : "hidden"}>
        {query ? (
          <>
            <CommandEmpty>{t("search.empty")}</CommandEmpty>
            <CommandGroup heading={t("search.results")}>
              {SETTINGS_SEARCH.map((entry) => (
                <SearchResult key={entry.anchor} entry={entry} onOpen={open} />
              ))}
            </CommandGroup>
          </>
        ) : null}
      </CommandList>
    </Command>
  );
}

interface SearchResultProps {
  entry: SettingsSearchEntry;
  onOpen: (entry: SettingsSearchEntry) => void;
}

function SearchResult({ entry, onOpen }: SearchResultProps) {
  const { t } = useTranslation("settings");
  const Icon = SECTION_ICONS[entry.section];
  const section = t(`sections.${entry.section}`);

  return (
    <CommandItem
      value={t(entry.label)}
      keywords={[section, t(`search.keywords.${entry.anchor}`)]}
      onSelect={() => onOpen(entry)}
    >
      <Icon aria-hidden />
      <span className="flex-1">{t(entry.label)}</span>
      <span className="text-muted-foreground">{section}</span>
    </CommandItem>
  );
}
