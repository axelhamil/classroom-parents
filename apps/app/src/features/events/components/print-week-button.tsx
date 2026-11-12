import { Button } from "@packages/ui/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@packages/ui/components/ui/tooltip";
import { Link } from "@tanstack/react-router";
import { PrinterIcon } from "lucide-react";
import { useTranslation } from "react-i18next";

export function PrintWeekButton() {
  const { t } = useTranslation("events");

  return (
    <Tooltip>
      <Button asChild variant="outline">
        <TooltipTrigger asChild>
          <Link to="/week/print">
            <PrinterIcon aria-hidden />
            {t("print.action")}
          </Link>
        </TooltipTrigger>
      </Button>
      <TooltipContent>{t("print.hint")}</TooltipContent>
    </Tooltip>
  );
}
