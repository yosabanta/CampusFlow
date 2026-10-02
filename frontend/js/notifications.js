/**
 * CampusFlow MVP — In-App Notification Center
 * Consumes GET /api/v1/notifications and PATCH /api/v1/notifications/{id}/read
 */

import { api } from "./api.js";
import { store } from "./state.js";
import { timeAgo, escapeHtml } from "./utils.js";

export async function fetchNotifications() {
  if (!store.getState().token) return [];

  try {
    const data = await api.get("/api/v1/notifications");
    const notifications = data.notifications || [];
    const unreadCount = data.unread_count !== undefined ? data.unread_count : notifications.filter(n => !n.is_read).length;

    store.setState({
      notifications,
      unreadNotificationCount: unreadCount
    });

    updateNotificationBadge(unreadCount);
    return notifications;
  } catch (err) {
    console.warn("Failed to fetch notifications:", err.message);
    return [];
  }
}

export async function markNotificationAsRead(id) {
  try {
    const updated = await api.patch(`/api/v1/notifications/${id}/read`);
    const currentList = store.getState().notifications;
    const newList = currentList.map(n => (n.id === id ? { ...n, is_read: true } : n));
    const newUnreadCount = Math.max(0, store.getState().unreadNotificationCount - 1);

    store.setState({
      notifications: newList,
      unreadNotificationCount: newUnreadCount
    });

    updateNotificationBadge(newUnreadCount);
    renderNotificationList(newList);
    return updated;
  } catch (err) {
    console.error("Failed to mark notification as read:", err);
  }
}

export function updateNotificationBadge(count) {
  const badge = document.getElementById("notif-badge");
  if (!badge) return;

  if (count > 0) {
    badge.textContent = count > 99 ? "99+" : String(count);
    badge.classList.remove("hidden");
  } else {
    badge.classList.add("hidden");
  }
}

export function renderNotificationList(notifications) {
  const body = document.getElementById("notif-panel-body");
  if (!body) return;

  if (!notifications || notifications.length === 0) {
    body.innerHTML = `
      <div class="state-container" style="padding: 24px 16px;">
        <div class="state-icon">🔔</div>
        <div class="state-title" style="font-size: 14px;">No notifications yet</div>
        <div class="state-desc" style="font-size: 12px;">Operational and academic updates will appear here.</div>
      </div>
    `;
    return;
  }

  body.innerHTML = notifications.map(n => `
    <div class="notification-item ${n.is_read ? 'read' : 'unread'}" data-id="${escapeHtml(n.id)}">
      <div class="notification-item-header">
        <span class="notification-item-title">${escapeHtml(n.title)}</span>
        <span class="notification-item-time">${timeAgo(n.created_at)}</span>
      </div>
      <div class="notification-item-msg">${escapeHtml(n.message)}</div>
      ${!n.is_read ? `
        <div class="notification-item-actions">
          <button class="btn-mark-read" data-action="mark-read" data-id="${escapeHtml(n.id)}" type="button">
            ✓ Mark as read
          </button>
        </div>
      ` : ''}
    </div>
  `).join("");

  // Attach mark-read handlers
  body.querySelectorAll('[data-action="mark-read"]').forEach(btn => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      const id = btn.getAttribute("data-id");
      if (id) markNotificationAsRead(id);
    });
  });
}
