import { toastError } from "@packages/web-kit/api/errors/toast";
import { errorFallback } from "@packages/web-kit/i18n/get-errors-t";
import { userStorageKey, useStoredValue } from "@packages/web-kit/storage/use-stored-value";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { z } from "zod";
import { Route as ProtectedRoute } from "../../../router/_protected";
import type { BlockSizeChoice } from "../../../shared/dashboard/dashboard-block";
import { BLOCK_SIZES, unitsFor } from "../../../shared/dashboard/dashboard-pack";
import { type LayoutBlock, snapSize } from "../../../shared/dashboard/layout-migration";
import { useGridColumns } from "../../../shared/dashboard/use-grid-columns";
import type { AdviceContext } from "../advise-context";
import { adviseLayout } from "../advise-layout";
import { saveHomeLayoutMutationOptions } from "../api/home.mutations";
import { HOME_LAYOUT_KEY, type HomeLayoutReply, homeLayoutQueryOptions } from "../api/home.queries";

const STORED_LAYOUT_NAME = "home:layout:v2";

const storedLayoutSchema = z
  .object({
    v: z.literal(2),
    blocks: z.array(z.object({ id: z.string(), size: z.enum(BLOCK_SIZES) })).nullable(),
    revision: z.number().int().nonnegative(),
  })
  .nullable();

const STEADY_CONTEXT: AdviceContext = {
  moment: "morning",
  children: "2-3",
  childIds: [],
  data: "normal",
  holiday: "none",
};

const NO_EMPTY_BLOCKS: ReadonlySet<string> = new Set();

export interface SizedBlock {
  id: string;
  sizes: BlockSizeChoice;
}

export interface HomeLayout {
  order: LayoutBlock[];
  advised: boolean;
  change: (next: LayoutBlock[]) => void;
  reset: () => void;
}

/**
 * The parent's home: the layout they arranged, or the advised one while they arranged nothing.
 * It is drawn at once from the copy kept on this device, then from the server; a change shows at
 * once and is saved against the revision it was made on, an error putting the server copy back.
 */
export function useHomeLayout(registry: readonly SizedBlock[]): HomeLayout {
  const units = unitsFor(useGridColumns());
  const query = useQuery(homeLayoutQueryOptions);
  const stored = useStoredCopy(query.data);
  const save = useSaveLayout();
  const chosen = query.data ? query.data.blocks : stored?.blocks;
  const blocks = chosen ?? adviseLayout(STEADY_CONTEXT, units, NO_EMPTY_BLOCKS).blocks;

  return {
    order: fitToRegistry(blocks, registry),
    advised: !chosen,
    change: save,
    reset: () => save(null),
  };
}

function useStoredCopy(reply: HomeLayoutReply | undefined) {
  const { user } = ProtectedRoute.useRouteContext();
  const [stored, setStored] = useStoredValue(
    userStorageKey(user.id, STORED_LAYOUT_NAME),
    storedLayoutSchema,
    null,
  );

  useEffect(() => {
    if (reply) setStored({ v: 2, blocks: reply.blocks, revision: reply.revision });
  }, [reply, setStored]);

  return stored;
}

function useSaveLayout(): (blocks: LayoutBlock[] | null) => void {
  const queryClient = useQueryClient();
  const { mutate } = useMutation({
    ...saveHomeLayoutMutationOptions,
    onMutate: async (body) => {
      await queryClient.cancelQueries({ queryKey: HOME_LAYOUT_KEY });
      const previous = queryClient.getQueryData<HomeLayoutReply>(HOME_LAYOUT_KEY);
      queryClient.setQueryData<HomeLayoutReply>(HOME_LAYOUT_KEY, {
        blocks: body.blocks,
        revision: body.baseRevision,
      });

      return { previous };
    },
    onSuccess: (saved) => queryClient.setQueryData(HOME_LAYOUT_KEY, saved),
    onError: (error, _body, context) => {
      queryClient.setQueryData(HOME_LAYOUT_KEY, context?.previous);
      toastError(error, errorFallback("saveHomeLayout"));
      void queryClient.invalidateQueries({ queryKey: HOME_LAYOUT_KEY });
    },
  });

  return (blocks) =>
    mutate({
      blocks,
      baseRevision: queryClient.getQueryData<HomeLayoutReply>(HOME_LAYOUT_KEY)?.revision ?? 0,
    });
}

function fitToRegistry(
  blocks: readonly LayoutBlock[],
  registry: readonly SizedBlock[],
): LayoutBlock[] {
  const known = new Map(registry.map(({ id, sizes }) => [id, sizes.allowed]));
  const kept: LayoutBlock[] = [];

  for (const { id, size } of blocks) {
    const allowed = known.get(id);
    if (!allowed || kept.some((block) => block.id === id)) continue;

    kept.push({ id, size: snapSize(size, allowed) });
  }

  return kept;
}
