import { FormEvent, useMemo, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";

import { ApiError, api } from "../api";

export function ResetPasswordPage() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const uid = useMemo(() => params.get("uid") || "", [params]);
  const token = useMemo(() => params.get("token") || "", [params]);
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setError("");
    setNotice("");
    try {
      const result = await api<{ detail: string }>("/api/auth/password-reset/confirm/", {
        method: "POST",
        body: JSON.stringify({ uid, token, password }),
      });
      setNotice(result.detail);
      setTimeout(() => navigate("/prijava"), 1200);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Ponastavitev ni uspela.");
    }
  }

  if (!uid || !token) {
    return (
      <section className="panel narrow">
        <h1>Ponastavitev gesla</h1>
        <p className="error">Povezava je nepopolna.</p>
        <p className="fine">
          <Link to="/pozabljeno-geslo">Zahtevaj novo povezavo</Link>
        </p>
      </section>
    );
  }

  return (
    <section className="panel narrow">
      <h1>Novo geslo</h1>
      <form onSubmit={onSubmit} className="stack">
        <label>
          Novo geslo
          <input
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            minLength={4}
            required
          />
        </label>
        {notice ? <p className="fine">{notice}</p> : null}
        {error ? <p className="error">{error}</p> : null}
        <button className="primary" type="submit">
          Shrani geslo
        </button>
      </form>
    </section>
  );
}
