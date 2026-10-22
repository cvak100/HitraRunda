import { useEffect, useState } from "react";

import { ApiError, api } from "../api";
import { QuestionBody } from "../components/QuestionBody";
import { formatWhen } from "../format";
import type { QuestionReportRow, StaffQuestion } from "../types";

export function AdminReportsPage() {
  const [reports, setReports] = useState<QuestionReportRow[]>([]);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    api<{ reports: QuestionReportRow[] }>("/api/admin/reports/")
      .then((data) => setReports(data.reports))
      .catch(() => setError("Pritožb ni bilo mogoče naložiti."));
  }, []);

  async function removeQuestion(question: StaffQuestion) {
    if (!window.confirm("Izbrišem to vprašanje?")) return;
    setError("");
    try {
      const result = await api<{ detail: string }>(`/api/admin/questions/${question.id}/`, { method: "DELETE" });
      setNotice(result.detail);
      setReports((current) => current.filter((report) => report.question.id !== question.id));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Brisanje ni uspelo.");
    }
  }

  async function dismiss(report: QuestionReportRow) {
    setError("");
    try {
      await api(`/api/admin/reports/${report.id}/`, {
        method: "POST",
        body: JSON.stringify({ status: "dismissed" }),
      });
      setReports((current) => current.filter((item) => item.id !== report.id));
      setNotice("Pritožba je zavržena.");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Pritožbe ni bilo mogoče zavreči.");
    }
  }

  return (
    <section className="panel">
      <p className="eyebrow">Admin</p>
      <h1>Pritožbe</h1>
      {notice ? <p className="fine">{notice}</p> : null}
      {error ? <p className="error">{error}</p> : null}
      <div className="admin-list">
        {reports.length === 0 ? <p className="status">Ni odprtih pritožb.</p> : null}
        {reports.map((report) => (
          <article key={report.id} className="admin-card">
            <p className="fine">
              {report.nickname}
              {report.room_code ? ` · soba ${report.room_code}` : ""} · {formatWhen(report.created_at)}
            </p>
            <h2>{report.question.text}</h2>
            <p>{report.note}</p>
            <QuestionBody question={report.question} />
            <div className="actions">
              <button type="button" onClick={() => void removeQuestion(report.question)}>
                Izbriši vprašanje
              </button>
              <button type="button" onClick={() => void dismiss(report)}>
                Zavrzi pritožbo
              </button>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
