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
      <h1>Več iger. En napačen odgovor.</h1>
      <p className="lead">
        Hitra runda je zbirka solo kvizov. Izbereš igro, odgovarjaš proti uri na strežniku, rezultat gre na lastno
        lestvico. Gost se sčasoma pobriše, rezultat ostane.
      </p>

      {!user ? (
        <form onSubmit={onSubmit} className="stack home-guest">
          <label>
            Vzdevek
            <input value={nickname} onChange={(event) => setNickname(event.target.value)} maxLength={30} required />
          </label>
          <div className="actions">
            <button type="button" onClick={() => void generate()}>
              Naključni vzdevek
            </button>
            <button className="primary" type="submit" disabled={pending}>
              Nadaljuj kot gost
            </button>
          </div>
          {error ? <p className="error">{error}</p> : null}
          <p className="fine">
            Imaš račun? <Link to="/prijava">Prijava</Link> ali <Link to="/registracija">registracija</Link>.
          </p>
        </form>
      ) : (
        <p className="fine">
          Igraš kot <strong>{user.nickname || "gost"}</strong>.
        </p>
      )}

      <div className="game-rows">
        <article className="game-row">
          <div>
            <p className="eyebrow">Kratke solo runde</p>
            <h2>Hitra runda</h2>
            <p>
              5–15 vprašanj iz izbranih kategorij. Brez jokerjev — šteje hitrost. 
            </p>
          </div>
          {user ? (
            <Link className="primary" to="/igra/hitrarunda">
              Igraj
            </Link>
          ) : (
            <p className="fine">Najprej vzdevek zgoraj.</p>
          )}
        </article>
        <article className="game-row">
          <div>
            <p className="eyebrow">15 stopenj z jokerji</p>
            <h2>Ala milijonar</h2>
            <p>
              Vprašanja s 4 odgovori, 90 s na vprašanje, težavnost 1→5. Polovička, glas ljudstva, klic v sili.
            </p>
          </div>
          {user ? (
            <Link className="primary" to="/igra/ala-milijonar">
              Igraj
            </Link>
          ) : (
            <p className="fine">Najprej vzdevek zgoraj.</p>
          )}
        </article>
        <article className="game-row">
          <div>
            <p className="eyebrow">Skupaj proti uri</p>
            <h2>Več igralcev</h2>
            <p>Soba s kodo ali linkom, ready check, ista vprašanja, rundni bonus in lestvica med rundami.</p>
          </div>
          {user ? (
            <Link className="primary" to="/igra/vec-igralcev">
              Igraj
            </Link>
          ) : (
            <p className="fine">Najprej vzdevek zgoraj.</p>
          )}
        </article>
      </div>
    </section>
  );
}
