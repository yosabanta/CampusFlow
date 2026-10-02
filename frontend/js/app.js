/**
 * CampusFlow MVP — Main Application Entrypoint
 * Bootstrap: Service Worker, Reactive State, Theme, Auth, Shell Listeners & Routing
 */

import { store } from "./state.js";
import { initTheme, toggleTheme } from "./theme.js";
import { fetchCurrentUser, isAuthenticated, logout } from "./auth.js";
import { initRouter, handleRoute } from "./router.js";
import { updateHeader, renderNavigation, loadNoticeBoard, toggleSidebar } from "./ui.js";
import { fetchNotifications, updateNotificationBadge, renderNotificationList } from "./notifications.js";

// Initialize Service Worker for PWA Offline App Shell Support
async function registerServiceWorker() {
  if ("serviceWorker" in navigator) {
    try {
      const reg = await navigator.serviceWorker.register("./sw.js");
      console.log("CampusFlow PWA ServiceWorker active:", reg.scope);
    } catch (err) {
      console.warn("ServiceWorker registration skipped or failed:", err.message);
    }
  }
}

// Online / Offline Detection
function initNetworkListeners() {
  const offlineBanner = document.getElementById("offline-banner");

  const updateNetworkStatus = () => {
    const isOnline = navigator.onLine;
    store.setState({ isOnline });
    if (offlineBanner) {
      offlineBanner.style.display = isOnline ? "none" : "flex";
    }
  };

  window.addEventListener("online", updateNetworkStatus);
  window.addEventListener("offline", updateNetworkStatus);
  updateNetworkStatus();
}

// Global UI Shell Event Handlers
function setupShellListeners() {
  // Hamburger sidebar toggle
  const hamburgerBtn = document.getElementById("btn-hamburger");
  const overlay = document.getElementById("sidebar-overlay");
  hamburgerBtn?.addEventListener("click", () => toggleSidebar());
  overlay?.addEventListener("click", () => toggleSidebar(false));

  // Theme switch button
  const themeBtn = document.getElementById("theme-toggle-btn");
  themeBtn?.addEventListener("click", () => toggleTheme());

  // Notification bell & dropdown
  const notifBtn = document.getElementById("btn-notification");
  const notifPanel = document.getElementById("notification-panel");
  notifBtn?.addEventListener("click", (e) => {
    e.stopPropagation();
    const isActive = notifPanel?.classList.toggle("active");
    store.setState({ notificationsOpen: Boolean(isActive) });
    if (isActive) {
      // Close account dropdown if open
      document.getElementById("account-dropdown")?.classList.remove("active");
      renderNotificationList(store.getState().notifications);
      fetchNotifications();
    }
  });

  // Account chip & dropdown
  const accountChip = document.getElementById("account-chip");
  const accountDropdown = document.getElementById("account-dropdown");
  accountChip?.addEventListener("click", (e) => {
    e.stopPropagation();
    const isActive = accountDropdown?.classList.toggle("active");
    store.setState({ accountMenuOpen: Boolean(isActive) });
    if (isActive) {
      // Close notifications if open
      notifPanel?.classList.remove("active");
    }
  });

  // Close open dropdowns when clicking outside
  document.addEventListener("click", (e) => {
    if (notifPanel && !notifPanel.contains(e.target) && e.target !== notifBtn) {
      notifPanel.classList.remove("active");
      store.setState({ notificationsOpen: false });
    }
    if (accountDropdown && !accountDropdown.contains(e.target) && !accountChip?.contains(e.target)) {
      accountDropdown.classList.remove("active");
      store.setState({ accountMenuOpen: false });
    }
  });

  // Header quick logout button
  document.getElementById("btn-header-logout")?.addEventListener("click", () => logout());
}

// State synchronization listener
function setupStateSync() {
  store.subscribe((state, prev) => {
    if (state.user !== prev.user) {
      updateHeader(state.user);
      if (state.user) {
        renderNavigation(state.user.role);
        loadNoticeBoard();
        fetchNotifications();
      }
    }
    if (state.unreadNotificationCount !== prev.unreadNotificationCount) {
      updateNotificationBadge(state.unreadNotificationCount);
    }
  });
}

// Application Lifecycle Bootstrap
async function bootstrap() {
  console.log("Bootstrapping CampusFlow Phase 7 Frontend...");

  initTheme();
  initNetworkListeners();
  setupShellListeners();
  setupStateSync();
  await registerServiceWorker();

  // Verify stored session
  if (store.getState().token) {
    try {
      const user = await fetchCurrentUser();
      if (user) {
        updateHeader(user);
        renderNavigation(user.role);
        loadNoticeBoard();
        fetchNotifications();
      }
    } catch {
      console.warn("Stored session expired or invalid. Requiring authentication.");
    }
  }

  // Initialize router
  initRouter();
}

// Start on DOM content loaded
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", bootstrap);
} else {
  bootstrap();
}
