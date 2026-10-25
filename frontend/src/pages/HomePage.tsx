import { FormEvent, useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";

import { ApiError, api } from "../api";
import { useAuth } from "../auth";
import { NicknameField } from "../components/NicknameField";
import { GameModeRows } from "../gameModes";
import type { User } from "../types";

export function HomePage() {
  const { user, refresh } = useAuth();
  const navigate = useNavigate();
  const [nickname, setNickname] = useState("");
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);

  useEffect(() => {
    if (user) return;
    let cancelled = false;
    api<{ nickname: string }>("/api/auth/nickname/")
      .then((data) => {
        if (!cancelled && data.nickname) setNickname(data.nickname);
      })
      .catch(() => {
        /* polje ostane prazno — uporabnik lahko še vedno vnese */
      });
    return () => {
      cancelled = true;
    };
  }, [user]);

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
      <h1>Pozdravljeni na Hitri rundi</h1>
      <p className="lead home-intro">
        Tukaj tekmuješ v kratkih rundah iz različnih kategorij vprašanj. Igraj solo, izzovi računalnik ali odpri sobo
        in tekmuj s prijatelji. Na voljo imaš različne načine — od hitrih solo rund do daljših izzivov z jokerji in
        tekmovanja v živo.
      </p>
      <p className="lead home-intro">
        Vsi načini uporabljajo isto bazo vprašanj, tako da izbiraš kategorije in se meriš v hitrosti, natančnosti ali
        strategiji.
      </p>
      <p className="lead home-intro">
        Začneš lahko kot gost z naključnim vzdevkom (lahko ga spremeniš); ko se prijaviš, rezultati ostanejo in se
        zabeležijo na lestvici.
      </p>

      {!user ? (
        <form onSubmit={onSubmit} className="stack home-guest">
          <NicknameField value={nickname} onChange={setNickname} required />
          <p className="fine">
            Predlagan je naključni vzdevek — lahko ga spremeniš ali vržeš novega s kocko.
          </p>
          <div className="actions">
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

      <GameModeRows lockedHint={user ? undefined : "Najprej vzdevek zgoraj."} />
    </section>
  );
}