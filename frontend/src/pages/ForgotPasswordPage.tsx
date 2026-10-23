import { FormEvent, useState } from "react";
import { Link } from "react-router-dom";

import { ApiError, api } from "../api";

export function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [debugLink, setDebugLink] = useState("");

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setError("");
    setNotice("");
    setDebugLink("");
    try {
      const result = await api<{ detail: string; debug_link?: string }>("/api/auth/password-reset/", {
        method: "POST",
        body: JSON.stringify({ email }),
      });
      setNotice(result.detail);
      if (result.debug_link) setDebugLink(result.debug_link);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Zahteva ni uspela.");
    }
  }

  return (
    <section className="panel narrow">
      <h1>Pozabljeno geslo</h1>
      <p className="fine">Vpiši e-pošto računa. Če obstaja, dobiš povezavo za novo geslo.</p>
      <form onSubmit={onSubmit} className="stack">
        <label>
          E-pošta
          <input type="email" value={email} onChange={(event) => setEmail(event.target.value)} required />
        </label>
        {notice ? <p className="fine">{notice}</p> : null}
        {debugLink ? (
          <p className="fine">
            Razvojni link: <a href={debugLink}>{debugLink}</a>
          </p>
        ) : null}
        {error ? <p className="error">{error}</p> : null}
        <button className="primary" type="submit">
          Pošlji povezavo
        </button>
        <p className="fine">
          <Link to="/prijava">Nazaj na prijavo</Link>
        </p>
      </form>
    </section>
  );
}
