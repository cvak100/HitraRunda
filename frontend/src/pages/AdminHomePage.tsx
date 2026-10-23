import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";

import { api } from "../api";
import { formatMode, formatPoints, formatWhen } from "../format";
import type { QuestionReportRow } from "../types";

type ModeCount = { mode: string; label: string; count: number };

type RecentSession = {
  id: number;
  code: string;
  mode: string;
  mode_label: string;
  status: string;
  nickname: string;
  score: number | null;
  created_at: string;
};

type Summary = {
  generated_at: string;
  questions: number;
  active_questions: number;
  inactive_questions: number;
  categories: number;
  open_reports: number;
  users: number;
  guests: number;
  registered: number;
  staff: number;
  rooms_waiting: number;
  rooms_playing: number;
  rooms_finished_week: number;
  sessions_active: number;
  sessions_finished_day: number;
  sessions_finished_week: number;
  results_total: number;
  results_day: number;
  results_by_mode: ModeCount[];
  bots: number;
  friends: number;
  bonuses: number;
  recent_reports: QuestionReportRow[];
  recent_sessions: RecentSession[];
  attention: {
    open_reports: number;
    live_rooms: number;
    live_sessions: number;
  };
};

const SESSION_STATUS: Record<string, string> = {
  preparing: "Priprava",
  active: "V teku",
  finished: "Končana",
  aborted: "Prekinjena",
};

