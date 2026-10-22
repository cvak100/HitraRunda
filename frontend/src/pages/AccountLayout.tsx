import { NavLink, Outlet } from "react-router-dom";

export function AccountLayout() {
  return (
    <div className="admin-shell">
      <nav className="subnav">
        <NavLink to="/racun/nastavitve">Nastavitve</NavLink>
        <NavLink to="/racun/odjava">Odjava</NavLink>
      </nav>
      <Outlet />
    </div>
  );
}
