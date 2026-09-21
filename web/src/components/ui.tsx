import { createContext, forwardRef, useCallback, useContext, useEffect, useId, useRef, useState, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from "react";
import { AlertTriangle, Check, Copy, Loader2, X } from "lucide-react";

export const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(" ");

// ---------- Button ----------
type BtnProps = ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "primary" | "secondary" | "ghost" | "danger"; size?: "sm" | "md"; loading?: boolean; icon?: ReactNode };
export const Button = forwardRef<HTMLButtonElement, BtnProps>(({ variant = "secondary", size = "md", loading, icon, className, children, disabled, ...p }, ref) => (
  <button
    ref={ref}
    disabled={disabled || loading}
    className={cx(
      "inline-flex items-center justify-center gap-2 rounded-lg font-medium transition-colors disabled:opacity-55 disabled:cursor-not-allowed whitespace-nowrap",
      size === "sm" ? "h-8 px-3 text-[13px]" : "h-10 px-4 text-sm",
      variant === "primary" && "bg-accent text-on-accent hover:bg-accent-2",
      variant === "secondary" && "border border-line bg-card text-ink hover:bg-paper-2",
      variant === "ghost" && "text-ink-2 hover:bg-paper-2 hover:text-ink",
      variant === "danger" && "border border-danger/40 bg-card text-danger hover:bg-danger-soft",
      className,
    )}
    {...p}
  >
    {loading ? <Loader2 className="size-4 spin" aria-hidden /> : icon}
    {children}
  </button>
));

// ---------- Form controls ----------
const control = "w-full rounded-lg border border-line bg-card px-3 text-sm text-ink placeholder:text-muted focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/20 disabled:opacity-60";
export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(({ className, ...p }, ref) => <input ref={ref} className={cx(control, "h-10", className)} {...p} />);
export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(({ className, ...p }, ref) => <textarea ref={ref} className={cx(control, "py-2 min-h-24", className)} {...p} />);
export const Select = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement>>(({ className, children, ...p }, ref) => <select ref={ref} className={cx(control, "h-10 pr-8", className)} {...p}>{children}</select>);

export function Field({ label, hint, error, children, className }: { label: string; hint?: ReactNode; error?: string | null; children: ReactNode; className?: string }) {
  return (
    <label className={cx("grid gap-1.5", className)}>
      <span className="text-[13px] font-semibold text-ink">{label}</span>
      {children}
      {error ? <span className="text-xs text-danger">{error}</span> : hint ? <span className="text-xs text-muted">{hint}</span> : null}
    </label>
  );
}

export function Toggle({ checked, onChange, label, description, disabled }: { checked: boolean; onChange: (v: boolean) => void; label: string; description?: string; disabled?: boolean }) {
  const id = useId();
  return (
    <div className="flex items-start justify-between gap-4 py-2">
      <div><label htmlFor={id} className="text-sm font-medium text-ink">{label}</label>{description && <p className="text-xs text-muted mt-0.5">{description}</p>}</div>
      <button id={id} type="button" role="switch" aria-checked={checked} disabled={disabled} onClick={() => onChange(!checked)}
        className={cx("relative h-6 w-10 shrink-0 rounded-full transition-colors disabled:opacity-50", checked ? "bg-accent" : "bg-line")}>
        <span className={cx("absolute top-0.5 size-5 rounded-full bg-card shadow transition-all", checked ? "left-[18px]" : "left-0.5")} />
      </button>
    </div>
  );
}

// ---------- Layout bits ----------
export function Card({ children, className, title, action, pad = true }: { children: ReactNode; className?: string; title?: ReactNode; action?: ReactNode; pad?: boolean }) {
  return (
    <section className={cx("rounded-xl border border-line bg-card shadow-[0_1px_2px_rgba(20,24,26,.04)]", className)}>
      {(title || action) && <header className="flex items-center justify-between gap-3 border-b border-line-2 px-5 py-3.5"><h2 className="text-sm font-semibold text-ink">{title}</h2>{action}</header>}
      <div className={pad ? "p-5" : ""}>{children}</div>
    </section>
  );
}

export function PageHeader({ title, description, actions }: { title: string; description?: ReactNode; actions?: ReactNode }) {
  useEffect(() => { document.title = `${title} · SentLedger`; }, [title]);
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div><h1 className="font-serif text-[28px] font-semibold leading-tight text-ink">{title}</h1>{description && <p className="mt-1 text-sm text-ink-2 max-w-2xl">{description}</p>}</div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}

