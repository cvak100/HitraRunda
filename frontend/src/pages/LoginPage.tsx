import { FormEvent, useState } from "react";
import { Link, useNavigate } from "react-router-dom";

import { ApiError, api } from "../api";
import { useAuth } from "../auth";
import type { User } from "../types";

export function LoginPage() {
  const navigate = useNavigate();
  const { refresh } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setError("");
    try {
      await api<{ user: User }>("/api/auth/login/", {
        method: "POST",
        body: JSON.stringify({ email, password }),
      });
      await refresh();
      navigate("/igra");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Prijava ni uspela.");
    }
  }

  return (
    <section className="panel narrow">
      <h1>Prijava</h1>
      <form onSubmit={onSubmit} className="stack">
        <label>
          E-pošta
          <input type="email" value={email} onChange={(event) => setEmail(event.target.value)} required />
        </label>
        <label>
          Geslo
          <input type="password" value={password} onChange={(event) => setPassword(event.target.value)} required />
        </label>
        {error ? <p className="error">{error}</p> : null}
        <button className="primary" type="submit">
          Vstopi
        </button>
        <p className="fine">
          <Link to="/pozabljeno-geslo">Pozabljeno geslo?</Link>
        </p>
        <p className="fine">
          Še nimaš računa? <Link to="/registracija">Registracija</Link>
        </p>
      </form>
    </section>
  );
}
