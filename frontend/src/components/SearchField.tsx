import { FormEvent, useEffect, useRef } from "react";

import { SearchIcon } from "../icons";

export { SearchIcon };

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
