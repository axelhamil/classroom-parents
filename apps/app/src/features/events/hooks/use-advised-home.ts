import { useMemo } from "react";
import { unitsFor } from "../../../shared/dashboard/dashboard-pack";
import type { Draft } from "../../../shared/dashboard/layout-commands";
import { useGridColumns } from "../../../shared/dashboard/use-grid-columns";
import type { AdviceContext } from "../advise-context";
import { adviseLayout } from "../advise-layout";
import { fitToRegistry } from "./use-home-sync";

const STEADY_CONTEXT: AdviceContext = {
  moment: "morning",
  children: "2-3",
  childIds: [],
  data: "normal",
  holiday: "none",
};

const NO_EMPTY_BLOCKS: ReadonlySet<string> = new Set();

export function useAdvisedHome(registry: readonly string[]): Draft {
  const units = unitsFor(useGridColumns());

  return useMemo(
    () => fitToRegistry(adviseLayout(STEADY_CONTEXT, units, NO_EMPTY_BLOCKS).blocks, registry),
    [units, registry],
  );
}
