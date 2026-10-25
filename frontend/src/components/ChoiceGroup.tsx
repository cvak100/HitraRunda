/**
 * Skupina izbirnih gumbov (čas, kontinent, …) — enak look povsod.
 * Single: `value` + `onChange`.
 * Multi: `values` + `onValuesChange` (+ opcijsko `selectAllLabel`).
 */
export function ChoiceGroup<T extends string | number>({
  label,
  options,
  value,
  onChange,
  values,
  onValuesChange,
  selectAllLabel,
  format,
  hint,
  disabled = false,
}: {
  label: string;
  options: T[];
  value?: T;
  onChange?: (next: T) => void;
  values?: T[];
  onValuesChange?: (next: T[]) => void;
  /** Če podano, doda gumb »vsi« (samo multi). */
  selectAllLabel?: string;
  format?: (option: T) => string;
  hint?: string;
  disabled?: boolean;
}) {
  const multi = Array.isArray(values) && typeof onValuesChange === "function";
  const allOn = multi && options.length > 0 && options.every((option) => values!.includes(option));

  function toggle(option: T) {
    if (!multi || !onValuesChange) return;
    const current = values || [];
    onValuesChange(
      current.includes(option) ? current.filter((item) => item !== option) : [...current, option],
    );
  }

  function toggleAll() {
    if (!multi || !onValuesChange) return;
    onValuesChange(allOn ? [] : [...options]);
  }

  return (
    <div className="stack-gap choice-group">
      <span className="stepper-label">{label}</span>
      {hint ? <p className="fine">{hint}</p> : null}
      <div className="choices" role="group" aria-label={label}>
        {multi && selectAllLabel ? (
          <button
            type="button"
            className={allOn ? "is-on" : ""}
            disabled={disabled || !options.length}
            onClick={toggleAll}
          >
            {selectAllLabel}
          </button>
        ) : null}
        {options.map((option) => {
          const on = multi ? Boolean(values?.includes(option)) : option === value;
          return (
            <button
              key={String(option)}
              type="button"
              className={on ? "is-on" : ""}
              disabled={disabled}
              onClick={() => (multi ? toggle(option) : onChange?.(option))}
            >
              {format ? format(option) : String(option)}
            </button>
          );
        })}
      </div>
    </div>
  );
}
