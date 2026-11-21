import { useMemo } from "react";
import { unitsFor } from "../../../shared/dashboard/dashboard-pack";
import type { Draft } from "../../../shared/dashboard/layout-commands";
import { useGridColumns } from "../../../shared/dashboard/use-grid-columns";
import type { AdviceSnapshot } from "../advise-context";
import { adviseLayout } from "../advise-layout";
import { fitToRegistry } from "./use-home-sync";

export interface AdvisedHome {
  blocks: Draft;
  heroId: string;
}

export function useAdvisedHome(
  registry: readonly string[],
  snapshot: AdviceSnapshot | null,
): AdvisedHome | null {
  const units = unitsFor(useGridColumns());

  return useMemo(() => {
    if (!snapshot) return null;

    const { heroId, blocks } = adviseLayout(snapshot.context, units, snapshot.emptyBlocks);

    return { heroId, blocks: fitToRegistry(blocks, registry) };
  }, [units, registry, snapshot]);
}
