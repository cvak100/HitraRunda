import { api } from "../api";

type Props = {
  label?: string;
  value: string;
  onChange: (value: string) => void;
  required?: boolean;
  maxLength?: number;
  hint?: string;
};

export function NicknameField({
  label = "Vzdevek",
  value,
  onChange,
  required,
  maxLength = 30,
  hint,
}: Props) {
  async function roll() {
    const data = await api<{ nickname: string }>("/api/auth/nickname/");
    onChange(data.nickname.slice(0, maxLength));
  }

  return (
    <label className="nick-label">
      {label}
      <div className="nick-field">
        <input
          value={value}
          onChange={(event) => onChange(event.target.value)}
          maxLength={maxLength}
          required={required}
        />
        <button type="button" className="nick-dice" title="Naključni vzdevek" onClick={() => void roll()}>
          🎲
        </button>
      </div>
      {hint ? <span className="nick-hint">{hint}</span> : null}
    </label>
  );
}
