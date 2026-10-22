import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";

import { api } from "../api";
import { formatMode, formatPoints, formatWhen } from "../format";
import type { ScoreRow } from "../types";

type ModeStat = {
  mode: string;
  label: string;
  best_score: number;
  games: number;
};

type Profile = {
  nickname: string;
  modes: ModeStat[];
  recent: ScoreRow[];
};

export function ProfilePage() {
  const navigate = useNavigate();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    api<Profile>("/api/me/profile/")
      .then(setProfile)
      .catch(() => setError("Profila ni bilo mogoče naložiti."));
  }, []);

  return (
    <section className="panel">
      <p className="eyebrow">Račun</p>
      <h1>Profil</h1>
      {error ? <p className="error">{error}</p> : null}
      {profile ? (
        <>
          <p>
            Igraš kot <strong>{profile.nickname || "—"}</strong>.
          </p>
          <div className="game-split">
            {profile.modes.map((mode) => (
              <div key={mode.mode} className="game-block">
                <p className="eyebrow">{mode.label}</p>
                <h2>{formatPoints(mode.best_score)}</h2>
                <p className="fine">Najboljši rezultat · {mode.games} iger</p>
                <Link to={mode.mode === "ala_milijonar" ? "/lestvica/ala-milijonar" : "/lestvica/hitrarunda"}>
                  Lestvica
                </Link>
              </div>
            ))}
          </div>
          <h2>Zadnjih iger</h2>
          {profile.recent.length === 0 ? <p className="fine">Še ni iger.</p> : null}
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Igra</th>
                  <th>Točke</th>
                  <th>Pravilni</th>
                  <th>Kdaj</th>
                </tr>
              </thead>
              <tbody>
                {profile.recent.map((row) => (
                  <tr key={row.id} className="is-link" onClick={() => navigate(`/lestvica/rezultat/${row.id}`)}>
                    <td>{formatMode(row.mode)}</td>
                    <td>{formatPoints(row.score)}</td>
                    <td>
                      {row.correct_count}/{row.total_questions}
                    </td>
                    <td>{formatWhen(row.played_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      ) : null}
    </section>
  );
}
