import { AppBar } from "@packages/ui/components/ui/app-bar";
import { BrandLink, BrandMark } from "@packages/ui/components/ui/brand-link";
import { createFileRoute, Link } from "@tanstack/react-router";
import { CalendarHeart } from "lucide-react";
import { useTranslation } from "react-i18next";
import { UserMenu } from "../../shared/layout/user-menu";
import { useAppUserStream } from "../../shared/stream/use-app-user-stream";
import { OnboardingStepper } from "./components/onboarding-stepper";
import { onboardingSearchSchema } from "./onboarding-steps";

export const Route = createFileRoute("/_protected/onboarding")({
  validateSearch: onboardingSearchSchema,
  component: OnboardingPage,
});

function OnboardingPage() {
  const { t } = useTranslation("common");
  const { user } = Route.useRouteContext();
  const search = Route.useSearch();
  const navigate = Route.useNavigate();
  useAppUserStream();

  return (
    <div className="flex min-h-dvh flex-col">
      <AppBar className="justify-between">
        <BrandLink asChild>
          <Link to="/">
            <BrandMark>
              <CalendarHeart />
            </BrandMark>
            {t("brand")}
          </Link>
        </BrandLink>
        <UserMenu user={user} />
      </AppBar>
      <OnboardingStepper
        mode="first"
        userId={user.id}
        search={search}
        navigate={(next, replace) => void navigate({ search: next, replace })}
      />
    </div>
  );
}
