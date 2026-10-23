import { useState } from "react";

import { ApiError, api } from "../api";
import { ConfirmModal } from "../components/ConfirmModal";

export function AdminActionsPage() {
  const [pending, setPending] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [confirmOpen, setConfirmOpen] = useState(false);

  async function cleanupGuests() {
    setPending(true);
    setError("");
    setNotice("");
    setConfirmOpen(false);
    try {
      const result = await api<{ detail: string; deleted: number }>("/api/admin/actions/cleanup-guests/", {
        method: "POST",
      });
      setNotice(result.detail);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Čiščenje ni uspelo.");
    } finally {
      setPending(false);
    }
  }

  return (
    <section className="panel">
      <p className="eyebrow">Admin</p>
      <h1>Ukazi</h1>
      <div className="admin-list">
        <article className="admin-card">
          <h2>Čiščenje gostov</h2>
          <p>
            Zbriše goste, starejše od 7 dni, ki nimajo sveže čakajoče ali tekoče sobe. Rezultati in lestvica ostanejo.
          </p>
          <p className="fine">Isti ukaz v konzoli: docker compose exec backend python manage.py cleanup_guests</p>
          {notice ? <p className="fine">{notice}</p> : null}
          {error ? <p className="error">{error}</p> : null}
          <div className="actions">
            <button type="button" className="primary" disabled={pending} onClick={() => setConfirmOpen(true)}>
              Počisti goste
            </button>
          </div>
        </article>
      </div>
      <ConfirmModal
        open={confirmOpen}
        title="Čiščenje gostov"
        message="Pobrišem goste, starejše od 7 dni brez sveže igre?"
        confirmLabel="Počisti"
        danger
        onConfirm={() => void cleanupGuests()}
        onCancel={() => setConfirmOpen(false)}
      />
    </section>
  );
}
