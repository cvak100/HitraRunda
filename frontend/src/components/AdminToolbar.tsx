import { ReactNode, useEffect, useId, useRef, useState } from "react";

import { SearchField } from "./SearchField";

const LIMITS = ["20", "50", "100", "200", "all"] as const;

export type AdminLimit = (typeof LIMITS)[number];

function limitLabel(value: AdminLimit) {
  return value === "all" ? "Vse" : value;
}

function LimitMenu({ value, onChange }: { value: AdminLimit; onChange: (value: AdminLimit) => void }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const labelId = useId();

  useEffect(() => {
    if (!open) return;
    function onPointer(event: MouseEvent) {
      if (!ref.current?.contains(event.target as Node)) setOpen(false);
    }
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div className="limit" ref={ref}>
      <span id={labelId}>Prikaži</span>
      <div className="limit-menu">
        <button
          type="button"
          className="limit-trigger"
          aria-haspopup="listbox"
          aria-expanded={open}
          aria-labelledby={labelId}
          onClick={() => setOpen((current) => !current)}
        >
          {limitLabel(value)}
        </button>
        {open ? (
          <ul className="limit-panel" role="listbox" aria-labelledby={labelId}>
            {LIMITS.map((item) => (
              <li key={item} role="presentation">
                <button
                  type="button"
                  role="option"
                  aria-selected={item === value}
                  className={item === value ? "is-on" : undefined}
                  onClick={() => {
                    onChange(item);
                    setOpen(false);
                  }}
                >
                  {limitLabel(item)}
                </button>
              </li>
            ))}
          </ul>
        ) : null}
      </div>
    </div>
  );
}

export function AdminToolbar({
  query,
  onQueryChange,
  onSearch,
  limit,
  onLimitChange,
  onAdd,
  addLabel = "Dodaj",
  children,
}: {
  query?: string;
  onQueryChange?: (value: string) => void;
  onSearch?: () => void;
  limit?: AdminLimit;
  onLimitChange?: (value: AdminLimit) => void;
  onAdd?: () => void;
  addLabel?: string;
  children?: ReactNode;
}) {
  return (
    <div className="admin-toolbar">
      <div className="admin-toolbar-left">{children}</div>
      <div className="admin-toolbar-right">
        {limit != null && onLimitChange ? <LimitMenu value={limit} onChange={onLimitChange} /> : null}
        {query != null && onQueryChange && onSearch ? (
          <SearchField value={query} onChange={onQueryChange} onSubmit={onSearch} />
        ) : null}
        {onAdd ? (
          <button type="button" className="icon-button add-button" aria-label={addLabel} title={addLabel} onClick={onAdd}>
            +
          </button>
        ) : null}
      </div>
    </div>
  );
}

export function SortableTh({
  label,
  column,
  sort,
  direction,
  onSort,
  title,
}: {
  label: string;
  column: string;
  sort: string;
  direction: "asc" | "desc";
  onSort: (column: string) => void;
  title?: string;
}) {
  const active = sort === column;
  return (
    <th className={column ? `col-${column}` : undefined}>
      <button
        type="button"
        className={active ? "sort is-on" : "sort"}
        title={title || label}
        aria-label={title || label}
        onClick={() => onSort(column)}
      >
        <span className="sort-label">{label}</span>
        <span className="sort-arrow" aria-hidden="true">
          <span className={active && direction === "asc" ? "is-shown" : undefined}>↑</span>
          <span className={active && direction === "desc" ? "is-shown" : undefined}>↓</span>
        </span>
      </button>
    </th>
  );
}
