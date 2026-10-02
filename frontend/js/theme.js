/**
 * CampusFlow MVP — Theme Management
 * Light / Dark Theme switching with localStorage persistence
 */

import { store } from "./state.js";

export function initTheme() {
  const savedTheme = localStorage.getItem("campusflow_theme");
  let activeTheme = savedTheme;

  if (!activeTheme) {
    // Check OS preference
    const prefersDark = window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches;
    activeTheme = prefersDark ? "dark" : "light";
  }

  applyTheme(activeTheme);

  // Listen to OS theme changes if user has not explicitly chosen
  if (window.matchMedia) {
    window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", (e) => {
      if (!localStorage.getItem("campusflow_theme")) {
        applyTheme(e.matches ? "dark" : "light");
      }
    });
  }
}

export function applyTheme(theme) {
  const normalized = theme === "dark" ? "dark" : "light";
  document.documentElement.setAttribute("data-theme", normalized);
  store.setState({ theme: normalized });

  // Update theme button icon/label if present
  const themeBtn = document.getElementById("theme-toggle-btn");
  if (themeBtn) {
    themeBtn.setAttribute("aria-label", normalized === "dark" ? "Switch to light theme" : "Switch to dark theme");
    themeBtn.innerHTML = normalized === "dark" ? "☀️" : "🌙";
  }
}

export function toggleTheme() {
  const currentTheme = document.documentElement.getAttribute("data-theme") || "light";
  const newTheme = currentTheme === "light" ? "dark" : "light";
  applyTheme(newTheme);
  return newTheme;
}
