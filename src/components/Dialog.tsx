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
import { Icon } from "../lib/glyphs";

/*
 * Asking a question, in the app's own voice.
 *
 * These replace window.confirm and window.prompt. Two reasons: a native dialog
 * is a different piece of software wearing a different typeface in the middle
 * of a considered screen, and — the reason it mattered here — the packaged
 * Tauri webview does not reliably present them at all, so "New project" and
 * every delete simply did nothing. A promise-returning hook keeps the call
 * sites reading exactly as they did.
 */

interface ConfirmRequest {
  title: string;
  body?: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
}

interface PromptRequest {
  title: string;
  body?: ReactNode;
  label?: string;
  placeholder?: string;
  value?: string;
  confirmLabel?: string;
}

type Pending =
  | { kind: "confirm"; request: ConfirmRequest; settle: (ok: boolean) => void }
  | {
      kind: "prompt";
      request: PromptRequest;
      settle: (value: string | null) => void;
    };

interface DialogValue {
  confirm: (request: ConfirmRequest) => Promise<boolean>;
  prompt: (request: PromptRequest) => Promise<string | null>;
}

const DialogContext = createContext<DialogValue | null>(null);

export function DialogProvider({ children }: { children: ReactNode }) {
  const [pending, setPending] = useState<Pending | null>(null);

  const confirm = useCallback(
    (request: ConfirmRequest) =>
      new Promise<boolean>((resolve) =>
        setPending({ kind: "confirm", request, settle: resolve }),
      ),
    [],
  );

  const prompt = useCallback(
    (request: PromptRequest) =>
      new Promise<string | null>((resolve) =>
        setPending({ kind: "prompt", request, settle: resolve }),
      ),
    [],
  );

  const value = useMemo(() => ({ confirm, prompt }), [confirm, prompt]);

  return (
    <DialogContext.Provider value={value}>
      {children}
      {pending && (
        <DialogHost
          pending={pending}
          onDone={() => setPending(null)}
          key={pending.request.title}
        />
      )}
    </DialogContext.Provider>
  );
}

function DialogHost({
  pending,
  onDone,
}: {
  pending: Pending;
  onDone: () => void;
}) {
  const [text, setText] = useState(
    pending.kind === "prompt" ? (pending.request.value ?? "") : "",
  );
  const input = useRef<HTMLInputElement>(null);
  // A dialog must settle exactly once, whichever way it is dismissed.
  const settled = useRef(false);

  const close = useCallback(
    (accepted: boolean, valueOut: string) => {
      if (settled.current) return;
      settled.current = true;
      if (pending.kind === "confirm") pending.settle(accepted);
      else pending.settle(accepted ? valueOut : null);
      onDone();
    },
    [pending, onDone],
  );

  useEffect(() => {
    input.current?.focus();
    input.current?.select();
  }, []);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        close(false, "");
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [close]);

  const isPrompt = pending.kind === "prompt";
  const request = pending.request;
  const blocked = isPrompt && !text.trim();

  return (
    <>
      <button
        className="modal-scrim"
        style={{ zIndex: 80 }}
        aria-label="Cancel"
        onClick={() => close(false, "")}
      />
      <section
        className="modal sm dialog"
        style={{ zIndex: 81 }}
        role="dialog"
        aria-modal="true"
        aria-label={request.title}
      >
        <header className="bar">
          <div className="ttl">
            <h1 style={{ fontSize: "var(--f1)" }}>{request.title}</h1>
          </div>
          <span className="grow" />
          <button
            className="icobtn bare"
            aria-label="Close"
            onClick={() => close(false, "")}
          >
            <Icon.close />
          </button>
        </header>

        <div className="dialog-body">
          {request.body && <p className="dialog-note">{request.body}</p>}
          {isPrompt && (
            <label className="lbl-f">
              {(request as PromptRequest).label ?? "Name"}
              <input
                ref={input}
                className="inp"
                value={text}
                placeholder={(request as PromptRequest).placeholder}
                onChange={(e) => setText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && text.trim()) close(true, text);
                }}
              />
            </label>
          )}
        </div>

        <footer className="modal-foot">
          <span className="grow" />
          <button className="btn" onClick={() => close(false, "")}>
            {(request as ConfirmRequest).cancelLabel ?? "Cancel"}
          </button>
          <button
            className={`btn ${(request as ConfirmRequest).danger ? "danger" : "pri"}`}
            disabled={blocked}
            onClick={() => close(true, text)}
          >
            {request.confirmLabel ?? (isPrompt ? "Save" : "Confirm")}
          </button>
        </footer>
      </section>
    </>
  );
}

function useDialogs(): DialogValue {
  const value = useContext(DialogContext);
  if (!value) throw new Error("Dialogs must be used inside DialogProvider");
  return value;
}

export const useConfirm = () => useDialogs().confirm;
export const usePrompt = () => useDialogs().prompt;
