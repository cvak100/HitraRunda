import { useEffect, useState } from "react";

import { ApiError, api } from "../api";
import { ConfirmModal } from "../components/ConfirmModal";
import { DeleteIcon, IconAction } from "../components/IconActions";
import { QuestionBody } from "../components/QuestionBody";
import { formatWhen } from "../format";
import type { QuestionReportRow, StaffQuestion } from "../types";

export function AdminReportsPage() {
  const [reports, setReports] = useState<QuestionReportRow[]>([]);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [pendingDelete, setPendingDelete] = useState<StaffQuestion | null>(null);

  useEffect(() => {
    api<{ reports: QuestionReportRow[] }>("/api/admin/reports/")
      .then((data) => setReports(data.reports))
      .catch(() => setError("Pritožb ni bilo mogoče naložiti."));
  }, []);

  async function removeQuestion(question: StaffQuestion) {
    setError("");
    try {
      const result = await api<{ detail: string }>(`/api/admin/questions/${question.id}/`, { method: "DELETE" });
      setNotice(result.detail);
      setPendingDelete(null);
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
      setError(err instanceof ApiError ? err.message : "Shranjevanje ni uspelo.");
    }
  }

  return (
    <section className="panel">
      <p className="eyebrow">Admin</p>
      <h1>Pritožbe</h1>
      {notice ? <p className="fine">{notice}</p> : null}
      {error ? <p className="error">{error}</p> : null}
      {reports.length === 0 ? <p className="status">Ni odprtih pritožb.</p> : null}
      <div className="admin-list">
        {reports.map((report) => (
          <article key={report.id} className="admin-card">
            <p className="fine">
              {report.nickname} · {formatWhen(report.created_at)}
            </p>
            <h2>{report.question.text}</h2>
            <p>{report.note}</p>
            <QuestionBody question={report.question} />
            <div className="actions">
              <IconAction label="Izbriši vprašanje" danger onClick={() => setPendingDelete(report.question)}>
                <DeleteIcon />
              </IconAction>
              <button type="button" onClick={() => void dismiss(report)}>
                Zavrzi pritožbo
              </button>
            </div>
          </article>
        ))}
      </div>
      <ConfirmModal
        open={pendingDelete != null}
        title="Izbriši vprašanje"
        message="Izbrišem to vprašanje?"
        confirmLabel="Izbriši"
        danger
        onConfirm={() => {
          if (pendingDelete) void removeQuestion(pendingDelete);
        }}
        onCancel={() => setPendingDelete(null)}
      />
    </section>
  );
}
