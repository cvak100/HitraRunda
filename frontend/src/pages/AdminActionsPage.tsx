import { useEffect, useState } from "react";

import { ApiError, api } from "../api";
import { ConfirmModal } from "../components/ConfirmModal";
import { GenerateBotsPanel, SimulatePanel } from "./AdminSimulatePage";

export function AdminActionsPage() {
  const [openCleanup, setOpenCleanup] = useState(false);
  const [openCloseRooms, setOpenCloseRooms] = useState(false);
  const [pending, setPending] = useState(false);
  const [closePending, setClosePending] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [closeNotice, setCloseNotice] = useState("");
  const [closeError, setCloseError] = useState("");
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirmCloseRooms, setConfirmCloseRooms] = useState(false);
  const [days, setDays] = useState(7);

  useEffect(() => {
    api<{ guest_cleanup_days?: number }>("/api/game-config/")
      .then((cfg) => {
        if (cfg.guest_cleanup_days) setDays(cfg.guest_cleanup_days);
      })
      .catch(() => undefined);
  }, []);

  async function cleanupGuests() {
    setPending(true);
    setError("");
    setNotice("");
    setConfirmOpen(false);
    try {
      const result = await api<{ detail: string; deleted: number; days?: number }>(
        "/api/admin/actions/cleanup-guests/",
        {
          method: "POST",
        },
      );
      setNotice(result.detail);
      if (result.days) setDays(result.days);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Čiščenje ni uspelo.");
    } finally {
      setPending(false);
    }
  }

  async function closeLiveRooms() {
    setClosePending(true);
    setCloseError("");
    setCloseNotice("");
    setConfirmCloseRooms(false);
    try {
      const result = await api<{ detail: string; closed: number }>(
        "/api/admin/actions/close-live-rooms/",
        { method: "POST" },
      );
      setCloseNotice(result.detail);
    } catch (err) {
      setCloseError(err instanceof ApiError ? err.message : "Zapiranje sob ni uspelo.");
    } finally {
      setClosePending(false);
    }
  }

  return (
    <section className="panel">
      <p className="eyebrow">Admin</p>
      <h1>Ukazi</h1>
      <div className="admin-list">
        <article className="admin-card admin-card-collapse">
          <button
            type="button"
            className="admin-collapse-toggle"
            aria-expanded={openCleanup}
            onClick={() => setOpenCleanup((v) => !v)}
          >
            <span>
              <h2>Čiščenje gostov</h2>
              {!openCleanup ? (
                <p className="fine">Zbriše stare goste brez sveže sobe — klikni za ukaz.</p>
              ) : null}
            </span>
            <span className="admin-collapse-chevron" aria-hidden>
              {openCleanup ? "▾" : "▸"}
            </span>
          </button>
          {openCleanup ? (
            <>
              <p>
                Zbriše goste, starejše od {days} dni, ki nimajo sveže čakajoče ali tekoče sobe. Rezultati in lestvica
                ostanejo. Število dni nastaviš pod Nastavitve.
              </p>
              <p className="fine">
                Isti ukaz v konzoli: docker compose exec backend python manage.py cleanup_guests
              </p>
              {notice ? <p className="fine">{notice}</p> : null}
              {error ? <p className="error">{error}</p> : null}
              <div className="actions">
                <button
                  type="button"
                  className="primary"
                  disabled={pending}
                  onClick={() => setConfirmOpen(true)}
                >
                  Počisti goste
                </button>
              </div>
            </>
          ) : null}
        </article>

        <article className="admin-card admin-card-collapse">
          <button
            type="button"
            className="admin-collapse-toggle"
            aria-expanded={openCloseRooms}
            onClick={() => setOpenCloseRooms((v) => !v)}
          >
            <span>
              <h2>Zapri žive sobe</h2>
              {!openCloseRooms ? (
                <p className="fine">Zapre vse sobe v čakanju in teku — klikni za ukaz.</p>
              ) : null}
            </span>
            <span className="admin-collapse-chevron" aria-hidden>
              {openCloseRooms ? "▾" : "▸"}
            </span>
          </button>
          {openCloseRooms ? (
            <>
              <p>
                Takoj zapre vse sobe s statusom <strong>čakanje</strong> ali <strong>v teku</strong>, vključno z
                aktivnimi igrami. Končane in že zaprte sobe ostanejo. Igralci v sobi dobijo obvestilo, da je soba
                zaprta.
              </p>
              <p className="fine">
                Isti ukaz v konzoli: docker compose exec backend python manage.py close_live_rooms
              </p>
              {closeNotice ? <p className="fine">{closeNotice}</p> : null}
              {closeError ? <p className="error">{closeError}</p> : null}
              <div className="actions">
                <button
                  type="button"
                  className="primary"
                  disabled={closePending}
                  onClick={() => setConfirmCloseRooms(true)}
                >
                  Zapri vse žive sobe
                </button>
              </div>
            </>
          ) : null}
        </article>

        <GenerateBotsPanel />
        <SimulatePanel />
      </div>
      <ConfirmModal
        open={confirmOpen}
        title="Čiščenje gostov"
        message={`Pobrišem goste, starejše od ${days} dni brez sveže igre?`}
        confirmLabel="Počisti"
        danger
        onConfirm={() => void cleanupGuests()}
        onCancel={() => setConfirmOpen(false)}
      />
      <ConfirmModal
        open={confirmCloseRooms}
        title="Zapri žive sobe"
        message="Zaprem vse sobe v čakanju in teku (tudi aktivne igre)?"
        confirmLabel="Zapri vse"
        danger
        onConfirm={() => void closeLiveRooms()}
        onCancel={() => setConfirmCloseRooms(false)}
      />
    </section>
  );
}
