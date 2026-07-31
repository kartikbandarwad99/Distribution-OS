import React from "react";
import ReactDOM from "react-dom/client";
import { RouterProvider } from "react-router-dom";
import { router } from "./app/router";
import { SessionGate } from "./app/SessionGate";
import { DialogProvider } from "./components/Dialog";
import { StoreProvider } from "./lib/store";
import { MetricsProvider } from "./lib/metrics";
import "./styles/tokens.css";
import "./styles/app.css";

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <SessionGate>
      <StoreProvider>
        <MetricsProvider>
          <DialogProvider>
            <RouterProvider router={router} />
          </DialogProvider>
        </MetricsProvider>
      </StoreProvider>
    </SessionGate>
  </React.StrictMode>,
);
