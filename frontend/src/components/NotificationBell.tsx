import { useEffect, useRef, useState } from "react";

import { BellIcon } from "../icons";
import { modeInviteLabel, useInvites, type RoomInvite } from "../invites";

export function NotificationBell() {
  const { invites, count, accept, acceptingCode, error, refresh } = useInvites();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onPointer(event: MouseEvent) {
      if (!ref.current?.contains(event.target as Node)) setOpen(false);
    }
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, []);

  return (
    <div className="menu-drop notify-bell" ref={ref}>
      <button
        type="button"
        className={`nav-btn icon-button ${open ? "active" : ""}`}
        aria-expanded={open}
        aria-label={count ? `Obvestila (${count})` : "Obvestila"}
        onClick={() => {
          setOpen((value) => !value);
          if (!open) void refresh();
        }}
      >
        <BellIcon />
        {count > 0 ? <span className="notify-badge">{count > 9 ? "9+" : count}</span> : null}
      </button>
      {open ? (
        <div className="menu-panel notify-panel" role="dialog" aria-label="Povabila">
          <div className="notify-panel-head">
            <strong>Povabila</strong>
            <button type="button" className="fine" onClick={() => void refresh()}>
              Osveži
            </button>
          </div>
          {error ? <p className="error notify-error">{error}</p> : null}
          {invites.length === 0 ? <p className="fine notify-empty">Ni novih povabil.</p> : null}
          <ul className="notify-list">
            {invites.map((invite) => (
              <InviteRow
                key={invite.code}
                invite={invite}
                busy={acceptingCode === invite.code}
                onAccept={() => void accept(invite)}
              />
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}

function InviteRow({
  invite,
  busy,
  onAccept,
}: {
  invite: RoomInvite;
  busy: boolean;
  onAccept: () => void;
}) {
  const mode = modeInviteLabel(invite.settings?.mode);
  const from = invite.invite_from || invite.host_nickname || "Host";
  return (
    <li className="notify-item">
      <div className="notify-item-text">
        <strong>
          {from} · {mode}
        </strong>
        <span className="fine">
          {invite.code}
          {invite.settings?.target_score != null ? ` · cilj ${invite.settings.target_score}` : ""}
          {invite.settings?.question_count != null ? ` · ${invite.settings.question_count} vprašanj` : ""}
          {invite.member_count != null && invite.max_players != null
            ? ` · ${invite.member_count}/${invite.max_players}`
            : ""}
        </span>
      </div>
      <button type="button" className="primary" disabled={busy} onClick={onAccept}>
        {busy ? "…" : "Vstopi"}
      </button>
    </li>
  );
}
