import { createFileRoute } from "@tanstack/react-router";
import { OnboardingStepper } from "./components/onboarding-stepper";
import { onboardingSearchSchema } from "./onboarding-steps";

export const Route = createFileRoute("/_protected/_shell/children/new")({
  validateSearch: onboardingSearchSchema,
  component: NewChildPage,
});

function NewChildPage() {
  const { user } = Route.useRouteContext();
  const search = Route.useSearch();
  const navigate = Route.useNavigate();

  return (
    <OnboardingStepper
      mode="another"
      userId={user.id}
      search={search}
      navigate={(next, replace) => void navigate({ search: next, replace })}
    />
  );
}
