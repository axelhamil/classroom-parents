import { useTranslation } from "react-i18next";
import { ActionAlert } from "../components/action-alert";
import { classifySchoolError, isSchoolBlock } from "./school-error";
import { SchoolProcedure } from "./school-procedure";

export interface LinkRefusalProps {
  error: string | undefined;
  errorDescription: string | undefined;
}

function oauthParams(error: string | undefined, errorDescription: string | undefined) {
  const params = new URLSearchParams();
  if (error !== undefined) params.set("error", error);
  if (errorDescription !== undefined) params.set("error_description", errorDescription);

  return params;
}

export function LinkRefusal({ error, errorDescription }: LinkRefusalProps) {
  const { t } = useTranslation("children");
  const kind = classifySchoolError(oauthParams(error, errorDescription));

  if (isSchoolBlock(kind)) return <SchoolProcedure kind={kind} />;

  return (
    <ActionAlert
      tone="destructive"
      title={t("linkError.description")}
      description={t(`linkError.kinds.${kind}`)}
    />
  );
}
