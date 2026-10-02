/**
 * CampusFlow MVP — UI Renderer & Presentation Engine
 * Header, Notice Board, RBAC Navigation, Dashboard, and Controlled Placeholders
 */

import { store } from "./state.js";
import { api } from "./api.js";
import { logout } from "./auth.js";
import { toggleTheme } from "./theme.js";
import { fetchNotifications, renderNotificationList } from "./notifications.js";
export { renderNotificationList };
import { escapeHtml, formatDate, getGreeting, formatRole } from "./utils.js";

/* --------------------------------------------------------------------------
   1. NOTICE BOARD (MANDATORY: IMMEDIATELY BELOW HEADER)
   -------------------------------------------------------------------------- */
export async function loadNoticeBoard() {
  const container = document.getElementById("notice-board-container");
  if (!container) return;

  // Loading skeleton
  container.innerHTML = `
    <div class="notice-board-header">
      <div class="notice-board-title-group">
        <span class="notice-board-badge">📢 NOTICE BOARD</span>
        <span>Loading Campus Notices...</span>
      </div>
      <div class="spinner" style="width: 16px; height: 16px; border-width: 2px;"></div>
    </div>
  `;

  try {
    const notices = await api.get("/api/v1/class-notices");
    store.setState({ notices });
    renderNoticeBoard(notices);
  } catch (err) {
    console.warn("Notice board fetch failed:", err.message);
    container.innerHTML = `
      <div class="notice-board-header">
        <div class="notice-board-title-group">
          <span class="notice-board-badge" style="background-color: var(--error-bg); border-color: var(--error-border); color: var(--error-text);">
            ⚠️ NOTICE BOARD
          </span>
          <span>Notice board temporarily offline</span>
        </div>
        <button id="btn-retry-notices" class="btn btn-sm btn-outline" type="button">Retry</button>
      </div>
    `;
    const btn = document.getElementById("btn-retry-notices");
    if (btn) btn.addEventListener("click", () => loadNoticeBoard());
  }
}

let noticeBoardExpanded = true;

export function renderNoticeBoard(notices = []) {
  const container = document.getElementById("notice-board-container");
  if (!container) return;

  const count = notices.length;

  if (count === 0) {
    container.innerHTML = `
      <div class="notice-board-header">
        <div class="notice-board-title-group">
          <span class="notice-board-badge">📢 NOTICE BOARD</span>
          <span class="text-muted">No active circulars or timetable alerts</span>
        </div>
        <button id="btn-refresh-notices" class="btn btn-sm btn-outline" type="button" aria-label="Refresh notices">↻ Refresh</button>
      </div>
    `;
    document.getElementById("btn-refresh-notices")?.addEventListener("click", () => loadNoticeBoard());
    return;
  }

  container.innerHTML = `
    <div class="notice-board-header">
      <div class="notice-board-title-group">
        <span class="notice-board-badge">📢 CAMPUS & ACADEMIC NOTICES (${count})</span>
        <span style="font-size: 12px; color: var(--text-secondary);">Important updates for your cohort</span>
      </div>
      <div class="notice-board-controls">
        <button id="btn-refresh-notices" class="btn-notice-toggle" type="button" title="Refresh">↻ Refresh</button>
        <button id="btn-toggle-notices" class="btn-notice-toggle" type="button" aria-expanded="${noticeBoardExpanded}">
          ${noticeBoardExpanded ? '▲ Minimize' : '▼ View All'}
        </button>
      </div>
    </div>
    <div id="notice-carousel-list" class="notice-carousel" style="display: ${noticeBoardExpanded ? 'flex' : 'none'};">
      ${notices.map(notice => {
        const typeClass = (notice.notice_type || '').toLowerCase();
        const typeBadge = formatNoticeTypeBadge(notice.notice_type);
        return `
          <div class="notice-item ${typeClass}">
            <div class="notice-content">
              <div class="notice-title">
                ${typeBadge}
                <span>${escapeHtml(notice.subject)}</span>
              </div>
              <div class="notice-details">${escapeHtml(notice.details)}</div>
            </div>
            <div class="notice-meta">
              <span>📅 ${formatDate(notice.class_date)}</span>
              <span>⏰ ${escapeHtml(notice.period || '')}</span>
              <span>🎓 ${escapeHtml(notice.target_branch || 'All')} (${escapeHtml(notice.target_section || 'All')})</span>
            </div>
          </div>
        `;
      }).join("")}
    </div>
  `;

  document.getElementById("btn-refresh-notices")?.addEventListener("click", () => loadNoticeBoard());
  document.getElementById("btn-toggle-notices")?.addEventListener("click", () => {
    noticeBoardExpanded = !noticeBoardExpanded;
    const list = document.getElementById("notice-carousel-list");
    const toggleBtn = document.getElementById("btn-toggle-notices");
    if (list) list.style.display = noticeBoardExpanded ? 'flex' : 'none';
    if (toggleBtn) {
      toggleBtn.innerHTML = noticeBoardExpanded ? '▲ Minimize' : '▼ View All';
      toggleBtn.setAttribute("aria-expanded", String(noticeBoardExpanded));
    }
  });
}

