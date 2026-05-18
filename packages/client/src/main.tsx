import React from "react";
import ReactDOM from "react-dom/client";
import "./index.css";
import { App } from "./App";

// Block Chrome's right-click menu everywhere in the app so right-click can
// be used for camera orbit / game actions. Allows it only inside <input> /
// <textarea> so users can still paste/cut text.
document.addEventListener("contextmenu", (e) => {
  const t = e.target as HTMLElement | null;
  if (t?.tagName === "INPUT" || t?.tagName === "TEXTAREA") return;
  e.preventDefault();
});

// Global click sfx for any <button> in the UI — tactile feedback.
// Lazy-loaded so AudioContext only initializes on first user interaction.
document.addEventListener("pointerdown", (e) => {
  const t = e.target as HTMLElement | null;
  if (!t) return;
  const btn = t.closest("button");
  if (!btn) return;
  // Skip rapid-fire elements (sliders / range)
  if (btn.querySelector("input[type=range]")) return;
  import("./sfx/sfx").then((m) => m.Sfx?.click?.()).catch(() => {});
}, { capture: true });

// PWA: auto-update service worker registration. Imports from a virtual module
// provided by vite-plugin-pwa at build time. In dev (devOptions.enabled=false),
// the import is a no-op stub.
import("virtual:pwa-register").then(({ registerSW }) => {
  registerSW({ immediate: true, onRegisterError(err) { console.warn("[pwa] sw registration failed", err); } });
}).catch(() => { /* dev mode — virtual module not present */ });

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
