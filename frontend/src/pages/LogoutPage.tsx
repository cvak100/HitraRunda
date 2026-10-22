import { useState } from "react";
import { useNavigate } from "react-router-dom";

import { useAuth } from "../auth";

export function LogoutPage() {
  const { logout } = useAuth();
  const navigate = useNavigate();
  const [pending, setPending] = useState(false);

  async function onLogout() {
    setPending(true);
    await logout();
    navigate("/");
  }

  return (
    <section className="panel narrow">
      <p className="eyebrow">Račun</p>
      <h1>Odjava</h1>
      <p>Odjavim te iz te seje na tem brskalniku.</p>
      <button type="button" className="primary" disabled={pending} onClick={() => void onLogout()}>
        Odjavi me
      </button>
    </section>
  );
}
