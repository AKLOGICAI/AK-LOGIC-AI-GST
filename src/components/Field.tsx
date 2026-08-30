import { useId, useRef, useEffect, type InputHTMLAttributes, type TextareaHTMLAttributes } from 'react';

interface FieldProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string;
  hint?: string;
  /** Validation error message. When present, the field turns rose/red,
   *  gets aria-invalid + aria-describedby wired to the message for screen
   *  readers, and scrolls itself into view the moment it appears — so a
   *  validation failure on a field scrolled off-screen is never silent. */
  error?: string;
}

export function Field({ label, hint, error, className = '', id, ...rest }: FieldProps) {
  const autoId = useId();
  const inputId = id || autoId;
  const errorId = `${inputId}-error`;
  const ref = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (error) ref.current?.scrollIntoView({ block: 'center', behavior: 'smooth' });
  }, [error]);

  return (
    <label className="block" htmlFor={inputId}>
      <span className="text-xs font-medium tracking-wide text-[var(--color-mist)] uppercase">{label}</span>
      <input
        {...rest}
        id={inputId}
        ref={ref}
        aria-invalid={!!error || undefined}
        aria-describedby={error ? errorId : hint ? `${inputId}-hint` : undefined}
        className={`mt-1.5 w-full rounded-xl bg-[#0c1322] border px-4 py-3 text-[var(--color-ivory)] placeholder:text-[var(--color-mist-2)] outline-none transition focus:ring-2 ${error ? 'border-[var(--color-rose)] focus:border-[var(--color-rose)] focus:ring-[rgba(255,107,136,0.15)]' : 'border-[var(--color-line)] focus:border-[var(--color-aqua)] focus:ring-[rgba(56,224,200,0.15)]'} ${className}`}
      />
      {error ? (
        <span id={errorId} role="alert" className="text-[11px] text-[var(--color-rose)] mt-1 block">{error}</span>
      ) : hint ? (
        <span id={`${inputId}-hint`} className="text-[11px] text-[var(--color-mist-2)] mt-1 block">{hint}</span>
      ) : null}
    </label>
  );
}

/**
 * PinField — a masked numeric MPIN input that does NOT trigger the browser's
 * password manager (no type="password"). It uses an obscuring font/letter-
 * spacing trick plus autocomplete="off" + a one-time-code hint so Chrome /
 * Google Password Manager never offers to "save password".
 */
interface PinFieldProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> {
  label: string;
  hint?: string;
}

export function PinField({ label, hint, className = '', value, ...rest }: PinFieldProps) {
  return (
    <label className="block">
      <span className="text-xs font-medium tracking-wide text-[var(--color-mist)] uppercase">{label}</span>
      <input
        {...rest}
        value={value}
        type="text"
        inputMode="numeric"
        autoComplete="off"
        autoCorrect="off"
        autoCapitalize="off"
        spellCheck={false}
        data-lpignore="true"
        data-1p-ignore="true"
        data-form-type="other"
        style={{ WebkitTextSecurity: value ? 'disc' : undefined, letterSpacing: '0.4em', fontFamily: 'var(--font-mono, monospace)' } as React.CSSProperties}
        className={`mt-1.5 w-full rounded-xl bg-[#0c1322] border border-[var(--color-line)] px-4 py-3 text-[var(--color-ivory)] placeholder:text-[var(--color-mist-2)] placeholder:tracking-normal outline-none transition focus:border-[var(--color-aqua)] focus:ring-2 focus:ring-[rgba(56,224,200,0.15)] ${className}`}
      />
      {hint && <span className="text-[11px] text-[var(--color-mist-2)] mt-1 block">{hint}</span>}
    </label>
  );
}

interface AreaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  label: string;
}

export function Area({ label, className = '', ...rest }: AreaProps) {
  return (
    <label className="block">
      <span className="text-xs font-medium tracking-wide text-[var(--color-mist)] uppercase">{label}</span>
      <textarea
        {...rest}
        className={`mt-1.5 w-full rounded-xl bg-[#0c1322] border border-[var(--color-line)] px-4 py-3 text-[var(--color-ivory)] placeholder:text-[var(--color-mist-2)] outline-none transition focus:border-[var(--color-aqua)] focus:ring-2 focus:ring-[rgba(56,224,200,0.15)] resize-none ${className}`}
      />
    </label>
  );
}
