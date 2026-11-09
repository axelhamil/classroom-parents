import { Alert, AlertDescription } from "@packages/ui/components/ui/alert";
import { Languages } from "lucide-react";
import { useTranslation } from "react-i18next";

export function UntranslatedBodyBanner() {
  const { t } = useTranslation("common");

  return (
    <Alert>
      <Languages />
      <AlertDescription>{t("legal.policies.unavailableBanner")}</AlertDescription>
    </Alert>
  );
}
