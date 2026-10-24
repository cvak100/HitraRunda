import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";

import { SortableTh } from "../components/AdminToolbar";
import { Avatar } from "../components/Avatar";
import { api } from "../api";
import { useAuth } from "../auth";
import { avatarLabel } from "../avatars";
import { formatDuration, formatMode, formatPoints, formatWhen } from "../format";
import { BoardLink } from "../gameModes";
import type { ScoreRow } from "../types";

type ModeStat = {
  mode: string;
  label: string;
  best_score: number;
  best_correct: number;
  best_prize: number;
  avg_score: number;
  games: number;
  total_points?: number;
  wins?: number;
  rank: number | null;
  board_total: number;
  best_duration_ms: number | null;
  best_correct_in_run: number;
  best_total_in_run: number;
};

type Profile = {
  nickname: string;
  avatar?: string;
  preferred_color?: string;
  modes: ModeStat[];
  recent: ScoreRow[];
};

type SortKey = "mode" | "score" | "correct_count" | "played_at";

export function ProfilePage() {
  const navigate = useNavigate();
  const { user } = useAuth();
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

  const color = profile?.preferred_color || user?.preferred_color || "#7dcea0";
  const avatar = profile?.avatar || user?.avatar || "ris";

  return (
    <section className="panel">
      <p className="eyebrow">Račun</p>
      <div className="profile-hero">
        <Avatar avatar={avatar} color={color} size={64} title={avatarLabel(avatar)} />
        <div>
          <h1>{profile?.nickname || user?.nickname || "Profil"}</h1>
          {user?.is_guest ? (
            <p className="fine">
              Gost — <Link to="/registracija">ustvari račun</Link>, da rezultati ostanejo.
            </p>
          ) : (
            <p className="fine">
              {user?.email}
              {avatarLabel(avatar) ? ` · ${avatarLabel(avatar)}` : ""}
            </p>
          )}
        </div>
      </div>
      {error ? <p className="error">{error}</p> : null}
      {profile ? (
        <>
          <div className="game-split profile-modes">
            {profile.modes.map((mode) => (
              <article key={mode.mode} className="game-block profile-mode-card">
                <p className="eyebrow">{mode.label}</p>
                <h2>{formatPoints(mode.best_score)}</h2>
                <p className="fine profile-mode-rank">
                  {mode.rank != null && mode.board_total > 0
                    ? `${mode.rank}. na skupni lestvici · od ${formatPoints(mode.board_total)}`
                    : mode.games > 0
                      ? "Še ni na skupni lestvici"
                      : "Še ni iger"}
                </p>
                <ul className="profile-mode-stats">
                  <li>
                    <span>Skupaj točk</span>
                    <strong>{formatPoints(mode.total_points ?? 0)}</strong>
                  </li>
                  <li>
                    <span>Iger</span>
                    <strong>{formatPoints(mode.games)}</strong>
                  </li>
                  {mode.mode === "multiplayer" || mode.mode === "dirka" ? (
                    <li>
                      <span>Zmage</span>
                      <strong>{formatPoints(mode.wins ?? 0)}</strong>
                    </li>
                  ) : null}
                  <li>
                    <span>Povprečje</span>
                    <strong>{formatPoints(mode.avg_score)}</strong>
                  </li>
                  <li>
                    <span>Največ pravilnih</span>
                    <strong>{formatPoints(mode.best_correct)}</strong>
                  </li>
                  {mode.mode === "ala_milijonar" ? (
                    <li>
                      <span>Najvišja nagrada</span>
                      <strong>{formatPoints(mode.best_prize)}</strong>
                    </li>
                  ) : null}
                  {mode.best_total_in_run > 0 ? (
                    <li>
                      <span>Najboljši tek</span>
                      <strong>
                        {mode.best_correct_in_run}/{mode.best_total_in_run}
                      </strong>
                    </li>
                  ) : null}
                  {mode.best_duration_ms != null ? (
                    <li>
                      <span>Čas najboljšega</span>
                      <strong>{formatDuration(mode.best_duration_ms)}</strong>
                    </li>
                  ) : null}
                </ul>
                <BoardLink mode={mode.mode} variant="icon" />
              </article>
            ))}
          </div>
          <h2>Zadnjih iger</h2>
          {profile.recent.length === 0 ? <p className="fine">Še ni iger.</p> : null}
          {profile.recent.length > 0 ? (
            <div className="table-wrap board-scroll">
              <table className="data-table board-table">
                <thead>
                  <tr>
                    <SortableTh label="Igra" column="mode" sort={sort} direction={direction} onSort={toggleSort} />
                    <SortableTh label="Točke" column="score" sort={sort} direction={direction} onSort={toggleSort} />
                    <SortableTh
                      label="Pravilni"
                      column="correct_count"
                      sort={sort}
                      direction={direction}
                      onSort={toggleSort}
                    />
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
