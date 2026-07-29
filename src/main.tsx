import React from "react";
import ReactDOM from "react-dom/client";
import { RouterProvider } from "react-router-dom";
import { router } from "./app/router";
import { DialogProvider } from "./components/Dialog";
import { StoreProvider } from "./lib/store";
import "./styles/tokens.css";
import "./styles/app.css";

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <StoreProvider>
      <DialogProvider>
        <RouterProvider router={router} />
      </DialogProvider>
    </StoreProvider>
  </React.StrictMode>,
);
