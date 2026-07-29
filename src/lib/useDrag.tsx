import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";

/*
 * Pointer-events drag-and-drop.
 *
 * We deliberately avoid the HTML5 `draggable`/dataTransfer API: on macOS
 * (WKWebView) Tauri's native file-drop layer — which we need for Finder→app
 * image import in the Library — intercepts HTML5 drag events, so in-page `drop`
 * never fires reliably. Pointer events are unaffected, so all in-app dragging
 * (reschedule on the calendar, move-into-folder) goes through here instead.
 *
 * Drop zones tag their DOM node with `data-drop-id`; while dragging we hit-test
 * with elementFromPoint (the floating ghost is pointer-events:none so it never
 * shadows the zone under the cursor).
 */

type DropHandler = (itemId: string) => void;

interface DragState {
  itemId: string;
  label: string;
}

interface DragCtx {
  dragging: DragState | null;
  overDropId: string | null;
  registerDrop: (id: string, onDrop: DropHandler) => () => void;
  beginDrag: (itemId: string, label: string, x: number, y: number) => void;
}

const Ctx = createContext<DragCtx | null>(null);

const CLICK_THRESHOLD = 4; // px of movement before a press becomes a drag

export function DragProvider({ children }: { children: ReactNode }) {
  const [dragging, setDragging] = useState<DragState | null>(null);
  const [overDropId, setOverDropId] = useState<string | null>(null);
  const drops = useRef(new Map<string, DropHandler>());
  const ghostRef = useRef<HTMLDivElement>(null);
  const activeRef = useRef<DragState | null>(null);
  const overRef = useRef<string | null>(null);

  const registerDrop = useCallback((id: string, onDrop: DropHandler) => {
    drops.current.set(id, onDrop);
    return () => {
      if (drops.current.get(id) === onDrop) drops.current.delete(id);
    };
  }, []);

  const beginDrag = useCallback(
    (itemId: string, label: string, x: number, y: number) => {
      activeRef.current = { itemId, label };
      setDragging({ itemId, label });
      moveGhost(x, y);

      function moveGhost(px: number, py: number) {
        const g = ghostRef.current;
        if (g) g.style.transform = `translate(${px + 12}px, ${py + 10}px)`;
      }
      function hitTest(px: number, py: number): string | null {
        const el = document.elementFromPoint(px, py) as HTMLElement | null;
        const zone = el?.closest("[data-drop-id]") as HTMLElement | null;
        return zone?.getAttribute("data-drop-id") ?? null;
      }
      function onMove(e: PointerEvent) {
        moveGhost(e.clientX, e.clientY);
        const id = hitTest(e.clientX, e.clientY);
        if (id !== overRef.current) {
          overRef.current = id;
          setOverDropId(id);
        }
      }
      function onUp(e: PointerEvent) {
        window.removeEventListener("pointermove", onMove);
        window.removeEventListener("pointerup", onUp);
        const id = hitTest(e.clientX, e.clientY);
        const item = activeRef.current;
        activeRef.current = null;
        overRef.current = null;
        setDragging(null);
        setOverDropId(null);
        document.body.style.userSelect = "";
        if (id && item) drops.current.get(id)?.(item.itemId);
      }

      document.body.style.userSelect = "none";
      window.addEventListener("pointermove", onMove);
      window.addEventListener("pointerup", onUp);
    },
    [],
  );

  const value = useMemo(
    () => ({ dragging, overDropId, registerDrop, beginDrag }),
    [dragging, overDropId, registerDrop, beginDrag],
  );

  return (
    <Ctx.Provider value={value}>
      {children}
      <div
        ref={ghostRef}
        className="drag-ghost"
        style={{ display: dragging ? "block" : "none" }}
      >
        {dragging?.label}
      </div>
    </Ctx.Provider>
  );
}

/**
 * Spread the returned handlers on a draggable element. A press that stays within
 * CLICK_THRESHOLD is treated as a click and calls `onClick`; anything further
 * starts a drag (and suppresses the click).
 */
export function useDraggable(
  itemId: string,
  label: string,
  onClick?: () => void,
) {
  const ctx = useContext(Ctx);
  const start = useRef<{ x: number; y: number; dragged: boolean } | null>(null);

  return {
    onPointerDown: (e: React.PointerEvent) => {
      if (e.button !== 0) return;
      start.current = { x: e.clientX, y: e.clientY, dragged: false };
    },
    onPointerMove: (e: React.PointerEvent) => {
      const s = start.current;
      if (!s || s.dragged) return;
      if (Math.hypot(e.clientX - s.x, e.clientY - s.y) > CLICK_THRESHOLD) {
        s.dragged = true;
        ctx?.beginDrag(itemId, label, e.clientX, e.clientY);
      }
    },
    onPointerUp: () => {
      const s = start.current;
      start.current = null;
      if (s && !s.dragged) onClick?.();
    },
  };
}

/** Register a drop target. Tag the element with the returned `dropProps`. */
export function useDropZone(id: string, onDrop: DropHandler, accept = true) {
  const ctx = useContext(Ctx);
  const cb = useRef(onDrop);
  cb.current = onDrop;

  useEffect(() => {
    if (!ctx || !accept) return;
    return ctx.registerDrop(id, (item) => cb.current(item));
  }, [ctx, id, accept]);

  return {
    dropProps: accept ? ({ "data-drop-id": id } as const) : {},
    isOver: ctx?.overDropId === id,
    isDragging: !!ctx?.dragging,
  };
}

/** True while any drag is in progress (for showing drop affordances). */
export function useIsDragging(): boolean {
  return !!useContext(Ctx)?.dragging;
}
