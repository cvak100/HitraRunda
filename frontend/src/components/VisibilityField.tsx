export type RoomVisibility = "public" | "private" | "unlisted";

/**
 * Vidnost sobe — enaka radio skupina v hubih in lobbyju.
 */
export function VisibilityField({
  value,
  onChange,
  password = "",
  onPasswordChange,
  showPassword = true,
  passwordPlaceholder = "",
  disabled = false,
}: {
  value: RoomVisibility;
  onChange: (next: RoomVisibility) => void;
  password?: string;
  onPasswordChange?: (next: string) => void;
  showPassword?: boolean;
  passwordPlaceholder?: string;
  disabled?: boolean;
}) {
  return (
    <>
      <fieldset disabled={disabled}>
        <legend>Vidnost</legend>
        <label className="check">
          <input
            type="radio"
            checked={value === "public"}
            disabled={disabled}
            onChange={() => onChange("public")}
          />
          Javna
        </label>
        <label className="check">
          <input
            type="radio"
            checked={value === "unlisted"}
            disabled={disabled}
            onChange={() => onChange("unlisted")}
          />
          Skrita
          <span className="fine"> (samo link)</span>
        </label>
        <label className="check">
          <input
            type="radio"
            checked={value === "private"}
            disabled={disabled}
            onChange={() => onChange("private")}
          />
          Zasebna
          <span className="fine"> (geslo)</span>
        </label>
      </fieldset>
      {showPassword && value === "private" && onPasswordChange ? (
        <label>
          Geslo
          <input
            value={password}
            disabled={disabled}
            onChange={(event) => onPasswordChange(event.target.value)}
            placeholder={passwordPlaceholder}
            required={!passwordPlaceholder}
          />
        </label>
      ) : null}
    </>
  );
}
