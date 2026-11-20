import { FieldError } from "@packages/ui/components/ui/field";
import { Input } from "@packages/ui/components/ui/input";
import {
  SettingsGroup,
  SettingsRow,
  settingsRowDescriptionId,
} from "@packages/ui/components/ui/settings";
import { Skeleton, SkeletonGroup } from "@packages/ui/components/ui/skeleton";
import { Switch } from "@packages/ui/components/ui/switch";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useId, useState } from "react";
import { useTranslation } from "react-i18next";
import { z } from "zod";
import {
  type QuietHours,
  setQuietHoursMutationOptions,
} from "../../../shared/api/mutations/set-quiet-hours";
import { EVENTS_KEY } from "../../../shared/api/queries/events";
import { quietHoursQueryOptions } from "../../../shared/api/queries/quiet-hours";
import { QueryState } from "../../../shared/query/query-state";
import { useAutoSave } from "../hooks/use-auto-save";
import { SETTINGS_ANCHORS } from "../settings-search-index";

const TIME = z.iso.time({ precision: -1 });

const TYPING_PAUSE_MS = 700;

/** Mirrors DEFAULT_QUIET_HOURS in modules/alerts quiet-hours.vo.ts, which the api does not expose: change both together. */
const SERVER_DEFAULT_QUIET_TIMES = { start: "21:00", end: "07:00" } as const;

type QuietTimes = Pick<QuietHours, "start" | "end">;

export interface QuietHoursCardProps {
  userId: string;
}

export function QuietHoursCard({ userId }: QuietHoursCardProps) {
  const { t } = useTranslation("settings");
  const queryClient = useQueryClient();
  const query = quietHoursQueryOptions(userId);
  const quietHours = useQuery(query);
  const { save } = useAutoSave({
    mutation: setQuietHoursMutationOptions,
    queryKey: query.queryKey,
    apply: (_stored, next) => next,
    merge: (_stored, saved) => saved,
    restoreValue: (stored) => stored,
    failure: "setQuietHours",
    onSaved: () => void queryClient.invalidateQueries({ queryKey: EVENTS_KEY }),
  });

  return (
    <SettingsGroup id={SETTINGS_ANCHORS.quietHours} title={t("quietHours.title")}>
      <QueryState
        query={quietHours}
        skeleton={
          <SkeletonGroup label={t("quietHours.loading")}>
            <Skeleton className="h-10 w-full" />
          </SkeletonGroup>
        }
      >
        {(stored) => (
          <>
            <QuietHoursSwitch
              enabled={stored.enabled}
              onChange={(enabled) =>
                save(enabled ? { enabled, ...SERVER_DEFAULT_QUIET_TIMES } : { ...stored, enabled })
              }
            />
            {stored.enabled ? (
              <QuietTimes times={stored} onCommit={(times) => save({ enabled: true, ...times })} />
            ) : null}
          </>
        )}
      </QueryState>
    </SettingsGroup>
  );
}

interface QuietHoursSwitchProps {
  enabled: boolean;
  onChange: (enabled: boolean) => void;
}

function QuietHoursSwitch({ enabled, onChange }: QuietHoursSwitchProps) {
  const { t } = useTranslation("settings");
  const id = useId();

  return (
    <SettingsRow
      label={t("quietHours.enabled")}
      description={enabled ? t("quietHours.on") : t("quietHours.off")}
      controlId={id}
      control={
        <Switch
          id={id}
          checked={enabled}
          onCheckedChange={onChange}
          aria-describedby={settingsRowDescriptionId(id)}
        />
      }
    />
  );
}

interface QuietTimesProps {
  times: QuietTimes;
  onCommit: (times: QuietTimes) => void;
}

function QuietTimes({ times, onCommit }: QuietTimesProps) {
  const { t } = useTranslation(["settings", "errors"]);
  const [draft, setDraft] = useState<QuietTimes>(times);
  const [stored, setStored] = useState<QuietTimes>(times);
  if (stored.start !== times.start || stored.end !== times.end) {
    setStored(times);
    setDraft(times);
  }

  const complete = TIME.safeParse(draft.start).success && TIME.safeParse(draft.end).success;
  const same = complete && draft.start === draft.end;
  const changed = draft.start !== times.start || draft.end !== times.end;

  useEffect(() => {
    if (!complete || same || !changed) return;

    const pause = window.setTimeout(() => onCommit(draft), TYPING_PAUSE_MS);
    return () => window.clearTimeout(pause);
  }, [complete, same, changed, draft, onCommit]);

  return (
    <>
      <TimeRow
        label={t("quietHours.start")}
        value={draft.start}
        onChange={(start) => setDraft({ ...draft, start })}
      />
      <TimeRow
        label={t("quietHours.end")}
        value={draft.end}
        error={same ? t("errors:validation.quietHoursSame") : undefined}
        onChange={(end) => setDraft({ ...draft, end })}
      />
    </>
  );
}

interface TimeRowProps {
  label: string;
  value: string;
  error?: string;
  onChange: (value: string) => void;
}

function TimeRow({ label, value, error, onChange }: TimeRowProps) {
  const id = useId();
  const errorId = `${id}-error`;

  return (
    <SettingsRow
      label={label}
      controlId={id}
      control={
        <Input
          id={id}
          type="time"
          value={value}
          onChange={(event) => onChange(event.target.value)}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? errorId : undefined}
          className="w-32"
        />
      }
    >
      {error ? <FieldError id={errorId}>{error}</FieldError> : null}
    </SettingsRow>
  );
}
