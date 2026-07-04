import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { installGlobalErrorHandlers } from "@sweepr/ui";
import "./index.css";

const API_URL =
  (import.meta.env.VITE_API_URL as string | undefined) ?? "https://api.getsweepr.com";
installGlobalErrorHandlers({ app: "status", apiUrl: API_URL });

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