const tones = { ok: "bg-accent-soft text-accent-ink", accent: "bg-accent-soft text-accent-ink", warn: "bg-gold-soft text-gold", bad: "bg-danger-soft text-danger", muted: "bg-paper-2 text-ink-2" };
export function Badge({ tone = "muted", children, className }: { tone?: keyof typeof tones; children: ReactNode; className?: string }) {
  return <span className={cx("inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-xs font-medium", tones[tone], className)}>{children}</span>;
}

export const Spinner = ({ label = "Loading" }: { label?: string }) => (
  <div className="flex items-center justify-center gap-2 py-12 text-sm text-muted" role="status"><Loader2 className="size-4 spin" aria-hidden />{label}…</div>
);

export function Empty({ icon, title, body, action }: { icon?: ReactNode; title: string; body?: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-14 text-center">
      {icon && <div className="mb-3 grid size-11 place-items-center rounded-xl bg-accent-soft text-accent-ink">{icon}</div>}
      <h3 className="text-[15px] font-semibold text-ink">{title}</h3>
      {body && <p className="mt-1 max-w-md text-sm text-ink-2">{body}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function ErrorState({ error, retry }: { error: Error; retry?: () => void }) {
  return (
    <div className="flex flex-col items-center gap-3 px-6 py-12 text-center" role="alert">
      <AlertTriangle className="size-6 text-danger" aria-hidden />
      <p className="text-sm text-ink-2">{error.message}</p>
      {retry && <Button size="sm" onClick={retry}>Try again</Button>}
    </div>
  );
}

export function Notice({ tone = "warn", children, className }: { tone?: "warn" | "info" | "bad" | "ok"; children: ReactNode; className?: string }) {
  return (
    <div className={cx("rounded-lg border px-4 py-3 text-sm",
      tone === "warn" && "border-gold/30 bg-gold-soft text-ink-2", tone === "info" && "border-line bg-paper-2 text-ink-2",
      tone === "bad" && "border-danger/30 bg-danger-soft text-danger", tone === "ok" && "border-accent/30 bg-accent-soft text-accent-ink", className)}>{children}</div>
  );
}

export function Stat({ label, value, sub, tone }: { label: string; value: ReactNode; sub?: ReactNode; tone?: "bad" }) {
  return (
    <div className="rounded-xl border border-line bg-card p-4">
      <div className="text-xs font-medium uppercase tracking-wide text-muted">{label}</div>
      <div className={cx("mt-1.5 font-serif text-[26px] font-semibold leading-none", tone === "bad" ? "text-danger" : "text-ink")}>{value}</div>
      {sub && <div className="mt-1.5 text-xs text-muted">{sub}</div>}
    </div>
  );
}

export function Tabs<T extends string>({ value, onChange, tabs }: { value: T; onChange: (v: T) => void; tabs: { value: T; label: ReactNode }[] }) {
  return (
    <div role="tablist" className="mb-5 flex gap-1 overflow-x-auto border-b border-line">
      {tabs.map((t) => (
        <button key={t.value} role="tab" aria-selected={value === t.value} onClick={() => onChange(t.value)}
          className={cx("-mb-px whitespace-nowrap border-b-2 px-3 py-2 text-sm font-medium", value === t.value ? "border-accent text-ink" : "border-transparent text-muted hover:text-ink")}>{t.label}</button>
      ))}
    </div>
  );
}

// ---------- Modal ----------
export function Modal({ open, onClose, title, children, footer, wide }: { open: boolean; onClose: () => void; title: string; children: ReactNode; footer?: ReactNode; wide?: boolean }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);
  return (
    <dialog ref={ref} onClose={onClose} onCancel={(e) => { e.preventDefault(); onClose(); }}
      className={cx("m-auto w-[calc(100%-32px)] rounded-xl border border-line bg-card p-0 text-ink shadow-2xl backdrop:bg-black/40", wide ? "max-w-3xl" : "max-w-lg")}>
      {open && (
        <div className="flex max-h-[85vh] flex-col">
          <header className="flex items-center justify-between border-b border-line-2 px-5 py-4"><h2 className="text-base font-semibold">{title}</h2>
            <button onClick={onClose} className="rounded-md p-1 text-muted hover:bg-paper-2 hover:text-ink" aria-label="Close"><X className="size-4" /></button></header>
          <div className="overflow-y-auto px-5 py-4">{children}</div>
          {footer && <footer className="flex justify-end gap-2 border-t border-line-2 px-5 py-3">{footer}</footer>}
        </div>
      )}
    </dialog>
  );
}

export function Confirm({ open, onClose, onConfirm, title, body, confirmLabel = "Confirm", danger, loading }: { open: boolean; onClose: () => void; onConfirm: () => void; title: string; body: ReactNode; confirmLabel?: string; danger?: boolean; loading?: boolean }) {
  return (
    <Modal open={open} onClose={onClose} title={title} footer={<><Button variant="ghost" onClick={onClose}>Cancel</Button><Button variant={danger ? "danger" : "primary"} loading={loading} onClick={onConfirm}>{confirmLabel}</Button></>}>
      <div className="text-sm text-ink-2">{body}</div>
    </Modal>
  );
}

// ---------- Copy ----------
export function CopyField({ value, secret, label }: { value: string; secret?: boolean; label?: string }) {
  const [done, setDone] = useState(false);
  return (
    <div className="flex items-center gap-2 rounded-lg border border-line bg-paper px-3 py-2">
      <code className={cx("min-w-0 flex-1 truncate font-mono text-[13px]", secret && "select-all")} aria-label={label}>{value}</code>
      <button type="button" className="shrink-0 rounded-md p-1 text-muted hover:bg-paper-2 hover:text-ink" aria-label="Copy"
        onClick={async () => { await navigator.clipboard.writeText(value); setDone(true); setTimeout(() => setDone(false), 1500); }}>
        {done ? <Check className="size-4 text-ok" /> : <Copy className="size-4" />}
      </button>
    </div>
  );
}

// ---------- Toasts ----------
type Toast = { id: number; tone: "ok" | "bad" | "info"; text: string };
const ToastCtx = createContext<(tone: Toast["tone"], text: string) => void>(() => {});
export const useToast = () => {
  const push = useContext(ToastCtx);
  return { ok: (t: string) => push("ok", t), error: (t: string | Error) => push("bad", typeof t === "string" ? t : t.message), info: (t: string) => push("info", t) };
};
export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<Toast[]>([]);
  const push = useCallback((tone: Toast["tone"], text: string) => {
    const id = Date.now() + Math.random();
    setItems((x) => [...x, { id, tone, text }]);
    setTimeout(() => setItems((x) => x.filter((t) => t.id !== id)), tone === "bad" ? 7000 : 4000);
  }, []);
  return (
    <ToastCtx.Provider value={push}>
      {children}
      <div className="pointer-events-none fixed bottom-4 right-4 z-[100] flex w-[min(380px,calc(100%-32px))] flex-col gap-2" aria-live="polite">
        {items.map((t) => (
          <div key={t.id} className={cx("toast-in pointer-events-auto rounded-lg border px-4 py-3 text-sm shadow-lg",
            t.tone === "ok" && "border-accent/30 bg-card text-ink", t.tone === "bad" && "border-danger/40 bg-card text-danger", t.tone === "info" && "border-line bg-card text-ink")}>
            {t.text}
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}

// ---------- Table ----------
export function Table({ head, children, className }: { head: ReactNode[]; children: ReactNode; className?: string }) {
  return (
    <div className={cx("overflow-x-auto", className)}>
      <table className="w-full border-collapse text-sm">
        <thead><tr>{head.map((h, i) => <th key={i} className="whitespace-nowrap border-b border-line px-4 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wider text-muted">{h}</th>)}</tr></thead>
        <tbody className="[&>tr]:border-b [&>tr]:border-line-2 [&>tr:last-child]:border-0">{children}</tbody>
      </table>
    </div>
  );
}
export const Td = ({ children, className, ...p }: { children?: ReactNode; className?: string; colSpan?: number }) => <td className={cx("px-4 py-3 align-top text-ink-2", className)} {...p}>{children}</td>;

export function LoadMore({ hasMore, loading, onClick }: { hasMore: boolean; loading: boolean; onClick: () => void }) {
  if (!hasMore) return null;
  return <div className="flex justify-center border-t border-line-2 p-3"><Button size="sm" loading={loading} onClick={onClick}>Load more</Button></div>;
}
