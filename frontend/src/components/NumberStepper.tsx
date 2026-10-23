type Props = {
  label: string;
  value: number;
  options?: number[];
  min?: number;
  max?: number;
  step?: number;
  format?: (value: number) => string;
  onChange: (value: number) => void;
};

export function NumberStepper({ label, value, options, min = 0, max = 10, step = 1, format, onChange }: Props) {
  function prev() {
    if (options?.length) {
      const index = options.indexOf(value);
      const nextIndex = index <= 0 ? 0 : index - 1;
      onChange(options[nextIndex]);
      return;
    }
    onChange(Math.max(min, value - step));
  }

  function next() {
    if (options?.length) {
      const index = options.indexOf(value);
      const nextIndex = index < 0 ? 0 : Math.min(options.length - 1, index + 1);
      onChange(options[nextIndex]);
      return;
    }
    onChange(Math.min(max, value + step));
  }

  const atMin = options?.length ? options.indexOf(value) <= 0 : value <= min;
  const atMax = options?.length ? options.indexOf(value) >= options.length - 1 : value >= max;

  return (
    <div className="stepper" role="group" aria-label={label}>
      <span className="stepper-label">{label}</span>
      <div className="stepper-controls">
        <button type="button" aria-label="Manj" disabled={atMin} onClick={prev}>
          ‹
        </button>
        <strong>{format ? format(value) : value}</strong>
        <button type="button" aria-label="Več" disabled={atMax} onClick={next}>
          ›
        </button>
      </div>
    </div>
  );
}
