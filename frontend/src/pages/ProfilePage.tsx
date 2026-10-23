import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";

import { SortableTh } from "../components/AdminToolbar";
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

type SortKey = "mode" | "score" | "correct_count" | "played_at";

export function ProfilePage() {
  const navigate = useNavigate();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [error, setError] = useState("");
  const [sort, setSort] = useState<SortKey>("played_at");
  const [direction, setDirection] = useState<"asc" | "desc">("desc");

  useEffect(() => {
    api<Profile>("/api/me/profile/")
      .then(setProfile)
      .catch(() => setError("Profila ni bilo mogoče naložiti."));
  }, []);

  const recent = useMemo(() => {
    const list = [...(profile?.recent ?? [])];
    list.sort((a, b) => {
      let cmp = 0;
      if (sort === "played_at") cmp = new Date(a.played_at).getTime() - new Date(b.played_at).getTime();
      else if (sort === "mode") cmp = formatMode(a.mode).localeCompare(formatMode(b.mode), "sl");
      else cmp = Number(a[sort]) - Number(b[sort]);
      return direction === "asc" ? cmp : -cmp;
    });
    return list;
  }, [profile, sort, direction]);

  function toggleSort(column: string) {
    const key = column as SortKey;
    if (sort === key) setDirection((current) => (current === "asc" ? "desc" : "asc"));
    else {
      setSort(key);
      setDirection(key === "mode" ? "asc" : "desc");
    }
  }

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
          {profile.recent.length > 0 ? (
            <div className="table-wrap">
              <table className="data-table">
                <thead>
                  <tr>
                    <SortableTh label="Igra" column="mode" sort={sort} direction={direction} onSort={toggleSort} />
                    <SortableTh label="Točke" column="score" sort={sort} direction={direction} onSort={toggleSort} />
                    <SortableTh label="Pravilni" column="correct_count" sort={sort} direction={direction} onSort={toggleSort} />
                    <SortableTh label="Kdaj" column="played_at" sort={sort} direction={direction} onSort={toggleSort} />
                  </tr>
                </thead>
                <tbody>
                  {recent.map((row) => (
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
          ) : null}
        </>
      ) : null}
    </section>
  );
}
