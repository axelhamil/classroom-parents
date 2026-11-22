import { useMemo } from "react";
import { useGridColumns } from "../../../shared/dashboard/use-grid-columns";
import type { AdviceSnapshot } from "../advise-context";
import { type AdvisedHome, advisedHomeOf } from "../home-layout-draft";

export function useAdvisedHome(
  registry: readonly string[],
  snapshot: AdviceSnapshot | null,
): AdvisedHome | null {
  const columns = useGridColumns();

  return useMemo(() => {
    if (!snapshot) return null;

    return advisedHomeOf(snapshot, columns, registry);
  }, [columns, registry, snapshot]);
}
