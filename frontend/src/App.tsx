import { lazy, Suspense } from "react";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";

import { AuthProvider } from "./auth";
import { Layout, RequireStaff, RequireUser } from "./components/Layout";
import { InvitesProvider } from "./invites";
import { ResultPage } from "./components/SessionDetail";
import { AccountLayout } from "./pages/AccountLayout";
import { GamePage } from "./pages/GamePage";
import { LogoutPage } from "./pages/LogoutPage";
import { HomePage } from "./pages/HomePage";
import { HowToPlayPage } from "./pages/HowToPlayPage";
import { LeaderboardPage } from "./pages/LeaderboardPage";
import { ForgotPasswordPage } from "./pages/ForgotPasswordPage";
import { LoginPage } from "./pages/LoginPage";
import { DirkaHubPage } from "./pages/DirkaHubPage";
import { MultiplayerHubPage } from "./pages/MultiplayerHubPage";
import { PlayHubPage } from "./pages/PlayHubPage";
import { RegisterPage } from "./pages/RegisterPage";
import { ResetPasswordPage } from "./pages/ResetPasswordPage";
import { SettingsPage } from "./pages/SettingsPage";
import { ProfilePage } from "./pages/ProfilePage";
import { SetupPage } from "./pages/SetupPage";

const AdminActionsPage = lazy(() =>
  import("./pages/AdminActionsPage").then((m) => ({ default: m.AdminActionsPage })),
);
const AdminBonusesPage = lazy(() =>
  import("./pages/AdminBonusesPage").then((m) => ({ default: m.AdminBonusesPage })),
);
const AdminBotsPage = lazy(() =>
  import("./pages/AdminBotsPage").then((m) => ({ default: m.AdminBotsPage })),
);
const AdminCategoriesPage = lazy(() =>
  import("./pages/AdminCategoriesPage").then((m) => ({ default: m.AdminCategoriesPage })),
);
const AdminCatalogLayout = lazy(() =>
  import("./pages/AdminCatalogLayout").then((m) => ({ default: m.AdminCatalogLayout })),
);
const AdminContentLayout = lazy(() =>
  import("./pages/AdminContentLayout").then((m) => ({ default: m.AdminContentLayout })),
);
const AdminContentPage = lazy(() =>
  import("./pages/AdminContentPage").then((m) => ({ default: m.AdminContentPage })),
);
const AdminFriendsPage = lazy(() =>
  import("./pages/AdminFriendsPage").then((m) => ({ default: m.AdminFriendsPage })),
);
const AdminHealthPage = lazy(() =>
  import("./pages/AdminHealthPage").then((m) => ({ default: m.AdminHealthPage })),
);
const AdminHomePage = lazy(() =>
  import("./pages/AdminHomePage").then((m) => ({ default: m.AdminHomePage })),
);
const AdminLayout = lazy(() =>
  import("./pages/AdminLayout").then((m) => ({ default: m.AdminLayout })),
);
const AdminQuestionsPage = lazy(() =>
  import("./pages/AdminQuestionsPage").then((m) => ({ default: m.AdminQuestionsPage })),
);
const AdminReportsPage = lazy(() =>
  import("./pages/AdminReportsPage").then((m) => ({ default: m.AdminReportsPage })),
);
const AdminRoomsPage = lazy(() =>
  import("./pages/AdminRoomsPage").then((m) => ({ default: m.AdminRoomsPage })),
);
const AdminSessionsPage = lazy(() =>
  import("./pages/AdminSessionsPage").then((m) => ({ default: m.AdminSessionsPage })),
);
const AdminSettingsPage = lazy(() =>
  import("./pages/AdminSettingsPage").then((m) => ({ default: m.AdminSettingsPage })),
);
const AdminTestsPage = lazy(() =>
  import("./pages/AdminTestsPage").then((m) => ({ default: m.AdminTestsPage })),
);
const AdminPaletteLayout = lazy(() =>
  import("./pages/AdminPaletteLayout").then((m) => ({ default: m.AdminPaletteLayout })),
);
const AdminSfxPalettePage = lazy(() =>
  import("./pages/AdminSfxPalettePage").then((m) => ({ default: m.AdminSfxPalettePage })),
);
const AdminUiPalettePage = lazy(() =>
  import("./pages/AdminUiPalettePage").then((m) => ({ default: m.AdminUiPalettePage })),
);
const AdminUsersPage = lazy(() =>
  import("./pages/AdminUsersPage").then((m) => ({ default: m.AdminUsersPage })),
);
const AdminSessionDetailPage = lazy(() =>
  import("./components/SessionDetail").then((m) => ({ default: m.AdminSessionDetailPage })),
);

function AdminFallback() {
  return <p className="status">Nalagam…</p>;
}

