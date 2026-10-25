import { FormEvent, useState } from "react";
import { Link } from "react-router-dom";

import { ApiError, api } from "../api";
import { useAuth } from "../auth";
import { AVATAR_COLORS, AVATARS, DEFAULT_AVATAR_COLOR, avatarLabel } from "../avatars";
import { Avatar } from "../components/Avatar";
import { NicknameField } from "../components/NicknameField";
import { isSfxEnabled, playSfx, setSfxEnabled, unlockSfx } from "../sound";
import type { User } from "../types";

export function SettingsPage() {
  const { user, refresh } = useAuth();
  const [nickname, setNickname] = useState(user?.nickname ?? "");
  const [preferredColor, setPreferredColor] = useState(user?.preferred_color || DEFAULT_AVATAR_COLOR);
  const [avatar, setAvatar] = useState(user?.avatar || "ris");
  const [sfxOn, setSfxOn] = useState(() => isSfxEnabled());
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setError("");
    setNotice("");
    try {
      await api<{ user: User }>("/api/auth/me/", {
        method: "PATCH",
        body: JSON.stringify({
          nickname,
          preferred_color: preferredColor,
          avatar,
        }),
      });
      await refresh();
      setNotice("Shranjeno.");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Shranjevanje ni uspelo.");
    }
  }

  async function onPasswordSubmit(event: FormEvent) {
    event.preventDefault();
    setError("");
    setNotice("");
    try {
      const result = await api<{ detail: string }>("/api/auth/password/", {
        method: "POST",
        body: JSON.stringify({ current_password: currentPassword, new_password: newPassword }),
      });
      setCurrentPassword("");
      setNewPassword("");
      setNotice(result.detail);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Sprememba gesla ni uspela.");
    }
  }

  return (
    <section className="panel narrow">
      <p className="eyebrow">Račun</p>
      <h1>Nastavitve</h1>
      {user?.is_guest ? (
        <p className="fine">
          Igraš kot gost.{" "}
          <Link to="/registracija">Ustvari račun</Link>, da rezultati ostanejo in dobiš geslo.
        </p>
      ) : null}

      <form className="stack" onSubmit={onSubmit}>
        <div className="profile-hero">
          <Avatar avatar={avatar} color={preferredColor} size={72} title={avatarLabel(avatar)} />
          <p className="fine" style={{ margin: 0 }}>
            {avatarLabel(avatar)}
          </p>
        </div>
        <NicknameField value={nickname} onChange={setNickname} required />
        <fieldset>
          <legend>Avatar</legend>
          <div className="avatar-picker" role="list">
            {AVATARS.map((item) => (
              <button
                key={item.key}
                type="button"
                className={`avatar-pick${avatar === item.key ? " is-on" : ""}`}
                title={item.label}
                aria-label={item.label}
                aria-pressed={avatar === item.key}
                onClick={() => setAvatar(item.key)}
              >
                <Avatar avatar={item.key} color={preferredColor} size={48} />
                <span>{item.label}</span>
              </button>
            ))}
          </div>
        </fieldset>
        <fieldset>
          <legend>Barva roba</legend>
          <div className="color-swatches" role="list">
            {AVATAR_COLORS.map((c) => (
              <button
                key={c}
                type="button"
                className={`color-swatch${preferredColor === c ? " is-on" : ""}`}
                style={{ background: c }}
                aria-label={c}
                onClick={() => setPreferredColor(c)}
              />
            ))}
          </div>
        </fieldset>
        <button type="submit" className="primary">
          Shrani
        </button>
      </form>

      <fieldset style={{ marginTop: 28 }}>
        <legend>Zvok</legend>
        <label className="check">
          <input
            type="checkbox"
            checked={sfxOn}
            onChange={(event) => {
              unlockSfx();
              const on = event.target.checked;
              setSfxOn(on);
              setSfxEnabled(on);
              if (on) playSfx("click");
            }}
          />
          Zvočni učinki v igri
        </label>
      </fieldset>

      {!user?.is_guest ? (
        <form className="stack" style={{ marginTop: 28 }} onSubmit={onPasswordSubmit}>
          <h2>Geslo</h2>
          <label>
            Trenutno geslo
            <input
              type="password"
              value={currentPassword}
              onChange={(event) => setCurrentPassword(event.target.value)}
              required
            />
          </label>
          <label>
            Novo geslo
            <input
              type="password"
              value={newPassword}
              onChange={(event) => setNewPassword(event.target.value)}
              minLength={4}
              required
            />
          </label>
          <button type="submit" className="primary">
            Spremeni geslo
          </button>
        </form>
      ) : null}

      {notice ? <p className="fine">{notice}</p> : null}
      {error ? <p className="error">{error}</p> : null}
    </section>
  );
}
