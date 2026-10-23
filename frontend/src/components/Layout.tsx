import { useEffect, useRef, useState, type ReactNode } from "react";
import { Link, NavLink, Navigate, Outlet, useLocation } from "react-router-dom";

import { useAuth } from "../auth";

export function Layout() {
  const { user, loading } = useAuth();
  const location = useLocation();
  const [navOpen, setNavOpen] = useState(false);

  useEffect(() => {
    setNavOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    if (!navOpen) return;
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") setNavOpen(false);
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [navOpen]);

  return (
    <div className="shell">
      <header id="top" className="top">
        <Link to="/" className="brand">
          Hitra runda
        </Link>
        <button
          type="button"
          className={`nav-toggle ${navOpen ? "is-open" : ""}`}
          aria-expanded={navOpen}
          aria-controls="site-nav"
          aria-label={navOpen ? "Zapri meni" : "Odpri meni"}
          onClick={() => setNavOpen((value) => !value)}
        >
          <span />
          <span />
          <span />
        </button>
        <nav id="site-nav" className={`top-nav ${navOpen ? "is-open" : ""}`}>
          {user?.is_staff ? (
            <Menu label="Admin" active={location.pathname.startsWith("/nadzor")} buttonClass="nav-btn nav-btn-admin">
              <NavLink to="/nadzor" end>
                Pregled
              </NavLink>
              <NavLink to="/nadzor/vsebina">Vsebina</NavLink>
              <NavLink to="/nadzor/sifranti">Šifranti</NavLink>
              <NavLink to="/nadzor/igre">Igre</NavLink>
              <NavLink to="/nadzor/sobe">Sobe</NavLink>
              <NavLink to="/nadzor/uporabniki">Uporabniki</NavLink>
              <NavLink to="/nadzor/ukazi">Ukazi</NavLink>
            </Menu>
          ) : null}
          <NavLink to="/lestvica" className="nav-btn">
            Lestvica
          </NavLink>
          {user ? (
            <NavLink to="/igra" className="nav-btn">
              Igraj
            </NavLink>
          ) : null}
          {user ? (
            <Menu
              label={<GearIcon />}
              active={location.pathname.startsWith("/racun")}
              buttonClass="nav-btn icon-button"
              labelText="Račun"
            >
              <NavLink to="/racun/profil">Profil</NavLink>
              <NavLink to="/racun/nastavitve">Nastavitve</NavLink>
              <NavLink to="/racun/odjava">Odjava</NavLink>
            </Menu>
          ) : (
            <NavLink to="/prijava" className="nav-btn">
              Prijava
            </NavLink>
          )}
        </nav>
      </header>
      <main>
        {loading ? <p className="status">Nalagam…</p> : <Outlet />}
      </main>
      <footer className="site-footer">
        <button
          type="button"
          className="btn-with-icon back-to-top"
          onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
        >
          <UpIcon />
          Nazaj na vrh
        </button>
      </footer>
    </div>
  );
}

function Menu({
  label,
  children,
  active,
  buttonClass,
  labelText,
}: {
  label: ReactNode;
  children: ReactNode;
  active?: boolean;
  buttonClass?: string;
  labelText?: string;
}) {
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
    <div className="menu-drop" ref={ref}>
      <button
        type="button"
        className={[buttonClass, active || open ? "active" : ""].filter(Boolean).join(" ")}
        aria-expanded={open}
        aria-current={active ? "page" : undefined}
        aria-label={labelText}
        onClick={() => setOpen((value) => !value)}
      >
        {label}
      </button>
      {open ? (
        <div className="menu-panel" onClick={() => setOpen(false)}>
          {children}
        </div>
      ) : null}
    </div>
  );
}

function GearIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path
        fill="currentColor"
        d="M19.14 12.94c.04-.31.06-.63.06-.94s-.02-.63-.06-.94l2.03-1.58a.5.5 0 0 0 .12-.64l-1.92-3.32a.5.5 0 0 0-.6-.22l-2.39.96a7.2 7.2 0 0 0-1.63-.94l-.36-2.54a.5.5 0 0 0-.5-.42h-3.84a.5.5 0 0 0-.5.42l-.36 2.54c-.58.23-1.12.54-1.63.94l-2.39-.96a.5.5 0 0 0-.6.22L2.71 8.84a.5.5 0 0 0 .12.64l2.03 1.58c-.04.31-.06.63-.06.94s.02.63.06.94l-2.03 1.58a.5.5 0 0 0-.12.64l1.92 3.32c.13.22.39.31.6.22l2.39-.96c.5.4 1.05.71 1.63.94l.36 2.54c.05.24.25.42.5.42h3.84c.25 0 .45-.18.5-.42l.36-2.54c.58-.23 1.12-.54 1.63-.94l2.39.96c.22.09.47 0 .6-.22l1.92-3.32a.5.5 0 0 0-.12-.64l-2.03-1.58zM12 15.5A3.5 3.5 0 1 1 12 8.5a3.5 3.5 0 0 1 0 7z"
      />
    </svg>
  );
}

function UpIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path
        fill="none"
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M6 15l6-6 6 6"
      />
    </svg>
  );
}

export function RequireUser() {
  const { user, loading } = useAuth();
  if (loading) return <p className="status">Nalagam…</p>;
  if (!user) return <Navigate to="/" replace />;
  return <Outlet />;
}

export function RequireStaff() {
  const { user, loading } = useAuth();
  if (loading) return <p className="status">Nalagam…</p>;
  if (!user?.is_staff) return <Navigate to="/" replace />;
  return <Outlet />;
}
