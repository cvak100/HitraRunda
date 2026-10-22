import { useEffect, useState } from "react";
import { Link } from "react-router-dom";

import { api } from "../api";
import { formatWhen } from "../format";
import type { QuestionReportRow } from "../types";

type Summary = {
  questions: number;
  active_questions: number;
  open_reports: number;
  users: number;
};

export function AdminHomePage() {
  const [summary, setSummary] = useState<Summary | null>(null);
  const [reports, setReports] = useState<QuestionReportRow[]>([]);
  const [error, setError] = useState("");

  useEffect(() => {
    api<Summary>("/api/admin/summary/")
      .then(setSummary)
      .catch(() => setError("Povzetka ni bilo mogoče naložiti."));
    api<{ reports: QuestionReportRow[] }>("/api/admin/reports/")
      .then((data) => setReports(data.reports.slice(0, 3)))
      .catch(() => setReports([]));
  }, []);

  return (
    <section className="panel">
      <p className="eyebrow">Admin</p>
      <h1>Nadzorna plošča</h1>
      {error ? <p className="error">{error}</p> : null}
      <div className="dash-grid">
        <Link className="dash-card" to="/nadzor/pritozbe">
          <span>Odprte pritožbe</span>
          <strong>{summary ? summary.open_reports : "…"}</strong>
        </Link>
        <Link className="dash-card" to="/nadzor/vprasanja">
          <span>Aktivna vprašanja</span>
          <strong>{summary ? summary.active_questions : "…"}</strong>
          {summary ? <span className="fine">Skupaj {summary.questions}</span> : null}
        </Link>
        <Link className="dash-card" to="/nadzor/uporabniki">
          <span>Uporabniki</span>
          <strong>{summary ? summary.users : "…"}</strong>
        </Link>
      </div>
      <h2>Zadnje pritožbe</h2>
      {reports.length === 0 ? <p className="status">Ni odprtih pritožb.</p> : null}
      <div className="admin-list">
        {reports.map((report) => (
          <article key={report.id} className="admin-card">
            <p className="fine">
              {report.nickname} · {formatWhen(report.created_at)}
            </p>
            <h2>{report.question.text}</h2>
            <p>{report.note}</p>
          </article>
        ))}
      </div>
      {reports.length > 0 ? <Link to="/nadzor/pritozbe">Odpri pritožbe</Link> : null}
    </section>
  );
}
