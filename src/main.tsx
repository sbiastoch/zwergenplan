import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./ui/App.tsx";
import "./ui/styles.css";

const root = document.getElementById("root");
if (!root) throw new Error("#root fehlt");
createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
