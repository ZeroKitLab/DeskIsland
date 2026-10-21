import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { isTauri } from "./lib/window";
import "./styles.css";

// 纯浏览器预览时给一个深色壁纸背景
if (!isTauri()) {
  document.documentElement.classList.add("web");
}

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
