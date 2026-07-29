import { createHashRouter, Navigate } from "react-router-dom";
import { Shell } from "./Shell";

/* Hash routing: a packaged Tauri app is served from a file-like origin, where
   history routing has no server to fall back on. */
export const router = createHashRouter([
  { path: "/", element: <Navigate to="/plan" replace /> },
  { path: "/plan", element: <Shell route="plan" /> },
  { path: "/library", element: <Shell route="library" /> },
  { path: "/articles", element: <Shell route="articles" /> },
  { path: "/articles/:articleId", element: <Shell route="articles" /> },
  { path: "/assets", element: <Shell route="assets" /> },
  { path: "/analytics", element: <Shell route="analytics" /> },
  { path: "/analytics/:channelId", element: <Shell route="analytics" /> },
  { path: "/settings", element: <Shell route="settings" /> },
  { path: "/settings/:section", element: <Shell route="settings" /> },
  { path: "*", element: <Navigate to="/plan" replace /> },
]);
