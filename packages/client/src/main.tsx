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

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