function formatNoticeTypeBadge(type) {
  switch (type) {
    case "CANCELLED":
      return `<span class="status-badge rejected">✕ Cancelled</span>`;
    case "RESCHEDULED":
      return `<span class="status-badge pending">◷ Rescheduled</span>`;
    case "ROOM_CHANGED":
      return `<span class="status-badge warning">⇄ Room Changed</span>`;
    case "SWITCHED":
      return `<span class="status-badge info">⇄ Switched</span>`;
    case "POSTPONED":
      return `<span class="status-badge pending">◷ Postponed</span>`;
    default:
      return `<span class="status-badge info">ℹ ${escapeHtml(type || 'Notice')}</span>`;
  }
}

/* --------------------------------------------------------------------------
   2. HEADER & ACCOUNT MENU
   -------------------------------------------------------------------------- */
export function updateHeader(user) {
  const greetingEl = document.getElementById("header-greeting");
  const accountChip = document.getElementById("account-chip");
  const accountName = document.getElementById("account-name");
  const accountAvatar = document.getElementById("account-avatar");
  const accountDropdown = document.getElementById("account-dropdown");

  if (!user) {
    if (greetingEl) greetingEl.innerHTML = "";
    if (accountChip) accountChip.style.display = "none";
    if (accountDropdown) accountDropdown.classList.remove("active");
    return;
  }

  // Set greeting
  if (greetingEl) {
    const greetingText = getGreeting(user.first_name);
    greetingEl.innerHTML = `<span class="greeting-name">${escapeHtml(greetingText)}</span>`;
  }

  // Set account chip
  if (accountChip) {
    accountChip.style.display = "flex";
  }
  if (accountName) {
    accountName.textContent = `${user.first_name} ${user.last_name}`;
  }
  if (accountAvatar) {
    const initials = `${(user.first_name || 'U')[0]}${(user.last_name || '')[0] || ''}`.toUpperCase();
    accountAvatar.textContent = initials;
  }

  // Populate account dropdown modal
  if (accountDropdown) {
    let subInfo = "";
    if (user.student_profile) {
      subInfo = `Roll: ${escapeHtml(user.student_profile.roll_number)} • Batch ${user.student_profile.batch_year}`;
    } else if (user.staff_profile) {
      subInfo = `${escapeHtml(user.staff_profile.designation)} • ${escapeHtml(user.staff_profile.department_id)}`;
    }

    accountDropdown.innerHTML = `
      <div class="account-info-header">
        <div class="account-info-name">${escapeHtml(user.first_name)} ${escapeHtml(user.last_name)}</div>
        <div class="account-info-email">${escapeHtml(user.email)}</div>
        <div class="account-info-meta">
          <span class="status-badge info">${escapeHtml(formatRole(user.role))}</span>
        </div>
        ${subInfo ? `<div style="font-size: 11px; color: var(--text-muted); margin-top: 4px;">${subInfo}</div>` : ''}
      </div>
      <div class="account-dropdown-menu">
        <a href="#profile" class="account-dropdown-item" id="btn-dropdown-profile" style="text-decoration: none; color: inherit;">
          <span>👤</span> <span>Institutional Profile</span>
        </a>
        <button class="account-dropdown-item" id="btn-dropdown-theme" type="button">
          <span>🌓</span> <span>Toggle Theme</span>
        </button>
        <button class="account-dropdown-item danger" id="btn-dropdown-logout" type="button">
          <span>🚪</span> <span>Sign Out</span>
        </button>
      </div>
    `;

    document.getElementById("btn-dropdown-profile")?.addEventListener("click", () => accountDropdown.classList.remove("active"));
    document.getElementById("btn-dropdown-theme")?.addEventListener("click", () => toggleTheme());
    document.getElementById("btn-dropdown-logout")?.addEventListener("click", () => logout());
  }
}

