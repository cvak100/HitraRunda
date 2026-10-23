import { FormEvent, useState } from "react";

import { ApiError, api } from "../api";
import { useAuth } from "../auth";
import { NicknameField } from "../components/NicknameField";
import type { User } from "../types";

export function SettingsPage() {
  const { user, refresh } = useAuth();
  const [nickname, setNickname] = useState(user?.nickname ?? "");
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setError("");
    setNotice("");
    try {
      await api<{ user: User }>("/api/auth/me/", {
        method: "PATCH",
        body: JSON.stringify({ nickname }),
      });
      await refresh();
      setNotice("Vzdevek je shranjen.");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Vzdevka ni bilo mogoče shraniti.");
    }
  }

  return (
    <section className="panel narrow">
      <p className="eyebrow">Račun</p>
      <h1>Nastavitve</h1>
      <form className="stack" onSubmit={onSubmit}>
        <NicknameField value={nickname} onChange={setNickname} required />
        {notice ? <p className="fine">{notice}</p> : null}
        {error ? <p className="error">{error}</p> : null}
        <button type="submit" className="primary">
          Shrani
        </button>
      </form>
    </section>
  );
}
