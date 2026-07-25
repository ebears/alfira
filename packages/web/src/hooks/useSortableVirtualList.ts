import { autoScrollForElements } from '@atlaskit/pragmatic-drag-and-drop-auto-scroll/element';
import { type Edge } from '@atlaskit/pragmatic-drag-and-drop-hitbox/closest-edge';
import {
  draggable,
  dropTargetForElements,
  monitorForElements,
} from '@atlaskit/pragmatic-drag-and-drop/element/adapter';
import React, {
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

interface SortableListContextValue {
  instanceId: symbol;
  dragState: DragState;
}

interface SortableListProviderProps {
  itemIds: string[];
  onReorder: (orderedIds: string[]) => Promise<void>;
  scrollContainerRef: React.RefObject<HTMLElement | null>;
  children: ReactNode;
}

// ---------------------------------------------------------------------------
// Context
// ---------------------------------------------------------------------------

const SortableListContext = createContext<SortableListContextValue | null>(null);

export function useSortableListContext(): SortableListContextValue {
  const ctx = useContext(SortableListContext);
  if (!ctx) {
    throw new Error('useSortableListContext must be used within SortableListProvider');
  }
  return ctx;
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
  if (closestEdge === 'bottom') {
    return startIndex < targetIndex ? targetIndex : targetIndex + 1;
  }
  return startIndex < targetIndex ? targetIndex - 1 : targetIndex;
}

// ---------------------------------------------------------------------------
// Module-level callbacks + edge map
// ---------------------------------------------------------------------------

const gDropTargetCallbacks = new Map<
  symbol,
  {
    setDropTarget: (index: number) => void;
    clearDropTarget: () => void;
  }
>();
const gEdgeMap = new Map<symbol, { index: number; edge: Edge }>();

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------

export function SortableListProvider({
  itemIds,
  onReorder,
  scrollContainerRef,
  children,
}: SortableListProviderProps) {
  const instanceId = useMemo(() => Symbol('sortable-list'), []);

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
        const target = gEdgeMap.get(instanceId) ?? null;
        gEdgeMap.delete(instanceId);

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

  const value: SortableListContextValue = useMemo(
    () => ({ instanceId, dragState }),
    [instanceId, dragState]
  );

  return React.createElement(SortableListContext.Provider, { value }, children);
}

// ---------------------------------------------------------------------------
// Per-item hook
// ---------------------------------------------------------------------------

export function useSortableItem(id: string, index: number) {
  const { instanceId, dragState } = useSortableListContext();

  const itemEl = useRef<HTMLElement | null>(null);
  const handleEl = useRef<HTMLElement | null>(null);

  const setItemRef = (el: HTMLElement | null) => {
    itemEl.current = el;
  };
  const setHandleRef = (el: HTMLElement | null) => {
    handleEl.current = el;
  };

  useLayoutEffect(() => {
    const element = itemEl.current;
    if (!element) {
      return;
    }

    return dropTargetForElements({
      element,
      canDrop({ source }) {
        return isItemData(source.data) && source.data.instanceId === instanceId;
      },
      getData({ input }) {
        const rect = element.getBoundingClientRect();
        const edge: Edge = input.clientY < rect.top + rect.height / 2 ? 'top' : 'bottom';
        return { index, edge };
      },
      onDragEnter() {
        gDropTargetCallbacks.get(instanceId)?.setDropTarget(index);
      },
      onDrag({ self }) {
        const data = self.data as Record<string, unknown>;
        const edge = (data.edge as Edge | undefined) ?? 'bottom';
        gEdgeMap.set(instanceId, { index, edge });
        gDropTargetCallbacks.get(instanceId)?.setDropTarget(index);
      },
      onDragLeave() {
        gDropTargetCallbacks.get(instanceId)?.clearDropTarget();
        gEdgeMap.delete(instanceId);
      },
    });
  }, [id, index, instanceId]);

  useLayoutEffect(() => {
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
  }, [id, index, instanceId]);

  return {
    itemRef: setItemRef,
    dragHandleRef: setHandleRef,
    isDragging: dragState.draggingId === id,
    isAnyDragging: dragState.isDragging,
    isDropTarget: dragState.dropIndicatorIndex === index,
  };
}

export type { SortableListContextValue, SortableListProviderProps };
