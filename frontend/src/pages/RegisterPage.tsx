import { FormEvent, useState } from "react";
import { Link, useNavigate } from "react-router-dom";

import { ApiError, api } from "../api";
import { useAuth } from "../auth";
import type { User } from "../types";

export function RegisterPage() {
  const navigate = useNavigate();
  const { refresh } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [nickname, setNickname] = useState("");
  const [error, setError] = useState("");

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setError("");
    try {
      await api<{ user: User }>("/api/auth/register/", {
        method: "POST",
        body: JSON.stringify({ email, password, nickname }),
      });
      await refresh();
      navigate("/igra");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Registracija ni uspela.");
    }
  }

  return (
    <section className="panel narrow">
      <h1>Registracija</h1>
      <form onSubmit={onSubmit} className="stack">
        <label>
          E-pošta
          <input type="email" value={email} onChange={(event) => setEmail(event.target.value)} required />
        </label>
        <label>
          Geslo
          <input type="password" value={password} onChange={(event) => setPassword(event.target.value)} minLength={4} required />
        </label>
        <label>
          Vzdevek
          <input value={nickname} onChange={(event) => setNickname(event.target.value)} maxLength={30} required />
        </label>
        {error ? <p className="error">{error}</p> : null}
        <button className="primary" type="submit">
          Ustvari račun
        </button>
        <p className="fine">
          Že imaš račun? <Link to="/prijava">Prijava</Link>
        </p>
      </form>
    </section>
  );
}
