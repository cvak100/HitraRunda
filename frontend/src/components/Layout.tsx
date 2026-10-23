import { useEffect, useRef, useState, type ReactNode } from "react";
import { Link, NavLink, Navigate, Outlet, useLocation } from "react-router-dom";

import { useAuth } from "../auth";
import { GearIcon, UpIcon } from "../icons";

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
              <NavLink to="/nadzor/paleta">Paleta</NavLink>
              <NavLink to="/nadzor/testi">Testi</NavLink>
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
