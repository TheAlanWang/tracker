import { useEffect, useRef, useState } from "react";
import { Sparkles } from "lucide-react";

// Draggable floating launcher for the AI assistant. Defaults to a corner (the
// caller picks which); the user can drag it anywhere and the position sticks
// (localStorage, under a caller-supplied key so different mount points keep
// independent positions). A click (no drag) opens the panel. Rendered when the
// panel is collapsed — by ProjectLayout (board pages) and FocusedTaskLayout.

const SIZE = 48; // px — the round button's width/height
const MARGIN = 24; // px — keep this far from the viewport edges
const DRAG_THRESHOLD = 4; // px moved before a press counts as a drag, not a click

type Pos = { x: number; y: number };
type Corner = "bottom-right" | "bottom-left";

function clamp(p: Pos): Pos {
  const maxX = Math.max(MARGIN, window.innerWidth - SIZE - MARGIN);
  const maxY = Math.max(MARGIN, window.innerHeight - SIZE - MARGIN);
  return {
    x: Math.min(Math.max(p.x, MARGIN), maxX),
    y: Math.min(Math.max(p.y, MARGIN), maxY),
  };
}

function defaultPos(corner: Corner): Pos {
  return {
    x: corner === "bottom-left" ? MARGIN : window.innerWidth - SIZE - MARGIN,
    y: window.innerHeight - SIZE - MARGIN,
  };
}

export function AgentLauncher({
  onOpen,
  storageKey = "agentLauncherPos",
  defaultCorner = "bottom-right",
}: {
  onOpen: () => void;
  storageKey?: string;
  defaultCorner?: Corner;
}) {
  const [pos, setPos] = useState<Pos>(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(storageKey) || "null");
      if (saved && typeof saved.x === "number" && typeof saved.y === "number") {
        return clamp(saved);
      }
    } catch {
      /* malformed — fall through to default */
    }
    return defaultPos(defaultCorner);
  });
  const posRef = useRef(pos);
  posRef.current = pos;

  // Re-clamp if the window shrinks so the button can't get stranded offscreen.
  useEffect(() => {
    const onResize = () => setPos((p) => clamp(p));
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  function onMouseDown(e: React.MouseEvent) {
    e.preventDefault();
    const start = {
      sx: e.clientX,
      sy: e.clientY,
      ox: e.clientX - pos.x, // pointer offset within the button
      oy: e.clientY - pos.y,
      moved: false,
    };
    const onMove = (ev: MouseEvent) => {
      if (
        Math.hypot(ev.clientX - start.sx, ev.clientY - start.sy) > DRAG_THRESHOLD
      ) {
        start.moved = true;
      }
      setPos(clamp({ x: ev.clientX - start.ox, y: ev.clientY - start.oy }));
    };
    const onUp = () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
      document.body.style.userSelect = "";
      if (start.moved) {
        localStorage.setItem(storageKey, JSON.stringify(posRef.current));
      } else {
        onOpen(); // a press with no drag = open
      }
    };
    document.body.style.userSelect = "none";
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  }

  return (
    <button
      type="button"
      onMouseDown={onMouseDown}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onOpen();
        }
      }}
      aria-label="Open AI assistant"
      title="Ask AI — drag to move"
      style={{ left: pos.x, top: pos.y, width: SIZE, height: SIZE }}
      className="fixed z-30 flex cursor-grab items-center justify-center rounded-full border border-slate-200 bg-white shadow-lg transition-colors hover:bg-slate-50 active:cursor-grabbing dark:border-neutral-800 dark:bg-neutral-900 dark:hover:bg-neutral-800"
    >
      <Sparkles className="h-5 w-5 text-[var(--brand)]" strokeWidth={2} />
    </button>
  );
}
