import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./ui/App.tsx";
// Selbst gehostet (OFL-1.1, Plan 0003 E6): Familienname „Bricolage Grotesque Variable“, Achsen Gewicht + optische Größe.
import "@fontsource-variable/bricolage-grotesque/opsz.css";
import "./ui/styles.css";

const root = document.getElementById("root");
if (!root) throw new Error("#root fehlt");
createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
