import { autoScrollForElements } from '@atlaskit/pragmatic-drag-and-drop-auto-scroll/element';
import { type Edge } from '@atlaskit/pragmatic-drag-and-drop-hitbox/closest-edge';
import {
  draggable,
  dropTargetForElements,
  monitorForElements,
} from '@atlaskit/pragmatic-drag-and-drop/element/adapter';
import { type Positioner } from 'masonic';
import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface SortableItemData {
  id: string;
  index: number;
  instanceId: symbol;
}

export interface DragState {
  isDragging: boolean;
  draggingId: string | null;
  dropIndicatorIndex: number | null;
}

interface SortableGridContextValue {
  instanceId: symbol;
  dragState: DragState;
}

interface SortableGridProviderProps {
  itemIds: string[];
  onReorder: (orderedIds: string[]) => Promise<void>;
  scrollContainerRef: React.RefObject<HTMLElement | null>;
  /** Ref to the masonic positioner — needed for hit-testing during drag. */
  positionerRef: React.RefObject<Positioner | null>;
  /** The grid container DOM element (masonic's containerRef target).
   * Passed as state so the drop-target effect re-runs when the element
   * mounts (ref identity alone doesn't trigger effect re-runs). */
  gridElement: HTMLElement | null;
  children: ReactNode;
}

// ---------------------------------------------------------------------------
// Context
// ---------------------------------------------------------------------------

const SortableGridContext = createContext<SortableGridContextValue | null>(null);

