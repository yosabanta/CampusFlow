/**
 * CampusFlow MVP — Central Reactive State Store
 */

class StateStore {
  constructor() {
    this.state = {
      token: localStorage.getItem("campusflow_token") || null,
      user: null,
      role: null,
      notices: [],
      notifications: [],
      unreadNotificationCount: 0,
      isOnline: navigator.onLine,
      theme: localStorage.getItem("campusflow_theme") || "light",
      currentRoute: window.location.hash || "#dashboard",
      sidebarOpen: false,
      notificationsOpen: false,
      accountMenuOpen: false
    };
    this.listeners = new Set();
  }

  getState() {
    return this.state;
  }

  setState(updates) {
    const prevState = { ...this.state };
    this.state = { ...this.state, ...updates };

    // Persist token and theme if changed
    if (updates.token !== undefined) {
      if (updates.token) {
        localStorage.setItem("campusflow_token", updates.token);
      } else {
        localStorage.removeItem("campusflow_token");
      }
    }
    if (updates.theme !== undefined) {
      localStorage.setItem("campusflow_theme", updates.theme);
    }

    this.notify(this.state, prevState);
  }

  subscribe(listener) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  notify(currentState, prevState) {
    for (const listener of this.listeners) {
      try {
        listener(currentState, prevState);
      } catch (err) {
        console.error("State listener error:", err);
      }
    }
  }
}

export const store = new StateStore();
