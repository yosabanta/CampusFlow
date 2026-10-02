/**
 * CampusFlow MVP — Core Utilities
 */

export function escapeHtml(str) {
  if (str === null || str === undefined) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

export function formatDate(dateInput) {
  if (!dateInput) return "—";
  try {
    const d = new Date(dateInput);
    if (isNaN(d.getTime())) return String(dateInput);
    return d.toLocaleDateString("en-IN", {
      day: "numeric",
      month: "short",
      year: "numeric"
    });
  } catch {
    return String(dateInput);
  }
}

export function formatDateTime(dateInput) {
  if (!dateInput) return "—";
  try {
    const d = new Date(dateInput);
    if (isNaN(d.getTime())) return String(dateInput);
    return d.toLocaleString("en-IN", {
      day: "numeric",
      month: "short",
      hour: "2-digit",
      minute: "2-digit"
    });
  } catch {
    return String(dateInput);
  }
}

export function timeAgo(dateInput) {
  if (!dateInput) return "";
  try {
    const d = new Date(dateInput);
    const now = new Date();
    const diffSecs = Math.floor((now - d) / 1000);

    if (diffSecs < 60) return "Just now";
    if (diffSecs < 3600) return `${Math.floor(diffSecs / 60)}m ago`;
    if (diffSecs < 86400) return `${Math.floor(diffSecs / 3600)}h ago`;
    if (diffSecs < 604800) return `${Math.floor(diffSecs / 86400)}d ago`;
    return formatDate(d);
  } catch {
    return "";
  }
}

export function getGreeting(name = "") {
  const hour = new Date().getHours();
  let salutation = "Good day";
  if (hour >= 4 && hour < 12) salutation = "Good morning";
  else if (hour >= 12 && hour < 17) salutation = "Good afternoon";
  else if (hour >= 17 && hour < 22) salutation = "Good evening";
  else salutation = "Welcome";

  return name ? `${salutation}, ${name}` : salutation;
}

export function formatRole(role) {
  const roleMap = {
    STUDENT: "Student",
    ADMIN: "Campus Admin",
    WARDEN: "Warden",
    HOSTEL_FACULTY: "Hostel Authority Faculty",
    TEACHER: "Teacher / Academic Staff",
    LAB_ASSISTANT: "Lab Assistant",
    STAFF: "Maintenance Staff",
    GUARD: "Security Guard"
  };
  return roleMap[role] || role || "User";
}

export function debounce(func, wait = 250) {
  let timeout;
  return function executedFunction(...args) {
    const later = () => {
      clearTimeout(timeout);
      func(...args);
    };
    clearTimeout(timeout);
    timeout = setTimeout(later, wait);
  };
}
