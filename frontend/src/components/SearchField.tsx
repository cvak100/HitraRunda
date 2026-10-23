import { FormEvent, useEffect, useRef } from "react";

export function SearchField({
  value,
  onChange,
  onSubmit,
  autoFocus,
}: {
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  autoFocus?: boolean;
}) {
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (autoFocus) inputRef.current?.focus();
  }, [autoFocus]);

  function submit(event: FormEvent) {
    event.preventDefault();
    onSubmit();
  }

  return (
    <form className="search-line" onSubmit={submit}>
      <input
        ref={inputRef}
        type="search"
        aria-label="Išči"
        placeholder="Vzdevek…"
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
      <button type="submit" className="icon-button" aria-label="Išči">
        <SearchIcon />
      </button>
    </form>
  );
}

export function SearchIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="11" cy="11" r="6" fill="none" stroke="currentColor" strokeWidth="2" />
      <path d="M16 16l5 5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}
