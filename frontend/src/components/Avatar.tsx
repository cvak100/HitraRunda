import { avatarLabel, avatarSrc } from "../avatars";

type Props = {
  avatar?: string | null;
  /** Samo rob — ilustracija znotraj je fiksna. */
  color?: string;
  size?: number;
  className?: string;
  title?: string;
};

const BG = "#1a211c";

/**
 * Risani avatarji (JPG). `color` = samo border.
 */
export function Avatar({ avatar, color = "#7dcea0", size = 56, className = "", title }: Props) {
  const src = avatarSrc(avatar);
  const label = title || avatarLabel(avatar) || undefined;
  return (
    <span
      className={`avatar-icon ${className}`.trim()}
      style={{
        width: size,
        height: size,
        border: `3px solid ${color}`,
        background: BG,
        boxSizing: "border-box",
        display: "inline-grid",
        placeItems: "center",
        overflow: "hidden",
        userSelect: "none",
      }}
      title={label}
      role="img"
      aria-label={label}
    >
      <img
        src={src}
        alt=""
        draggable={false}
        style={{
          width: "100%",
          height: "100%",
          objectFit: "cover",
          display: "block",
        }}
      />
    </span>
  );
}

/** @deprecated uporabi Avatar */
export const ProfileAvatar = Avatar;