/* --------------------------------------------------------------------------
   3. RBAC NAVIGATION MENU
   -------------------------------------------------------------------------- */
export function renderNavigation(role) {
  const navContainer = document.getElementById("sidebar-nav-container");
  const roleBadgeEl = document.getElementById("sidebar-role-badge");
  if (!navContainer) return;

  if (roleBadgeEl) {
    roleBadgeEl.textContent = formatRole(role);
  }

  const navItems = getNavItemsForRole(role);

  navContainer.innerHTML = `
    <div class="nav-section-title">Institutional Modules</div>
    <ul class="nav-list">
      ${navItems.map(item => `
        <li>
          <a href="${item.route}" class="nav-link ${window.location.hash === item.route ? 'active' : ''}" data-route="${item.route}">
            <span class="nav-link-icon">${item.icon}</span>
            <span>${escapeHtml(item.label)}</span>
            ${item.badge ? `<span class="nav-link-badge">${escapeHtml(item.badge)}</span>` : ''}
          </a>
        </li>
      `).join("")}
    </ul>
    <div class="nav-section-title" style="margin-top: 24px;">Platform</div>
    <ul class="nav-list">
      <li>
        <a href="#about" class="nav-link ${window.location.hash === '#about' ? 'active' : ''}">
          <span class="nav-link-icon">ℹ️</span>
          <span>System Information</span>
        </a>
      </li>
    </ul>
  `;

  // Close sidebar on link click in mobile view
  navContainer.querySelectorAll(".nav-link").forEach(link => {
    link.addEventListener("click", () => {
      if (window.innerWidth < 1024) {
        toggleSidebar(false);
      }
    });
  });
}

function getNavItemsForRole(role) {
  switch (role) {
    case "STUDENT":
      return [
        { label: "Dashboard", route: "#dashboard", icon: "📊" },
        { label: "Notices", route: "#class-notices", icon: "📢" },
        { label: "Attendance", route: "#attendance", icon: "📝" },
        { label: "Complaints", route: "#complaints", icon: "🛠️" },
        { label: "Gate Pass", route: "#gatepasses", icon: "🎫" },
        { label: "Help a Friend", route: "#help-a-friend", icon: "🤝" },
        { label: "Documents", route: "#documents", icon: "📄" },
        { label: "Study Materials", route: "#materials", icon: "📚" },
        { label: "Notifications", route: "#notifications", icon: "🔔" },
        { label: "Profile", route: "#profile", icon: "👤" }
      ];

    case "ADMIN":
      return [
        { label: "Control Tower", route: "#dashboard", icon: "🏢" },
        { label: "Complaints", route: "#complaints", icon: "🛠️" },
        { label: "SLA Breaches", route: "#sla-breaches", icon: "⏱️" },
        { label: "Recurring Issues", route: "#recurring-issues", icon: "🔁" },
        { label: "Announcements", route: "#announcements", icon: "📢" },
        { label: "Audit Logs", route: "#audit", icon: "🛡️" },
        { label: "Notifications", route: "#notifications", icon: "🔔" },
        { label: "Profile", route: "#profile", icon: "👤" }
      ];

    case "WARDEN":
      return [
        { label: "Dashboard", route: "#dashboard", icon: "🏠" },
        { label: "Gate Pass Requests", route: "#gatepasses", icon: "🎫" },
        { label: "Complaints", route: "#complaints", icon: "🛠️" },
        { label: "Notifications", route: "#notifications", icon: "🔔" },
        { label: "Profile", route: "#profile", icon: "👤" }
      ];

    case "HOSTEL_FACULTY":
      return [
        { label: "Dashboard", route: "#dashboard", icon: "🏛️" },
        { label: "Gate Pass Records", route: "#gatepasses", icon: "🎫" },
        { label: "Complaints", route: "#complaints", icon: "🛠️" },
        { label: "Notifications", route: "#notifications", icon: "🔔" },
        { label: "Profile", route: "#profile", icon: "👤" }
      ];

    case "TEACHER":
      return [
        { label: "Dashboard", route: "#dashboard", icon: "📊" },
        { label: "Class Management", route: "#class-management", icon: "🗓️" },
        { label: "Attendance", route: "#attendance", icon: "📝" },
        { label: "Class Notices", route: "#class-notices", icon: "📢" },
        { label: "Study Materials", route: "#materials", icon: "📚" },
        { label: "Notifications", route: "#notifications", icon: "🔔" },
        { label: "Profile", route: "#profile", icon: "👤" }
      ];

    case "LAB_ASSISTANT":
      return [
        { label: "Dashboard", route: "#dashboard", icon: "📊" },
        { label: "Lab Equipment", route: "#lab", icon: "🔬" },
        { label: "Requisitions", route: "#requisitions", icon: "📦" },
        { label: "Notices", route: "#class-notices", icon: "📢" },
        { label: "Notifications", route: "#notifications", icon: "🔔" },
        { label: "Profile", route: "#profile", icon: "👤" }
      ];

    case "STAFF":
      return [
        { label: "Dashboard", route: "#dashboard", icon: "🔧" },
        { label: "Assigned Complaints", route: "#complaints", icon: "🛠️" },
        { label: "Notifications", route: "#notifications", icon: "🔔" },
        { label: "Profile", route: "#profile", icon: "👤" }
      ];

    case "GUARD":
      return [
        { label: "Gate Verification", route: "#scanner", icon: "📷" },
        { label: "Recent Gate Activity", route: "#gatepasses", icon: "📋" },
        { label: "Notifications", route: "#notifications", icon: "🔔" },
        { label: "Profile", route: "#profile", icon: "👤" }
      ];

    default:
      return [
        { label: "Dashboard", route: "#dashboard", icon: "📊" }
      ];
  }
}

