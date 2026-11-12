import { z } from "zod";
import type { ChildDto } from "../../shared/api/queries/children";

export const ONBOARDING_STEPS = [
  "welcome",
  "prepare",
  "connect",
  "name",
  "analysis",
  "reminders",
  "notifications",
  "done",
] as const;

export type OnboardingStep = (typeof ONBOARDING_STEPS)[number];
export type OnboardingMode = "first" | "another";

const MODE_STEPS: Record<OnboardingMode, readonly OnboardingStep[]> = {
  first: ONBOARDING_STEPS,
  another: ["prepare", "connect", "name", "analysis"],
};

const BEFORE_LINK: readonly OnboardingStep[] = ["welcome", "prepare", "connect"];
const AFTER_FIRST_SYNC: readonly OnboardingStep[] = ["reminders", "notifications", "done"];
const NO_WAY_BACK: readonly OnboardingStep[] = ["name"];

export const onboardingSearchSchema = z.object({
  step: z.enum(ONBOARDING_STEPS).optional().catch(undefined),
  linked: z.coerce.number().int().optional().catch(undefined),
  child: z.uuid().optional().catch(undefined),
  error: z.string().optional().catch(undefined),
  error_description: z.string().optional().catch(undefined),
});

export type OnboardingSearch = z.infer<typeof onboardingSearchSchema>;

export function isFirstSyncDone(child: ChildDto): boolean {
  return child.status === "connected" && !child.syncing && Boolean(child.lastSyncedAt);
}

export function linkWasRefused(search: OnboardingSearch): boolean {
  return search.error !== undefined || search.error_description !== undefined;
}

export interface ResolvedStep {
  step: OnboardingStep;
  child: ChildDto | undefined;
}

export function resolveOnboardingStep(
  mode: OnboardingMode,
  search: OnboardingSearch,
  family: readonly ChildDto[],
): ResolvedStep {
  const steps = MODE_STEPS[mode];
  const child = family.find((candidate) => candidate.id === search.child);

  if (linkWasRefused(search) || (search.linked === 1 && !child)) {
    return { step: "connect", child: undefined };
  }

  if (child) {
    const asked = search.step;
    const wanted = asked && steps.includes(asked) && !BEFORE_LINK.includes(asked) ? asked : "name";
    const step = AFTER_FIRST_SYNC.includes(wanted) && !isFirstSyncDone(child) ? "analysis" : wanted;

    return { step, child };
  }

  const asked = search.step;
  const step = asked && steps.includes(asked) && BEFORE_LINK.includes(asked) ? asked : steps[0];

  return { step: step ?? "prepare", child: undefined };
}

export interface StepPosition {
  current: number;
  total: number;
  previous: OnboardingStep | undefined;
}

export function stepPosition(mode: OnboardingMode, step: OnboardingStep): StepPosition {
  const steps = MODE_STEPS[mode];
  const index = Math.max(steps.indexOf(step), 0);
  const previous = NO_WAY_BACK.includes(step) ? undefined : steps[index - 1];

  return { current: index + 1, total: steps.length, previous };
}
