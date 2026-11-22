import { Button } from "@packages/ui/components/ui/button";
import {
  FirstStepsIcon,
  StepDoneIcon,
  StepPendingIcon,
  WarningIcon,
} from "@packages/ui/components/ui/icons";
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemGroup,
  ItemMedia,
  ItemTitle,
} from "@packages/ui/components/ui/item";
import { Progress } from "@packages/ui/components/ui/progress";
import { Spinner } from "@packages/ui/components/ui/spinner";
import { Link } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import type { ChildDto } from "../../../../shared/api/queries/children";
import { usePushLive } from "../../../../shared/api/queries/push-status";
import { analysisState } from "../../../../shared/children/first-sync";
import type { HomeBlockDefinition, HomeBlockProps } from "../../home-block";
import { BlockPanel, heroDateOf } from "./block-panel";

type FirstStepId = "link" | "read" | "reminders";

type FirstStepState = "done" | "todo" | "reading" | "check" | "waiting";

type FirstStepAction = "linkChild" | "seeChildren" | "openReminders";

const ACTION_TARGETS = {
  linkChild: "/children/new",
  seeChildren: "/children",
  openReminders: "/settings/notifications",
} as const satisfies Record<FirstStepAction, string>;

interface Reading {
  state: FirstStepState;
  done: number;
  total: number;
}

interface FirstStep {
  id: FirstStepId;
  state: FirstStepState;
  action?: FirstStepAction;
}

const REMINDERS_TO_DO: FirstStep = { id: "reminders", state: "todo", action: "openReminders" };

function WelcomeBlock({ title, family, clock, userId }: HomeBlockProps) {
  const { t } = useTranslation("home");
  const remindersOn = usePushLive(userId);
  const reading = readingOf(family);
  const steps: readonly FirstStep[] = [
    linkStep(family),
    readStep(reading),
    remindersOn ? { id: "reminders", state: "done" } : REMINDERS_TO_DO,
  ];

  return (
    <BlockPanel title={title} icon={FirstStepsIcon} heroDate={heroDateOf(clock.today)} fits>
      <ItemGroup aria-label={t("blocks.welcome.label")}>
        {steps.map((step) => (
          <FirstStepRow key={step.id} step={step} reading={reading} />
        ))}
      </ItemGroup>
    </BlockPanel>
  );
}

function linkStep(family: readonly ChildDto[]): FirstStep {
  if (family.length > 0) return { id: "link", state: "done" };

  return { id: "link", state: "todo", action: "linkChild" };
}

function readStep({ state }: Reading): FirstStep {
  if (state === "check") return { id: "read", state, action: "seeChildren" };

  return { id: "read", state };
}

interface FirstStepRowProps {
  step: FirstStep;
  reading: Reading;
}

function FirstStepRow({ step, reading }: FirstStepRowProps) {
  const { t } = useTranslation("home");
  const title = t(`blocks.welcome.steps.${step.id}`);
  const state =
    step.state === "reading"
      ? t("blocks.welcome.state.reading", { done: reading.done, total: reading.total })
      : t(`blocks.welcome.state.${step.state}`);

  return (
    <Item role="listitem" size="sm">
      <ItemMedia variant="icon">
        <FirstStepMark state={step.state} label={title} />
      </ItemMedia>
      <ItemContent>
        <ItemTitle>{title}</ItemTitle>
        <ItemDescription>{state}</ItemDescription>
        {step.state === "reading" && (
          <Progress value={reading.done} max={reading.total} tone="ink" aria-label={state} />
        )}
      </ItemContent>
      {step.action && (
        <ItemActions>
          <Button asChild size="sm" variant="outline">
            <Link to={ACTION_TARGETS[step.action]}>
              {t(`blocks.welcome.actions.${step.action}`)}
            </Link>
          </Button>
        </ItemActions>
      )}
    </Item>
  );
}

interface FirstStepMarkProps {
  state: FirstStepState;
  label: string;
}

function FirstStepMark({ state, label }: FirstStepMarkProps) {
  if (state === "reading") return <Spinner aria-hidden label={label} />;
  if (state === "done") return <StepDoneIcon aria-hidden />;
  if (state === "check") return <WarningIcon aria-hidden />;

  return <StepPendingIcon aria-hidden />;
}

function readingOf(family: readonly ChildDto[]): Reading {
  const states = family.map((child) => analysisState(child, false));
  const done = states.filter((state) => state === "ready").length;
  const total = family.length;

  if (total === 0) return { state: "waiting", done, total };
  if (done === total) return { state: "done", done, total };
  if (states.includes("reading")) return { state: "reading", done, total };

  return { state: "check", done, total };
}

export const welcomeBlock: HomeBlockDefinition = {
  id: "welcome",
  titleKey: "blocks.welcome.title",
  descriptionKey: "blocks.welcome.description",
  icon: FirstStepsIcon,
  Component: WelcomeBlock,
};
