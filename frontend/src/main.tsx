import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import * as Sentry from "@sentry/react";

import { App } from "./App";
import "flag-icons/css/flag-icons.min.css";
import "./styles.css";

const sentryDsn = import.meta.env.VITE_SENTRY_DSN as string | undefined;
if (sentryDsn) {
  Sentry.init({
    dsn: sentryDsn,
    environment: import.meta.env.MODE,
    tracesSampleRate: 0.1,
  });
}

const root = createRoot(document.getElementById("root")!);
root.render(
  <StrictMode>
    {sentryDsn ? (
      <Sentry.ErrorBoundary fallback={<p className="error">Prišlo je do napake. Osveži stran.</p>}>
        <App />
      </Sentry.ErrorBoundary>
    ) : (
      <App />
    )}
  </StrictMode>,
);
