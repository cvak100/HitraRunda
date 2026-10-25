import { NavLink, Outlet } from "react-router-dom";

export function AdminCatalogLayout() {
  return (
    <div className="content-shell">
      <div className="tabs content-tabs" role="tablist" aria-label="Šifranti">
        <NavLink to="/nadzor/sifranti/kategorije" role="tab">
          Kategorije
        </NavLink>
        <NavLink to="/nadzor/sifranti/bonusi" role="tab">
          Bonusi
        </NavLink>
        <NavLink to="/nadzor/sifranti/prijatelji" role="tab">
          Prijatelji
        </NavLink>
        <NavLink to="/nadzor/sifranti/boti" role="tab">
          AI boti
        </NavLink>
        <NavLink to="/nadzor/sifranti/drzave" role="tab">
          Države
        </NavLink>
      </div>
      <Outlet />
    </div>
  );
}
