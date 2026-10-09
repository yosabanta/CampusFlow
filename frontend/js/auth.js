/**
 * CampusFlow MVP — Authentication Service
 * Integrates with /api/v1/auth/login and /api/v1/auth/me
 */

import { api } from "./api.js";
import { store } from "./state.js";

export async function login(username, password) {
  if (!username || !password) {
    throw new Error("Please enter your identifier and password.");
  }

  // 1. Submit credentials to login endpoint
  const tokenResponse = await api.post("/api/v1/auth/login", {
    username: username.trim(),
    password: password
  });

  const accessToken = tokenResponse.access_token;
  if (!accessToken) {
    throw new Error("Authentication failed: No access token received.");
  }

  // 2. Store JWT in reactive state and localStorage
  store.setState({ token: accessToken });

  // 3. Immediately fetch verified user profile
  const user = await fetchCurrentUser();

  return user;
}

export async function demoLogin(role, username) {
  // 1. Submit to demo-login endpoint
  const tokenResponse = await api.post("/api/v1/auth/demo-login", {
    role: role || undefined,
    username: username || undefined
  });

  const accessToken = tokenResponse.access_token;
  if (!accessToken) {
    throw new Error("Demo login failed: No access token received.");
  }

  // 2. Store JWT in reactive state and localStorage
  store.setState({ token: accessToken });

  // 3. Immediately fetch verified user profile
  const user = await fetchCurrentUser();

  return user;
}

export async function fetchCurrentUser() {
  const token = store.getState().token;
  if (!token) return null;

  try {
    const user = await api.get("/api/v1/auth/me");
    store.setState({
      user,
      role: user.role
    });
    return user;
  } catch (err) {
    console.error("Failed to load user profile:", err);
    // If auth failed, clear state
    if (err.status === 401) {
      logout();
    }
    throw err;
  }
}

export function logout() {
  store.setState({
    token: null,
    user: null,
    role: null,
    notifications: [],
    unreadNotificationCount: 0,
    sidebarOpen: false,
    notificationsOpen: false,
    accountMenuOpen: false
  });
  window.location.hash = "#login";
}

export function isAuthenticated() {
  const state = store.getState();
  return Boolean(state.token && state.user);
}

export function getCurrentUser() {
  return store.getState().user;
}

export function getCurrentRole() {
  return store.getState().role;
}

export async function registerStudent(data) {
  return await api.post("/api/v1/auth/register", data);
}