export function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <InvitesProvider>
        <Routes>
          <Route element={<Layout />}>
            <Route index element={<HomePage />} />
            <Route path="kako-igrati" element={<HowToPlayPage />} />
            <Route path="prijava" element={<LoginPage />} />
            <Route path="registracija" element={<RegisterPage />} />
            <Route path="pozabljeno-geslo" element={<ForgotPasswordPage />} />
            <Route path="ponastavi-geslo" element={<ResetPasswordPage />} />
            <Route path="lestvica" element={<Navigate to="/lestvica/hitrarunda" replace />} />
            <Route path="lestvica/skupno" element={<Navigate to="/lestvica/hitrarunda" replace />} />
            <Route path="lestvica/hitrarunda" element={<LeaderboardPage />} />
            <Route path="lestvica/ala-milijonar" element={<LeaderboardPage />} />
            <Route path="lestvica/vec-igralcev" element={<LeaderboardPage />} />
            <Route path="lestvica/dirka" element={<LeaderboardPage />} />
            <Route path="lestvica/60-sekund" element={<LeaderboardPage />} />
            <Route path="lestvica/rezultat/:resultId" element={<ResultPage />} />
            <Route path="lestvica/:resultId" element={<ResultPage />} />
            <Route element={<RequireUser />}>
              <Route path="igra" element={<PlayHubPage />} />
              <Route path="igra/hitrarunda" element={<SetupPage />} />
              <Route path="igra/ala-milijonar" element={<SetupPage />} />
              <Route path="igra/60-sekund" element={<SetupPage />} />
              <Route path="igra/vec-igralcev" element={<MultiplayerHubPage />} />
              <Route path="igra/dirka" element={<DirkaHubPage />} />
              <Route path="igra/:code" element={<GamePage />} />
              <Route path="racun" element={<AccountLayout />}>
                <Route index element={<Navigate to="profil" replace />} />
                <Route path="profil" element={<ProfilePage />} />
                <Route path="nastavitve" element={<SettingsPage />} />
                <Route path="odjava" element={<LogoutPage />} />
              </Route>
            </Route>
            <Route element={<RequireStaff />}>
              <Route
                path="nadzor"
                element={
                  <Suspense fallback={<AdminFallback />}>
                    <AdminLayout />
                  </Suspense>
                }
              >
                <Route index element={<AdminHomePage />} />
                <Route path="health" element={<AdminHealthPage />} />
                <Route path="vsebina" element={<AdminContentLayout />}>
                  <Route index element={<AdminContentPage />} />
                  <Route path="vprasanja" element={<AdminQuestionsPage />} />
                  <Route path="pritozbe" element={<AdminReportsPage />} />
                </Route>
                <Route path="vprasanja" element={<Navigate to="/nadzor/vsebina/vprasanja" replace />} />
                <Route path="pritozbe" element={<Navigate to="/nadzor/vsebina/pritozbe" replace />} />
                <Route path="sifranti" element={<AdminCatalogLayout />}>
                  <Route index element={<Navigate to="kategorije" replace />} />
                  <Route path="kategorije" element={<AdminCategoriesPage />} />
                  <Route path="kategorije/:id" element={<Navigate to="/nadzor/sifranti/kategorije" replace />} />
                  <Route path="bonusi" element={<AdminBonusesPage />} />
                  <Route path="bonusi/:id" element={<Navigate to="/nadzor/sifranti/bonusi" replace />} />
                  <Route path="prijatelji" element={<AdminFriendsPage />} />
                  <Route path="prijatelji/:id" element={<Navigate to="/nadzor/sifranti/prijatelji" replace />} />
                  <Route path="boti" element={<AdminBotsPage />} />
                  <Route path="boti/:id" element={<Navigate to="/nadzor/sifranti/boti" replace />} />
                </Route>
                <Route path="kategorije" element={<Navigate to="/nadzor/sifranti/kategorije" replace />} />
                <Route path="kategorije/:id" element={<Navigate to="/nadzor/sifranti/kategorije" replace />} />
                <Route path="bonusi" element={<Navigate to="/nadzor/sifranti/bonusi" replace />} />
                <Route path="bonusi/:id" element={<Navigate to="/nadzor/sifranti/bonusi" replace />} />
                <Route path="prijatelji" element={<Navigate to="/nadzor/sifranti/prijatelji" replace />} />
                <Route path="prijatelji/:id" element={<Navigate to="/nadzor/sifranti/prijatelji" replace />} />
                <Route path="boti" element={<Navigate to="/nadzor/sifranti/boti" replace />} />
                <Route path="igre" element={<AdminSessionsPage />} />
                <Route path="igre/:sessionId" element={<AdminSessionDetailPage />} />
                <Route path="sobe" element={<AdminRoomsPage />} />
                <Route path="uporabniki" element={<AdminUsersPage />} />
                <Route path="nastavitve" element={<AdminSettingsPage />} />
                <Route path="ukazi" element={<AdminActionsPage />} />
                <Route path="simulacija" element={<Navigate to="/nadzor/ukazi" replace />} />
                <Route path="paleta" element={<AdminPaletteLayout />}>
                  <Route index element={<AdminUiPalettePage />} />
                  <Route path="zvok" element={<AdminSfxPalettePage />} />
                </Route>
                <Route path="testi" element={<AdminTestsPage />} />
              </Route>
              <Route path="vprasanja" element={<Navigate to="/nadzor/vsebina/vprasanja" replace />} />
            </Route>
          </Route>
        </Routes>
        </InvitesProvider>
      </BrowserRouter>
    </AuthProvider>
  );
}
