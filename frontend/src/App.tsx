import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";

import { AuthProvider } from "./auth";
import { Layout, RequireStaff, RequireUser } from "./components/Layout";
import { AdminSessionDetailPage, ResultPage } from "./components/SessionDetail";
import { AccountLayout } from "./pages/AccountLayout";
import { AdminActionsPage } from "./pages/AdminActionsPage";
import { AdminBonusesPage } from "./pages/AdminBonusesPage";
import { AdminBotsPage } from "./pages/AdminBotsPage";
import { AdminCategoriesPage } from "./pages/AdminCategoriesPage";
import { AdminCatalogLayout } from "./pages/AdminCatalogLayout";
import { AdminContentLayout } from "./pages/AdminContentLayout";
import { AdminContentPage } from "./pages/AdminContentPage";
import { AdminFriendsPage } from "./pages/AdminFriendsPage";
import { AdminHealthPage } from "./pages/AdminHealthPage";
import { AdminHomePage } from "./pages/AdminHomePage";
import { AdminLayout } from "./pages/AdminLayout";
import { AdminQuestionsPage } from "./pages/AdminQuestionsPage";
import { AdminReportsPage } from "./pages/AdminReportsPage";
import { AdminRoomsPage } from "./pages/AdminRoomsPage";
import { AdminSessionsPage } from "./pages/AdminSessionsPage";
import { AdminSettingsPage } from "./pages/AdminSettingsPage";
import { AdminTestsPage } from "./pages/AdminTestsPage";
import { AdminUiPalettePage } from "./pages/AdminUiPalettePage";
import { AdminUsersPage } from "./pages/AdminUsersPage";
import { GamePage } from "./pages/GamePage";
import { LogoutPage } from "./pages/LogoutPage";
import { HomePage } from "./pages/HomePage";
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

export function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route element={<Layout />}>
            <Route index element={<HomePage />} />
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
              <Route path="nadzor" element={<AdminLayout />}>
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
                <Route path="paleta" element={<AdminUiPalettePage />} />
                <Route path="testi" element={<AdminTestsPage />} />
              </Route>
              <Route path="vprasanja" element={<Navigate to="/nadzor/vsebina/vprasanja" replace />} />
            </Route>
          </Route>
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}