export function toggleSidebar(forceState = null) {
  const sidebar = document.getElementById("app-sidebar");
  const overlay = document.getElementById("sidebar-overlay");
  if (!sidebar) return;

  const isOpen = forceState !== null ? forceState : !sidebar.classList.contains("open");

  if (isOpen) {
    sidebar.classList.add("open");
    if (overlay) overlay.classList.add("active");
  } else {
    sidebar.classList.remove("open");
    if (overlay) overlay.classList.remove("active");
  }

  store.setState({ sidebarOpen: isOpen });
}

/* --------------------------------------------------------------------------
   4. TOAST ALERTS
   -------------------------------------------------------------------------- */
export function showToast(message, type = "info", duration = 4000) {
  const container = document.getElementById("toast-container");
  if (!container) return;

  const toast = document.createElement("div");
  toast.className = `toast ${type}`;
  toast.innerHTML = `
    <span>${type === 'success' ? '✓' : type === 'error' ? '✕' : type === 'warning' ? '⚠' : 'ℹ'}</span>
    <span>${escapeHtml(message)}</span>
  `;

  container.appendChild(toast);

  setTimeout(() => {
    toast.style.opacity = "0";
    toast.style.transform = "translateY(8px)";
    toast.style.transition = "all 0.3s ease";
    setTimeout(() => toast.remove(), 300);
  }, duration);
}

/* --------------------------------------------------------------------------
   5. CONTROLLED MODULE PLACEHOLDER (For Phase 8+ Workflows)
   -------------------------------------------------------------------------- */
export function renderPlaceholder(moduleName, description) {
  const main = document.getElementById("app-main-content");
  if (!main) return;

  main.innerHTML = `
    <div class="card" style="max-width: 720px; margin: 40px auto; text-align: center;">
      <div class="state-container">
        <div class="state-icon">🏗️</div>
        <div class="state-title">${escapeHtml(moduleName)}</div>
        <div class="state-desc">${escapeHtml(description)}</div>
        <div style="margin-top: 12px;">
          <span class="status-badge info">Scheduled for Phase 8 / 9 Implementation</span>
        </div>
        <p style="font-size: 12px; color: var(--text-muted); margin-top: 16px;">
          Backend APIs, business rules, and database models are complete and verified. The dedicated frontend workflow view will connect in subsequent phases.
        </p>
        <div style="margin-top: 16px;">
          <a href="#dashboard" class="btn btn-primary">Return to Dashboard</a>
        </div>
      </div>
    </div>
  `;
}
