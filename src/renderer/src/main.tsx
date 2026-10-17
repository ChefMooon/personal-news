import React from "react";
import ReactDOM from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import { ThemeProvider } from "./providers/ThemeProvider";
import App from "./App";
import "./assets/main.css";

const browserRoute =
  window.location.protocol === "http:" && window.location.pathname !== "/"
    ? `${window.location.pathname}${window.location.search}`
    : undefined;

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <ThemeProvider>
      <MemoryRouter initialEntries={browserRoute ? [browserRoute] : undefined}>
        <App />
      </MemoryRouter>
    </ThemeProvider>
  </React.StrictMode>,
);