export function AdminHomePage() {
  const navigate = useNavigate();
  const [summary, setSummary] = useState<Summary | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    api<Summary>("/api/admin/summary/")
      .then((data) => {
        setSummary(data);
        setError("");
      })
      .catch(() => setError("Povzetka ni bilo mogoče naložiti."))
      .finally(() => setLoading(false));
  }, []);

  const attention = summary?.attention;
  const needsAttention = Boolean(
    attention && (attention.open_reports > 0 || attention.live_rooms > 0 || attention.live_sessions > 0),
  );

  return (
    <section className="panel admin-dash">
      <p className="eyebrow">Admin</p>
      <h1>Nadzorna plošča</h1>
      <p className="fine admin-dash-lead">
        Pregled vsebine, živih sob in nedavne aktivnosti. Številke se osvežijo ob vsakem odprtju strani.
      </p>
      {error ? <p className="error">{error}</p> : null}
      {loading && !summary ? <p className="status">Nalagam…</p> : null}

      {summary ? (
        <>
          {needsAttention ? (
            <div className="admin-attention" role="status">
              <strong>Zdaj</strong>
              <ul>
                {attention!.open_reports > 0 ? (
                  <li>
                    <Link to="/nadzor/vsebina/pritozbe">
                      {attention!.open_reports} odprtih pritožb
                    </Link>
                  </li>
                ) : null}
                {attention!.live_rooms > 0 ? (
                  <li>
                    <Link to="/nadzor/sobe">
                      {attention!.live_rooms} živih sob (čakanje / v teku)
                    </Link>
                  </li>
                ) : null}
                {attention!.live_sessions > 0 ? (
                  <li>
                    <Link to="/nadzor/igre">{attention!.live_sessions} aktivnih sej</Link>
                  </li>
                ) : null}
              </ul>
            </div>
          ) : (
            <p className="fine admin-attention-ok">Ni odprtih opozoril — ni pritožb, ni živih sob.</p>
          )}

          <h2 className="admin-dash-h">Stanje</h2>
          <div className="dash-grid">
            <Link className="dash-card" to="/nadzor/sobe">
              <span>Žive sobe</span>
              <strong>{formatPoints(summary.rooms_waiting + summary.rooms_playing)}</strong>
              <span className="fine">
                {summary.rooms_waiting} čaka · {summary.rooms_playing} igra
              </span>
            </Link>
            <Link className="dash-card" to="/nadzor/igre">
              <span>Aktivne seje</span>
              <strong>{formatPoints(summary.sessions_active)}</strong>
              <span className="fine">priprava + v teku</span>
            </Link>
            <Link className="dash-card" to="/nadzor/vsebina/pritozbe">
              <span>Odprte pritožbe</span>
              <strong className={summary.open_reports > 0 ? "is-warn" : undefined}>
                {formatPoints(summary.open_reports)}
              </strong>
              <span className="fine">zahtevajo pregled</span>
            </Link>
            <div className="dash-card dash-card-static">
              <span>Rezultati danes</span>
              <strong>{formatPoints(summary.results_day)}</strong>
              <span className="fine">
                teden {formatPoints(summary.sessions_finished_week)} sej · skupaj{" "}
                {formatPoints(summary.results_total)}
              </span>
            </div>
          </div>

          <h2 className="admin-dash-h">Vsebina in uporabniki</h2>
          <div className="dash-grid">
            <Link className="dash-card" to="/nadzor/vsebina/vprasanja">
              <span>Aktivna vprašanja</span>
              <strong>{formatPoints(summary.active_questions)}</strong>
              <span className="fine">
                skupaj {formatPoints(summary.questions)} · umaknjena {formatPoints(summary.inactive_questions)}
              </span>
            </Link>
            <Link className="dash-card" to="/nadzor/sifranti/kategorije">
              <span>Kategorije</span>
              <strong>{formatPoints(summary.categories)}</strong>
              <span className="fine">aktivne</span>
            </Link>
            <Link className="dash-card" to="/nadzor/uporabniki">
              <span>Uporabniki</span>
              <strong>{formatPoints(summary.users)}</strong>
              <span className="fine">
                {formatPoints(summary.registered)} računov · {formatPoints(summary.guests)} gostov ·{" "}
                {formatPoints(summary.staff)} staff
              </span>
            </Link>
            <Link className="dash-card" to="/nadzor/sifranti">
              <span>Šifranti</span>
              <strong>{formatPoints(summary.bots + summary.friends + summary.bonuses)}</strong>
              <span className="fine">
                {summary.bots} botov · {summary.friends} prijateljev · {summary.bonuses} bonusov
              </span>
            </Link>
          </div>

          <h2 className="admin-dash-h">Hitre poti</h2>
          <div className="admin-quick-links">
            <Link className="btn-with-icon mode-nav-btn" to="/nadzor/vsebina">
              Uvoz / kakovost
            </Link>
            <Link className="btn-with-icon mode-nav-btn" to="/nadzor/vsebina/vprasanja">
              Vprašanja
            </Link>
            <Link className="btn-with-icon mode-nav-btn" to="/nadzor/igre">
              Igre
            </Link>
            <Link className="btn-with-icon mode-nav-btn" to="/nadzor/sobe">
              Sobe
            </Link>
            <Link className="btn-with-icon mode-nav-btn" to="/nadzor/ukazi">
              Ukazi
            </Link>
          </div>

          {summary.results_by_mode.length > 0 ? (
            <>
              <h2 className="admin-dash-h">Rezultati po načinih</h2>
              <div className="admin-mode-bars" aria-label="Rezultati po načinih">
                {summary.results_by_mode.map((row) => {
                  const max = summary.results_by_mode[0]?.count || 1;
                  const pct = Math.max(6, Math.round((row.count / max) * 100));
                  return (
                    <div key={row.mode} className="admin-mode-bar">
                      <div className="admin-mode-bar-meta">
                        <span>{row.label || formatMode(row.mode)}</span>
                        <strong>{formatPoints(row.count)}</strong>
                      </div>
                      <div className="admin-mode-bar-track" aria-hidden>
                        <div className="admin-mode-bar-fill" style={{ width: `${pct}%` }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          ) : null}

          <div className="admin-dash-split">
            <div>
              <div className="admin-dash-section-head">
                <h2 className="admin-dash-h">Zadnje pritožbe</h2>
                <Link to="/nadzor/vsebina/pritozbe">Vse</Link>
              </div>
              {summary.recent_reports.length === 0 ? (
                <p className="fine">Ni odprtih pritožb.</p>
              ) : (
                <div className="admin-list">
                  {summary.recent_reports.map((report) => (
                    <article key={report.id} className="admin-card">
                      <p className="fine">
                        {report.nickname || "—"}
                        {report.room_code ? ` · ${report.room_code}` : ""} · {formatWhen(report.created_at)}
                      </p>
                      <h3>{report.question.text}</h3>
                      <p>{report.note || "Brez opombe."}</p>
                      <Link to="/nadzor/vsebina/pritozbe">Odpri pritožbe</Link>
                    </article>
                  ))}
                </div>
              )}
            </div>

            <div>
              <div className="admin-dash-section-head">
                <h2 className="admin-dash-h">Zadnje seje</h2>
                <Link to="/nadzor/igre">Vse</Link>
              </div>
              {summary.recent_sessions.length === 0 ? (
                <p className="fine">Še ni sej.</p>
              ) : (
                <div className="table-wrap">
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>Soba</th>
                        <th>Način</th>
                        <th>Status</th>
                        <th>Kdaj</th>
                      </tr>
                    </thead>
                    <tbody>
                      {summary.recent_sessions.map((row) => (
                        <tr
                          key={row.id}
                          className="is-link"
                          onClick={() => navigate(`/nadzor/igre/${row.id}`)}
                        >
                          <td>
                            <strong>{row.code}</strong>
                            <div className="fine">{row.nickname || "—"}</div>
                          </td>
                          <td>{row.mode_label || formatMode(row.mode)}</td>
                          <td>{SESSION_STATUS[row.status] || row.status}</td>
                          <td>{formatWhen(row.created_at)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>

          <p className="fine admin-dash-stamp">Posodobljeno {formatWhen(summary.generated_at)}</p>
        </>
      ) : null}
    </section>
  );
}
