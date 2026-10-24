"use client";

import {
  AlertOctagon,
  AlertTriangle,
  CheckCircle2,
  Loader2,
  PauseCircle,
  RefreshCw,
  XCircle,
  type LucideIcon,
} from "lucide-react";
import { forwardRef, useEffect, useId, useRef, type ButtonHTMLAttributes, type ReactNode } from "react";
import { cls } from "@/lib/format";
import { TONE_BG, TONE_HEX, type StatusIcon, type StatusInfo, type Tone } from "@/lib/status";

export const STATUS_ICONS: Record<StatusIcon, LucideIcon> = {
  check: CheckCircle2,
  alert: AlertTriangle,
  octagon: AlertOctagon,
  x: XCircle,
  backup: RefreshCw,
  pause: PauseCircle,
  spinner: Loader2,
};

type Variant = "primary" | "secondary" | "ghost" | "danger" | "subtle";

const VARIANT: Record<Variant, string> = {
  primary: "btn-glossy bg-brand text-white",
  secondary: "glass-btn text-ink",
  ghost: "text-ink-2 hover:bg-slate-100",
  danger: "btn-glossy bg-crit text-white",
  subtle: "bg-brand-50 text-brand-600 hover:bg-brand-100",
};

export const Button = forwardRef<HTMLButtonElement, ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: "sm" | "md"; icon?: LucideIcon }>(
  function Button({ variant = "secondary", size = "md", icon: Icon, className, children, ...rest }, ref) {
    return (
      <button
        ref={ref}
        className={cls(
          "inline-flex items-center justify-center gap-1.5 rounded-lg font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50",
          size === "sm" ? "h-8 px-2.5 text-[13px]" : "h-9 px-3.5 text-sm",
          VARIANT[variant],
          className,
        )}
        {...rest}
      >
        {Icon && <Icon aria-hidden className={size === "sm" ? "size-3.5" : "size-4"} />}
        {children}
      </button>
    );
  },
);

export function StatusBadge({ info, size = "md", className }: { info: StatusInfo; size?: "sm" | "md"; className?: string }) {
  const Icon = STATUS_ICONS[info.icon];
  return (
    <span
      className={cls(
        "inline-flex items-center gap-1 rounded-full font-medium whitespace-nowrap",
        size === "sm" ? "px-2 py-0.5 text-[11px]" : "px-2.5 py-1 text-xs",
        TONE_BG[info.tone],
        className,
      )}
    >
      <Icon aria-hidden className={cls(size === "sm" ? "size-3" : "size-3.5", info.icon === "spinner" && "animate-spin")} />
      {info.label}
    </span>
  );
}

export function Dot({ tone, className, pulse }: { tone: Tone; className?: string; pulse?: boolean }) {
  return (
    <span
      aria-hidden
      className={cls("inline-block size-2.5 shrink-0 rounded-full", pulse && "pulse-crit", className)}
      style={{ background: TONE_HEX[tone] }}
    />
  );
}

export function Card({ title, action, children, className, id }: { title?: ReactNode; action?: ReactNode; children: ReactNode; className?: string; id?: string }) {
  return (
    <section aria-labelledby={title && id ? id : undefined} className={cls("glass rounded-xl", className)}>
      {(title || action) && (
        <header className="flex items-center justify-between gap-2 px-4 pt-3.5 pb-2">
          {title && (
            <h3 id={id} className="text-[13px] font-semibold tracking-tight text-ink">
              {title}
            </h3>
          )}
          {action}
        </header>
      )}
      <div className="px-4 pb-4">{children}</div>
    </section>
  );
}

export function Tabs<T extends string>({ tabs, value, onChange, label }: { tabs: { id: T; label: string }[]; value: T; onChange: (v: T) => void; label: string }) {
  const id = useId();
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  return (
    <div role="tablist" aria-label={label} className="flex gap-1 border-b border-line">
      {tabs.map((t, i) => {
        const active = t.id === value;
        return (
          <button
            key={t.id}
            ref={(el) => {
              refs.current[i] = el;
            }}
            role="tab"
            id={`${id}-${t.id}`}
            aria-selected={active}
            tabIndex={active ? 0 : -1}
            onClick={() => onChange(t.id)}
            onKeyDown={(e) => {
              if (e.key === "ArrowRight" || e.key === "ArrowLeft") {
                e.preventDefault();
                const next = (i + (e.key === "ArrowRight" ? 1 : tabs.length - 1)) % tabs.length;
                onChange(tabs[next].id);
                refs.current[next]?.focus();
              }
            }}
            className={cls(
              "relative -mb-px px-2.5 pt-1.5 pb-2 text-[13px] font-medium transition-colors",
              active ? "text-brand" : "text-muted hover:text-ink",
            )}
          >
            {t.label}
            {active && <span aria-hidden className="absolute inset-x-1 bottom-0 h-0.5 rounded-full bg-brand" />}
          </button>
        );
      })}
    </div>
  );
}

