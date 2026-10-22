import { FormEvent, useState } from "react";
import { Link, useNavigate } from "react-router-dom";

import { ApiError, api } from "../api";
import { useAuth } from "../auth";
import type { User } from "../types";

export function HomePage() {
  const { user, refresh } = useAuth();
  const navigate = useNavigate();
  const [nickname, setNickname] = useState("");
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);

  async function generate() {
    const data = await api<{ nickname: string }>("/api/auth/nickname/");
    setNickname(data.nickname);
  }

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setPending(true);
    setError("");
    try {
      await api<{ user: User }>("/api/auth/guest/", {
        method: "POST",
        body: JSON.stringify({ nickname }),
      });
      await refresh();
      navigate("/igra");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Gost ni ustvarjen.");
    } finally {
      setPending(false);
    }
  }

  return (
    <section className="panel hero">
      <p className="eyebrow">Hitra runda</p>
      <h1>Kratke runde. En napačen odgovor.</h1>
      <p className="lead">
        Čas teče na strežniku. Na lestvico gre dosežena nagrada in majhen bonus za hitrost. Gost se sčasoma pobriše, rezultat ostane.
      </p>
      {user ? (
        <div className="game-split">
          <div className="game-block">
            <p className="eyebrow">Hitra runda</p>
            <h2>Brez jokerjev</h2>
            <p>5–15 vprašanj, lastna lestvica.</p>
            <Link className="primary" to="/igra/hitrarunda">
              Igraj Hitra runda
            </Link>
          </div>
          <div className="game-block">
            <p className="eyebrow">Ala milijonar</p>
            <h2>15 vprašanj + jokerji</h2>
            <p>Polovička, publika, klic — lastna lestvica.</p>
            <Link className="primary" to="/igra/ala-milijonar">
              Igraj Ala milijonar
            </Link>
          </div>
        </div>
      ) : (
        <form onSubmit={onSubmit} className="stack">
          <label>
            Vzdevek
            <input value={nickname} onChange={(event) => setNickname(event.target.value)} maxLength={30} required />
          </label>
          <div className="actions">
            <button type="button" onClick={() => void generate()}>
              Naključni vzdevek
            </button>
            <button className="primary" type="submit" disabled={pending}>
              Igraj kot gost
            </button>
          </div>
          {error ? <p className="error">{error}</p> : null}
          <p className="fine">
            Imaš račun? <Link to="/prijava">Prijava</Link> ali <Link to="/registracija">registracija</Link>.
          </p>
        </form>
      )}
    </section>
  );
}