function useSortableGridContext(): SortableGridContextValue | null {
  return useContext(SortableGridContext);
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getItemData(item: SortableItemData) {
  return { id: item.id, index: item.index, instanceId: item.instanceId };
}

function isItemData(data: unknown): data is SortableItemData {
  if (typeof data !== 'object' || data === null) {
    return false;
  }
  const record = data as unknown as Record<string, unknown>;
  return 'id' in record && 'instanceId' in record && typeof record.instanceId === 'symbol';
}

function computeDestination(
  startIndex: number,
  targetIndex: number,
  closestEdge: Edge | null
): number {
  // 'bottom' and 'right' mean insert after the target.
  // 'top' and 'left' mean insert before the target.
  if (closestEdge === 'bottom' || closestEdge === 'right') {
    return startIndex < targetIndex ? targetIndex : targetIndex + 1;
  }
  return startIndex < targetIndex ? targetIndex - 1 : targetIndex;
}

/**
 * Find the nearest item index and edge for a cursor position within the grid.
 * Uses masonic's positioner to get item positions, then finds the item whose
 * center is closest to the cursor.
 */
function hitTest(
  cursorX: number,
  cursorY: number,
  positioner: Positioner
): { index: number; edge: Edge } | null {
  const items = positioner.all();
  if (items.length === 0) {
    return { index: 0, edge: 'top' };
  }

  let nearestIndex = 0;
  let nearestDist = Infinity;

  const colWidth = positioner.columnWidth;

  for (let i = 0; i < items.length; i++) {
    const item = items[i] as (typeof items)[number];
    const cx = item.left + colWidth / 2;
    const cy = item.top + item.height / 2;
    const dist = Math.sqrt((cursorX - cx) ** 2 + (cursorY - cy) ** 2);
    if (dist < nearestDist) {
      nearestDist = dist;
      nearestIndex = i;
    }
  }

  const nearestItem = items[nearestIndex] as (typeof items)[number];
  // In a column-based masonry layout, left/right maps to before/after in
  // the flat list more intuitively than top/bottom. Cursor on the left
  // half of a card → insert before; right half → insert after.
  const edge: Edge = cursorX > nearestItem.left + positioner.columnWidth / 2 ? 'right' : 'left';

  return { index: nearestIndex, edge };
}

// ---------------------------------------------------------------------------
// Module-level callbacks + target map
// ---------------------------------------------------------------------------

const gDropTargetCallbacks = new Map<
  symbol,
  {
    setDropTarget: (index: number) => void;
    clearDropTarget: () => void;
  }
>();
const gTargetMap = new Map<symbol, { index: number; edge: Edge }>();

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------

export function SortableGridProvider({
  itemIds,
  onReorder,
  scrollContainerRef,
  positionerRef,
  gridElement,
  children,
}: SortableGridProviderProps) {
  const instanceId = useMemo(() => Symbol('sortable-grid'), []);

  const itemIdsRef = useRef(itemIds);
  itemIdsRef.current = itemIds;

  const [dragState, setDragState] = useState<DragState>({
    isDragging: false,
    draggingId: null,
    dropIndicatorIndex: null,
  });

  // ── Auto-scroll ─────────────────────────────────────────────────────
  useEffect(() => {
    const el = scrollContainerRef.current;
    if (!el) {
      return;
    }
    return autoScrollForElements({ element: el });
  }, [scrollContainerRef]);

  // ── Drop target callbacks ───────────────────────────────────────────
  const handleSetDropTarget = useCallback((index: number) => {
    setDragState((prev) =>
      prev.dropIndicatorIndex === index ? prev : { ...prev, dropIndicatorIndex: index }
    );
  }, []);

  const handleClearDropTarget = useCallback(() => {
    setDragState((prev) =>
      prev.dropIndicatorIndex === null ? prev : { ...prev, dropIndicatorIndex: null }
    );
  }, []);

  // ── Container drop target ───────────────────────────────────────────
  useLayoutEffect(() => {
    if (!gridElement) {
      return;
    }

    return dropTargetForElements({
      element: gridElement,
      canDrop({ source }) {
        return isItemData(source.data) && source.data.instanceId === instanceId;
      },
      onDrag({ location }) {
        const pos = positionerRef.current;
        if (!pos) {
          return;
        }
        const input = location.current.input;
        const gridRect = gridElement.getBoundingClientRect();
        const cursorX = input.clientX - gridRect.left;
        const cursorY = input.clientY - gridRect.top;

        const result = hitTest(cursorX, cursorY, pos);
        if (result) {
          gTargetMap.set(instanceId, result);
          // The drop indicator index is the item we're hovering over
          gDropTargetCallbacks.get(instanceId)?.setDropTarget(result.index);
        }
      },
      onDragLeave() {
        gDropTargetCallbacks.get(instanceId)?.clearDropTarget();
        gTargetMap.delete(instanceId);
      },
    });
  }, [instanceId, gridElement, positionerRef]);

  // ── Global drag monitor ─────────────────────────────────────────────
  useEffect(() => {
    gDropTargetCallbacks.set(instanceId, {
      setDropTarget: handleSetDropTarget,
      clearDropTarget: handleClearDropTarget,
    });

    return monitorForElements({
      canMonitor({ source }) {
        return isItemData(source.data) && source.data.instanceId === instanceId;
      },
      onDragStart({ source }) {
        const data = source.data as unknown as SortableItemData;
        setDragState({
          isDragging: true,
          draggingId: data.id,
          dropIndicatorIndex: null,
        });
      },
      onDrop({ source }) {
        const srcData = source.data as unknown as SortableItemData;
        const target = gTargetMap.get(instanceId) ?? null;
        gTargetMap.delete(instanceId);

        setDragState({
          isDragging: false,
          draggingId: null,
          dropIndicatorIndex: null,
        });

        if (!target) {
          return;
        }

        const currentIds = itemIdsRef.current;
        const dest = computeDestination(srcData.index, target.index, target.edge);

        if (dest === srcData.index) {
          return;
        }

        const newIds = [...currentIds];
        const [removed] = newIds.splice(srcData.index, 1);
        newIds.splice(dest, 0, removed as string);

        void onReorder(newIds);
      },
    });
  }, [instanceId, onReorder, handleSetDropTarget, handleClearDropTarget]);

  // Clean up
  useEffect(() => {
    return () => {
      gDropTargetCallbacks.delete(instanceId);
    };
  }, [instanceId]);

  const value: SortableGridContextValue = useMemo(
    () => ({ instanceId, dragState }),
    [instanceId, dragState]
  );

  return <SortableGridContext.Provider value={value}>{children}</SortableGridContext.Provider>;
}

// ---------------------------------------------------------------------------
// Per-item hook
// ---------------------------------------------------------------------------

export function useSortableGridItem(id: string, index: number) {
  const ctx = useSortableGridContext();

  const itemEl = useRef<HTMLElement | null>(null);
  const handleEl = useRef<HTMLElement | null>(null);

  const setItemRef = (el: HTMLElement | null) => {
    itemEl.current = el;
  };
  const setHandleRef = (el: HTMLElement | null) => {
    handleEl.current = el;
  };

  const instanceId = ctx?.instanceId ?? null;
  const dragState = ctx?.dragState ?? null;
  const isEnabled = ctx !== null;

  // Register draggable on the drag handle
  useLayoutEffect(() => {
    if (!isEnabled || !instanceId) {
      return;
    }

    const handle = handleEl.current;
    if (!handle) {
      return;
    }

    return draggable({
      element: handle,
      getInitialData: () => getItemData({ id, index, instanceId }),
      onGenerateDragPreview({ nativeSetDragImage }) {
        const item = itemEl.current;
        if (item && nativeSetDragImage) {
          nativeSetDragImage(item, 0, 0);
        }
      },
    });
  }, [id, index, instanceId, isEnabled]);

  return {
    itemRef: setItemRef,
    dragHandleRef: setHandleRef,
    isDragging: dragState?.draggingId === id,
    isAnyDragging: dragState?.isDragging ?? false,
    isDropTarget: dragState?.dropIndicatorIndex === index,
    isEnabled,
  };
}

export type { SortableGridContextValue, SortableGridProviderProps };