export function Meter({ value, tone, label }: { value: number; tone: Tone; label: string }) {
  const v = Math.max(0, Math.min(100, value));
  return (
    <div role="meter" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(v)} aria-label={label} className="h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
      <div className="h-full rounded-full transition-[width] duration-500" style={{ width: `${v}%`, background: TONE_HEX[tone] }} />
    </div>
  );
}

export function KeyValue({ k, v, className }: { k: ReactNode; v: ReactNode; className?: string }) {
  return (
    <div className={cls("flex items-baseline justify-between gap-3 py-1.5 text-[13px]", className)}>
      <dt className="text-muted">{k}</dt>
      <dd className="tabular text-right font-medium text-ink">{v}</dd>
    </div>
  );
}

export function SimTag({ className, children = "Simulated" }: { className?: string; children?: ReactNode }) {
  return (
    <span className={cls("inline-flex items-center rounded-md border border-dashed border-line-strong px-1.5 py-px text-[10px] font-semibold tracking-wide text-muted uppercase", className)}>
      {children}
    </span>
  );
}

export function Kbd({ children }: { children: ReactNode }) {
  return <kbd className="rounded border border-line bg-slate-50 px-1.5 py-0.5 font-mono text-[11px] text-ink-2">{children}</kbd>;
}

/** Accessible modal dialog with focus trap and Escape to close. */
export function Dialog({ open, onClose, title, children, wide, footer }: { open: boolean; onClose: () => void; title: string; children: ReactNode; wide?: boolean; footer?: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const titleId = useId();
  useEffect(() => {
    if (!open) return;
    const prev = document.activeElement as HTMLElement | null;
    const el = ref.current;
    const focusables = () => Array.from(el?.querySelectorAll<HTMLElement>('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])') ?? []).filter((n) => !n.hasAttribute("disabled"));
    focusables()[0]?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onClose();
      }
      if (e.key === "Tab") {
        const f = focusables();
        if (!f.length) return;
        const first = f[0];
        const last = f[f.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener("keydown", onKey, true);
    return () => {
      document.removeEventListener("keydown", onKey, true);
      prev?.focus();
    };
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4 backdrop-blur-[2px]" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div ref={ref} role="dialog" aria-modal="true" aria-labelledby={titleId} className={cls("glass fade-in flex max-h-[88vh] w-full flex-col overflow-hidden rounded-2xl bg-white/90 shadow-2xl", wide ? "max-w-3xl" : "max-w-lg")}>
        <div className="flex items-center justify-between border-b border-line px-5 py-3.5">
          <h2 id={titleId} className="text-base font-semibold text-ink">
            {title}
          </h2>
          <button onClick={onClose} className="rounded-md px-2 py-1 text-sm text-muted hover:bg-slate-100 hover:text-ink" aria-label="Close dialog">
            Close
          </button>
        </div>
        <div className="scroll-thin min-h-0 flex-1 overflow-y-auto px-5 py-4">{children}</div>
        {footer && <div className="flex items-center justify-end gap-2 border-t border-line bg-slate-50/60 px-5 py-3">{footer}</div>}
      </div>
    </div>
  );
}

export function EmptyState({ icon: Icon, title, children }: { icon: LucideIcon; title: string; children?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 px-6 py-10 text-center">
      <span className="grid size-10 place-items-center rounded-full bg-slate-100 text-muted">
        <Icon aria-hidden className="size-5" />
      </span>
      <p className="text-sm font-medium text-ink">{title}</p>
      {children && <div className="max-w-sm text-[13px] text-muted">{children}</div>}
    </div>
  );
}

/** Tiny SVG sparkline for trend context in panels. */
export function Sparkline({ values, color = "#1d6fe0", height = 28, min, max, label }: { values: number[]; color?: string; height?: number; min?: number; max?: number; label: string }) {
  const w = 120;
  if (values.length < 2) return <div style={{ height }} aria-hidden />;
  const lo = min ?? Math.min(...values);
  const hi = max ?? Math.max(...values);
  const span = hi - lo || 1;
  const pts = values.map((v, i) => `${(i / (values.length - 1)) * w},${height - 2 - ((v - lo) / span) * (height - 4)}`).join(" ");
  return (
    <svg role="img" aria-label={label} viewBox={`0 0 ${w} ${height}`} preserveAspectRatio="none" className="w-full" style={{ height }}>
      <polyline points={pts} fill="none" stroke={color} strokeWidth={1.6} vectorEffect="non-scaling-stroke" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}
