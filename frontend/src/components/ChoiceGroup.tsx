/**
 * Skupina izbirnih gumbov (čas, cilj točk, …) — enak look povsod.
 */
export function ChoiceGroup<T extends string | number>({
  label,
  options,
  value,
  onChange,
  format,
  disabled = false,
}: {
  label: string;
  options: T[];
  value: T;
  onChange: (next: T) => void;
  format?: (option: T) => string;
  disabled?: boolean;
}) {
  return (
    <div className="stack-gap choice-group">
      <span className="stepper-label">{label}</span>
      <div className="choices" role="group" aria-label={label}>
        {options.map((option) => (
          <button
            key={String(option)}
            type="button"
            className={option === value ? "is-on" : ""}
            disabled={disabled}
            onClick={() => onChange(option)}
          >
            {format ? format(option) : String(option)}
          </button>
        ))}
      </div>
    </div>
  );
}
