import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Icon } from "../lib/glyphs";
import { KIND_LABEL, type Kind } from "../lib/model";
import { useStore } from "../lib/store";

/* ⌘K. Actions first, then whatever you have written, matched on body text. */

export function CommandPalette({
  onClose,
  onCompose,
}: {
  onClose: () => void;
  onCompose: (pieceId: string) => void;
}) {
  const store = useStore();
  const navigate = useNavigate();
  const [query, setQuery] = useState("");
  const [cursor, setCursor] = useState(0);

  const rows = useMemo(() => {
    const needle = query.trim().toLowerCase();

    const actions = [
      {
        id: "new-post",
        label: "New post",
        hint: "Compose",
        run: () => onCompose(store.createPiece({ kind: "post" }).id),
      },
      {
        id: "new-carousel",
        label: "New carousel",
        hint: "Compose",
        run: () => onCompose(store.createPiece({ kind: "carousel" }).id),
      },
      {
        id: "new-thread",
        label: "New thread",
        hint: "Compose",
        run: () => onCompose(store.createPiece({ kind: "thread" }).id),
      },
      {
        id: "go-plan",
        label: "Go to Plan",
        hint: "1",
        run: () => navigate("/plan"),
      },
      {
        id: "go-library",
        label: "Go to Library",
        hint: "2",
        run: () => navigate("/library"),
      },
      {
        id: "go-assets",
        label: "Go to Assets",
        hint: "4",
        run: () => navigate("/assets"),
      },
      {
        id: "connect",
        label: "Connect a channel",
        hint: "Settings",
        run: () => navigate("/settings/channels"),
      },
    ].filter((a) => !needle || a.label.toLowerCase().includes(needle));

    const pieces = needle
      ? store.scopedPieces
          .filter(
            (p) =>
              p.body.toLowerCase().includes(needle) ||
              p.title.toLowerCase().includes(needle),
          )
          .slice(0, 6)
          .map((p) => ({
            id: p.id,
            label: p.body.trim() || p.title || "Untitled",
            hint: KIND_LABEL[p.kind as Kind],
            run: () => onCompose(p.id),
          }))
      : [];

    return [...actions, ...pieces];
  }, [query, store, navigate, onCompose]);

  useEffect(() => setCursor(0), [query]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") return onClose();
      if (event.key === "ArrowDown") {
        event.preventDefault();
        setCursor((c) => Math.min(rows.length - 1, c + 1));
      }
      if (event.key === "ArrowUp") {
        event.preventDefault();
        setCursor((c) => Math.max(0, c - 1));
      }
      if (event.key === "Enter") {
        event.preventDefault();
        rows[cursor]?.run();
        onClose();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [rows, cursor, onClose]);

  return (
    <>
      <button className="modal-scrim" aria-label="Close" onClick={onClose} />
      <div className="palette" role="dialog" aria-label="Command palette">
        <label className="field">
          <Icon.search />
          <input
            value={query}
            autoFocus
            spellCheck={false}
            placeholder="Search or run a command"
            onChange={(e) => setQuery(e.target.value)}
          />
          <kbd>esc</kbd>
        </label>
        <div className="palette-list">
          {rows.map((row, index) => (
            <button
              key={row.id}
              className={`palette-row ${index === cursor ? "on" : ""}`}
              onMouseEnter={() => setCursor(index)}
              onClick={() => {
                row.run();
                onClose();
              }}
            >
              {row.label}
              <span className="k">{row.hint}</span>
            </button>
          ))}
          {!rows.length && <p className="blank-sm">Nothing matches.</p>}
        </div>
      </div>
    </>
  );
}
