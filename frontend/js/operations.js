/**
 * CampusFlow MVP — Operations Module
 * Phase 12: Department / Maintenance Staff & Security Guard Experiences
 *
 * Roles Covered:
 * 1. STAFF (Department / Maintenance Staff — ramesh.estate@bput.ac.in)
 *    - Dashboard / Work Orders
 *    - Assigned Complaints Ledger & Triage
 *    - Status Transitions (ASSIGNED -> IN_PROGRESS -> RESOLVED) with Resolution Notes
 *
 * 2. GUARD (Security Guard — guard.gate1@bput.ac.in)
 *    - Gate Verification Workstation (High-Contrast, Touch Target >= 44px)
 *    - Atomic Single-Use QR Pass Verification & Consumption
 *    - Cryptographic Replay Attack / Used QR Rejection Display
 *    - Student Return / Check-In Recording
 *    - Recent Perimeter Gate Activity Ledger
 */

import { api } from "./api.js";
import { showToast } from "./ui.js";
import { escapeHtml, formatDate, formatDateTime } from "./utils.js";

/* ==========================================================================
   PART A: DEPARTMENT / MAINTENANCE STAFF EXPERIENCE (STAFF)
   ========================================================================== */

/**
 * Render the Maintenance Staff Dashboard
 * Highlights assigned workload, pending triage, ongoing repairs, and completed tasks.
 */
export async function renderMaintenanceStaffDashboard(mainEl, user) {
  if (!mainEl) return;

  mainEl.innerHTML = `
    <div style="margin-bottom: 20px;">
      <div style="display: flex; justify-content: space-between; align-items: flex-start; flex-wrap: wrap; gap: 12px;">
        <div>
          <h2 style="margin: 0; font-size: 20px; font-weight: 800; color: var(--text);">
            🔧 Maintenance & Operations Workstation
          </h2>
          <p style="margin: 4px 0 0 0; font-size: 13px; color: var(--text-secondary);">
            Assigned infrastructure work orders, repair dispatches, and ticket resolutions for <strong>${escapeHtml(user.first_name || 'Staff')} ${escapeHtml(user.last_name || '')}</strong>.
          </p>
        </div>
        <div style="display: flex; gap: 8px;">
          <button class="btn btn-secondary btn-sm" id="btn-refresh-staff-dash" type="button" style="min-height: 44px;">
            🔄 Refresh
          </button>
          <a class="btn btn-primary btn-sm" href="#complaints" style="min-height: 44px; display: inline-flex; align-items: center;">
            🛠️ View All Assigned
          </a>
        </div>
      </div>
    </div>

    <!-- Telemetry KPI Summary Grid -->
    <div id="staff-kpi-container" style="display: grid; grid-template-columns: repeat(auto-fit, minmax(210px, 1fr)); gap: 14px; margin-bottom: 22px;">
      <div class="card" style="padding: 16px; border-left: 4px solid var(--primary);"><div class="spinner"></div></div>
    </div>

    <!-- Active Repair Priority Queue -->
    <div class="card" style="margin-bottom: 22px;">
      <div class="card-header" style="display: flex; justify-content: space-between; align-items: center;">
        <div class="card-title" style="display: flex; align-items: center; gap: 8px;">
          <span>⚡ Priority Action Queue (Open & In-Progress)</span>
        </div>
        <span class="status-badge info" id="staff-active-count-badge">Loading...</span>
      </div>
      <div id="staff-active-queue-container" style="padding: 16px;">
        <div class="state-container"><div class="spinner"></div></div>
      </div>
    </div>

    <!-- Quick Dispatch Reference & Work Order Standards -->
    <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 16px;">
      <div class="card" style="padding: 16px;">
        <h4 style="margin: 0 0 8px 0; font-size: 14px; font-weight: 700;">📋 Statutory Maintenance Protocol</h4>
        <ul style="margin: 0; padding-left: 18px; font-size: 12px; color: var(--text-secondary); line-height: 1.6;">
          <li>All urgent electrical, plumbing, and safety repairs carry a <strong>48-hour SLA</strong>.</li>
          <li>Transition ticket to <strong>IN_PROGRESS</strong> immediately upon reaching physical site.</li>
          <li>Resolution notes are <strong>mandatory</strong> upon marking ticket <strong>RESOLVED</strong>.</li>
          <li>Ticket closures are audited under institutional PS07 compliance telemetry.</li>
        </ul>
      </div>

      <div class="card" style="padding: 16px;">
        <h4 style="margin: 0 0 8px 0; font-size: 14px; font-weight: 700;">👤 Duty Technician Identity</h4>
        <div style="font-size: 13px; color: var(--text); line-height: 1.5;">
          <div><strong>Technician:</strong> ${escapeHtml(user.first_name)} ${escapeHtml(user.last_name)}</div>
          <div><strong>Department:</strong> Campus Estate & Civil Maintenance</div>
          <div><strong>Institutional Email:</strong> ${escapeHtml(user.email)}</div>
          <div><strong>Contact Hotline:</strong> ${escapeHtml(user.phone_number || 'N/A')}</div>
        </div>
      </div>
    </div>
  `;

  document.getElementById("btn-refresh-staff-dash")?.addEventListener("click", () => {
    loadStaffDashboardData(user);
  });

  await loadStaffDashboardData(user);
}

/**
 * Fetch and populate staff dashboard metrics and priority queue
 */
async function loadStaffDashboardData(user) {
  const kpiRoot = document.getElementById("staff-kpi-container");
  const queueRoot = document.getElementById("staff-active-queue-container");
  const countBadge = document.getElementById("staff-active-count-badge");

  try {
    const complaints = await api.get("/api/v1/complaints");
    const list = Array.isArray(complaints) ? complaints : [];

    const total = list.length;
    const assignedCount = list.filter(c => c.status === "ASSIGNED" || c.status === "OPEN" || c.status === "REOPENED").length;
    const inProgressCount = list.filter(c => c.status === "IN_PROGRESS").length;
    const resolvedCount = list.filter(c => c.status === "RESOLVED" || c.status === "COMPLETED").length;

    if (kpiRoot) {
      kpiRoot.innerHTML = `
        <div class="card" style="padding: 16px; border-left: 4px solid var(--primary);">
          <div style="font-size: 11px; font-weight: 700; color: var(--text-muted); text-transform: uppercase;">Total Assigned</div>
          <div style="font-size: 26px; font-weight: 800; color: var(--primary); margin: 6px 0;">${total}</div>
          <div style="font-size: 12px; color: var(--text-secondary);">Cumulative work orders</div>
        </div>

        <div class="card" style="padding: 16px; border-left: 4px solid var(--warning);">
          <div style="font-size: 11px; font-weight: 700; color: var(--text-muted); text-transform: uppercase;">Awaiting Triage</div>
          <div style="font-size: 26px; font-weight: 800; color: var(--warning); margin: 6px 0;">${assignedCount}</div>
          <div style="font-size: 12px; color: var(--text-secondary);">Assigned / Pending start</div>
        </div>

        <div class="card" style="padding: 16px; border-left: 4px solid #3B82F6;">
          <div style="font-size: 11px; font-weight: 700; color: var(--text-muted); text-transform: uppercase;">In Progress</div>
          <div style="font-size: 26px; font-weight: 800; color: #3B82F6; margin: 6px 0;">${inProgressCount}</div>
          <div style="font-size: 12px; color: var(--text-secondary);">Currently being serviced</div>
        </div>

        <div class="card" style="padding: 16px; border-left: 4px solid var(--success);">
          <div style="font-size: 11px; font-weight: 700; color: var(--text-muted); text-transform: uppercase;">Resolved & Closed</div>
          <div style="font-size: 26px; font-weight: 800; color: var(--success); margin: 6px 0;">${resolvedCount}</div>
          <div style="font-size: 12px; color: var(--text-secondary);">Work verified completed</div>
        </div>
      `;
    }

    if (countBadge) {
      countBadge.textContent = `${assignedCount + inProgressCount} Active`;
    }

    if (queueRoot) {
      const activeQueue = list.filter(c => c.status !== "RESOLVED" && c.status !== "COMPLETED");

      if (activeQueue.length === 0) {
        queueRoot.innerHTML = `
          <div class="state-container" style="padding: 30px 10px;">
            <div class="state-icon" style="font-size: 32px;">🎉</div>
            <div class="state-title" style="font-size: 16px;">Queue Clear — No Pending Repairs</div>
            <div class="state-desc" style="font-size: 13px;">All assigned maintenance complaints have been successfully inspected and resolved.</div>
          </div>
        `;
        return;
      }

      queueRoot.innerHTML = `
        <div style="display: flex; flex-direction: column; gap: 12px;">
          ${activeQueue.map(c => `
            <div class="card" style="padding: 14px; border: 1px solid var(--border); display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 12px;">
              <div style="min-width: 240px; flex: 1;">
                <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 4px;">
                  <span style="font-family: var(--font-family-mono); font-size: 11px; font-weight: 700; background: var(--surface-hover); padding: 2px 6px; border-radius: 4px;">
                    ${escapeHtml(c.ticket_number)}
                  </span>
                  <span class="status-badge ${getStatusBadgeClass(c.status)}">${escapeHtml(c.status)}</span>
                  ${c.priority ? `<span class="status-badge ${c.priority === 'URGENT' ? 'urgent' : 'pending'}">${escapeHtml(c.priority)}</span>` : ''}
                </div>
                <div style="font-size: 14px; font-weight: 700; color: var(--text);">${escapeHtml(c.title)}</div>
                <div style="font-size: 12px; color: var(--text-secondary); margin-top: 2px;">
                  📍 <strong>${escapeHtml(c.location || 'Campus')}</strong> &bull; Category: ${escapeHtml(c.category || 'Maintenance')} &bull; Lodged: ${formatDate(c.created_at)}
                </div>
              </div>

              <div style="display: flex; gap: 8px;">
                <button class="btn btn-outline btn-sm btn-staff-inspect" data-id="${c.id}" type="button" style="min-height: 44px;">
                  🔍 Inspect Details
                </button>
                ${c.status === 'ASSIGNED' || c.status === 'OPEN' || c.status === 'REOPENED' ? `
                  <button class="btn btn-primary btn-sm btn-staff-start" data-id="${c.id}" type="button" style="min-height: 44px;">
                    ▶️ Start Work
                  </button>
                ` : ''}
                ${c.status === 'IN_PROGRESS' ? `
                  <button class="btn btn-secondary btn-sm btn-staff-resolve" data-id="${c.id}" type="button" style="min-height: 44px; color: var(--success); font-weight: 700;">
                    ✓ Resolve Task
                  </button>
                ` : ''}
              </div>
            </div>
          `).join('')}
        </div>
      `;

      // Attach action listeners
      queueRoot.querySelectorAll(".btn-staff-inspect").forEach(btn => {
        btn.addEventListener("click", () => {
          const id = btn.getAttribute("data-id");
          const item = list.find(x => x.id === id);
          if (item) openStaffComplaintDetailModal(item, () => loadStaffDashboardData(user));
        });
      });

      queueRoot.querySelectorAll(".btn-staff-start").forEach(btn => {
        btn.addEventListener("click", () => {
          const id = btn.getAttribute("data-id");
          updateStaffComplaintStatus(id, "IN_PROGRESS", "Technician dispatched and commenced site inspection.", () => loadStaffDashboardData(user));
        });
      });

      queueRoot.querySelectorAll(".btn-staff-resolve").forEach(btn => {
        btn.addEventListener("click", () => {
          const id = btn.getAttribute("data-id");
          const item = list.find(x => x.id === id);
          if (item) openStaffResolutionModal(item, () => loadStaffDashboardData(user));
        });
      });
    }
  } catch (err) {
    console.error("Staff dashboard fetch error:", err);
    if (kpiRoot) kpiRoot.innerHTML = `<div class="card" style="padding: 16px; color: var(--error);">Error loading dashboard metrics: ${escapeHtml(err.message)}</div>`;
    if (queueRoot) queueRoot.innerHTML = `<div class="state-container" style="color: var(--error);">Unable to retrieve assigned work orders. Please try again.</div>`;
  }
}

/**
 * Render Assigned Complaints Full Operational View
 */
export async function renderMaintenanceStaffComplaints(mainEl) {
  if (!mainEl) return;

  mainEl.innerHTML = `
    <div style="margin-bottom: 20px;">
      <div style="display: flex; justify-content: space-between; align-items: flex-start; flex-wrap: wrap; gap: 12px;">
        <div>
          <h2 style="margin: 0; font-size: 20px; font-weight: 800; color: var(--text);">
            🛠️ Assigned Maintenance Work Orders
          </h2>
          <p style="margin: 4px 0 0 0; font-size: 13px; color: var(--text-secondary);">
            Triage, update repair lifecycle, and document official resolution notes for assigned tickets.
          </p>
        </div>
        <button class="btn btn-secondary btn-sm" id="btn-refresh-staff-complaints" type="button" style="min-height: 44px;">
          🔄 Refresh Orders
        </button>
      </div>
    </div>

    <!-- Filter & Search Toolbar -->
    <div class="card" style="padding: 14px; margin-bottom: 20px;">
      <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 12px;">
        <div style="display: flex; gap: 6px; flex-wrap: wrap;">
          <button class="btn btn-sm btn-primary staff-filter-btn" data-status="ALL" type="button" style="min-height: 40px;">All Tickets</button>
          <button class="btn btn-sm btn-secondary staff-filter-btn" data-status="ACTIVE" type="button" style="min-height: 40px;">Active (Open / In-Progress)</button>
          <button class="btn btn-sm btn-secondary staff-filter-btn" data-status="ASSIGNED" type="button" style="min-height: 40px;">Pending Start</button>
          <button class="btn btn-sm btn-secondary staff-filter-btn" data-status="IN_PROGRESS" type="button" style="min-height: 40px;">In Progress</button>
          <button class="btn btn-sm btn-secondary staff-filter-btn" data-status="RESOLVED" type="button" style="min-height: 40px;">Resolved</button>
        </div>

        <div style="flex: 1; min-width: 200px; max-width: 320px;">
          <input class="form-input" id="input-search-staff-complaints" type="text" placeholder="Search ticket #, title, room..." style="padding: 8px 12px; font-size: 13px; min-height: 40px;">
        </div>
      </div>
    </div>

    <!-- Complaints Ledger Table Container -->
    <div class="card" style="padding: 0; overflow: hidden;">
      <div id="staff-complaints-table-container">
        <div class="state-container" style="padding: 40px 20px;"><div class="spinner"></div></div>
      </div>
    </div>

    <div id="staff-modal-root"></div>
  `;

  document.getElementById("btn-refresh-staff-complaints")?.addEventListener("click", () => {
    loadStaffComplaintsList();
  });

  let currentStatusFilter = "ALL";
  let currentSearchQuery = "";
  let cachedComplaints = [];

  const filterButtons = document.querySelectorAll(".staff-filter-btn");
  filterButtons.forEach(btn => {
    btn.addEventListener("click", () => {
      filterButtons.forEach(b => {
        b.classList.remove("btn-primary");
        b.classList.add("btn-secondary");
      });
      btn.classList.remove("btn-secondary");
      btn.classList.add("btn-primary");
      currentStatusFilter = btn.getAttribute("data-status");
      renderFilteredStaffComplaints(cachedComplaints, currentStatusFilter, currentSearchQuery);
    });
  });

  document.getElementById("input-search-staff-complaints")?.addEventListener("input", (e) => {
    currentSearchQuery = e.target.value.toLowerCase().trim();
    renderFilteredStaffComplaints(cachedComplaints, currentStatusFilter, currentSearchQuery);
  });

  async function loadStaffComplaintsList() {
    const tableContainer = document.getElementById("staff-complaints-table-container");
    if (tableContainer) tableContainer.innerHTML = `<div class="state-container" style="padding: 40px 20px;"><div class="spinner"></div></div>`;

    try {
      const data = await api.get("/api/v1/complaints");
      cachedComplaints = Array.isArray(data) ? data : [];
      renderFilteredStaffComplaints(cachedComplaints, currentStatusFilter, currentSearchQuery);
    } catch (err) {
      console.error("Error loading complaints:", err);
      if (tableContainer) {
        tableContainer.innerHTML = `
          <div class="state-container" style="padding: 30px; color: var(--error);">
            <div class="state-icon">⚠️</div>
            <div class="state-title">Failed to load work orders</div>
            <div class="state-desc">${escapeHtml(err.message || 'Server error')}</div>
            <button class="btn btn-secondary btn-sm" id="btn-retry-staff-comp" type="button" style="margin-top: 10px; min-height: 44px;">Try Again</button>
          </div>
        `;
        document.getElementById("btn-retry-staff-comp")?.addEventListener("click", loadStaffComplaintsList);
      }
    }
  }

  await loadStaffComplaintsList();
}

/**
 * Filter and render the complaints table
 */
function renderFilteredStaffComplaints(complaints, statusFilter, searchQuery) {
  const container = document.getElementById("staff-complaints-table-container");
  if (!container) return;

  let filtered = complaints.slice();

  if (statusFilter === "ACTIVE") {
    filtered = filtered.filter(c => c.status !== "RESOLVED" && c.status !== "COMPLETED");
  } else if (statusFilter === "ASSIGNED") {
    filtered = filtered.filter(c => c.status === "ASSIGNED" || c.status === "OPEN" || c.status === "REOPENED");
  } else if (statusFilter === "IN_PROGRESS") {
    filtered = filtered.filter(c => c.status === "IN_PROGRESS");
  } else if (statusFilter === "RESOLVED") {
    filtered = filtered.filter(c => c.status === "RESOLVED" || c.status === "COMPLETED");
  }

  if (searchQuery) {
    filtered = filtered.filter(c => {
      return (
        (c.ticket_number && c.ticket_number.toLowerCase().includes(searchQuery)) ||
        (c.title && c.title.toLowerCase().includes(searchQuery)) ||
        (c.location && c.location.toLowerCase().includes(searchQuery)) ||
        (c.category && c.category.toLowerCase().includes(searchQuery)) ||
        (c.description && c.description.toLowerCase().includes(searchQuery))
      );
    });
  }

  if (filtered.length === 0) {
    container.innerHTML = `
      <div class="state-container" style="padding: 40px 20px;">
        <div class="state-icon" style="font-size: 32px;">🔍</div>
        <div class="state-title">No matching work orders</div>
        <div class="state-desc">No assigned complaints matched your selected status or search term.</div>
      </div>
    `;
    return;
  }

  container.innerHTML = `
    <div class="table-container" style="margin: 0; border: none; border-radius: 0;">
      <table style="width: 100%; text-align: left; border-collapse: collapse;">
        <thead>
          <tr style="border-bottom: 1px solid var(--border); background: var(--surface-hover);">
            <th style="padding: 12px 14px; font-size: 11px; text-transform: uppercase;">Ticket #</th>
            <th style="padding: 12px 14px; font-size: 11px; text-transform: uppercase;">Issue & Details</th>
            <th style="padding: 12px 14px; font-size: 11px; text-transform: uppercase;">Location</th>
            <th style="padding: 12px 14px; font-size: 11px; text-transform: uppercase;">Priority</th>
            <th style="padding: 12px 14px; font-size: 11px; text-transform: uppercase;">Status</th>
            <th style="padding: 12px 14px; font-size: 11px; text-transform: uppercase;">Created</th>
            <th style="padding: 12px 14px; font-size: 11px; text-transform: uppercase; text-align: right;">Action</th>
          </tr>
        </thead>
        <tbody>
          ${filtered.map(c => `
            <tr style="border-bottom: 1px solid var(--border);" class="complaint-row" data-id="${c.id}">
              <td style="padding: 12px 14px; font-family: var(--font-family-mono); font-size: 12px; font-weight: 700;">
                ${escapeHtml(c.ticket_number)}
              </td>
              <td style="padding: 12px 14px;">
                <div style="font-size: 13px; font-weight: 700; color: var(--text);">${escapeHtml(c.title)}</div>
                <div style="font-size: 11px; color: var(--text-secondary); max-width: 320px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">
                  ${escapeHtml(c.description || '')}
                </div>
              </td>
              <td style="padding: 12px 14px; font-size: 12px; font-weight: 600;">
                📍 ${escapeHtml(c.location || 'Campus')}
              </td>
              <td style="padding: 12px 14px;">
                <span class="status-badge ${c.priority === 'URGENT' ? 'urgent' : (c.priority === 'HIGH' ? 'pending' : 'info')}">
                  ${escapeHtml(c.priority || 'NORMAL')}
                </span>
              </td>
              <td style="padding: 12px 14px;">
                <span class="status-badge ${getStatusBadgeClass(c.status)}">
                  ${escapeHtml(c.status)}
                </span>
              </td>
              <td style="padding: 12px 14px; font-size: 12px; color: var(--text-secondary); white-space: nowrap;">
                ${formatDate(c.created_at)}
              </td>
              <td style="padding: 12px 14px; text-align: right; white-space: nowrap;">
                <button class="btn btn-outline btn-sm btn-table-inspect" data-id="${c.id}" type="button" style="min-height: 38px;">
                  🔍 Details
                </button>
              </td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>
  `;

  container.querySelectorAll(".btn-table-inspect").forEach(btn => {
    btn.addEventListener("click", () => {
      const id = btn.getAttribute("data-id");
      const item = complaints.find(x => x.id === id);
      if (item) openStaffComplaintDetailModal(item, () => renderFilteredStaffComplaints(complaints, statusFilter, searchQuery));
    });
  });
}

/**
 * Open Complaint Detail & Action Modal
 */
function openStaffComplaintDetailModal(complaint, onUpdated) {
  const modalRoot = document.getElementById("staff-modal-root") || document.body;

  modalRoot.innerHTML = `
    <div class="modal-backdrop active" id="modal-staff-detail-backdrop">
      <div class="modal-dialog" style="max-width: 620px;" role="dialog" aria-modal="true" aria-labelledby="staff-comp-modal-title">
        <div class="modal-header">
          <div>
            <span style="font-family: var(--font-family-mono); font-size: 11px; font-weight: 700; color: var(--primary);">
              ${escapeHtml(complaint.ticket_number)}
            </span>
            <h3 id="staff-comp-modal-title" style="margin: 2px 0 0 0; font-size: 18px; font-weight: 800;">
              ${escapeHtml(complaint.title)}
            </h3>
          </div>
          <button class="btn-icon" id="btn-close-staff-modal" aria-label="Close" type="button">✕</button>
        </div>

        <div style="padding: 20px; max-height: 75vh; overflow-y: auto;">
          <!-- Metadata Pills Bar -->
          <div style="display: flex; gap: 8px; flex-wrap: wrap; margin-bottom: 16px;">
            <span class="status-badge ${getStatusBadgeClass(complaint.status)}">Status: ${escapeHtml(complaint.status)}</span>
            <span class="status-badge ${complaint.priority === 'URGENT' ? 'urgent' : 'pending'}">Priority: ${escapeHtml(complaint.priority || 'NORMAL')}</span>
            <span class="status-badge info">Category: ${escapeHtml(complaint.category)}</span>
          </div>

          <!-- Description & Venue -->
          <div class="card" style="padding: 14px; margin-bottom: 16px; background: var(--surface-hover);">
            <div style="font-size: 11px; font-weight: 700; color: var(--text-muted); text-transform: uppercase;">
              Location & Area
            </div>
            <div style="font-size: 14px; font-weight: 700; color: var(--text); margin: 2px 0 10px 0;">
              📍 ${escapeHtml(complaint.location || 'General Campus')}
            </div>

            <div style="font-size: 11px; font-weight: 700; color: var(--text-muted); text-transform: uppercase;">
              Problem Description
            </div>
            <div style="font-size: 13px; color: var(--text); margin-top: 4px; line-height: 1.5;">
              ${escapeHtml(complaint.description || 'No description provided.')}
            </div>
          </div>

          <!-- Lifecycle Timestamps -->
          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 16px; font-size: 12px;">
            <div>
              <span style="color: var(--text-muted);">Lodged At:</span><br/>
              <strong>${formatDateTime(complaint.created_at)}</strong>
            </div>
            <div>
              <span style="color: var(--text-muted);">Resolved At:</span><br/>
              <strong>${complaint.resolved_at ? formatDateTime(complaint.resolved_at) : 'Pending Resolution'}</strong>
            </div>
          </div>

          <!-- Existing Resolution Notes (if any) -->
          ${complaint.resolution_notes ? `
            <div class="card" style="padding: 12px; margin-bottom: 16px; border-left: 4px solid var(--success);">
              <div style="font-size: 11px; font-weight: 700; color: var(--success); text-transform: uppercase;">Recorded Resolution Notes</div>
              <div style="font-size: 13px; color: var(--text); margin-top: 4px;">
                ${escapeHtml(complaint.resolution_notes)}
              </div>
            </div>
          ` : ''}

          <!-- Student Satisfaction Rating (if closed) -->
          ${complaint.rating ? `
            <div class="card" style="padding: 12px; margin-bottom: 16px; background: #FEF3C7; border: 1px solid #F59E0B;">
              <div style="font-size: 12px; font-weight: 700; color: #92400E;">
                ★ Student Feedback Rating: ${complaint.rating}/5 Stars
              </div>
            </div>
          ` : ''}

          <!-- Action Control Form -->
          <div style="border-top: 1px solid var(--border); padding-top: 16px; margin-top: 8px;">
            <div style="font-size: 13px; font-weight: 700; color: var(--text); margin-bottom: 8px;">
              ⚡ Perform Maintenance Action
            </div>

            ${(complaint.status === 'ASSIGNED' || complaint.status === 'OPEN' || complaint.status === 'REOPENED') ? `
              <div style="background: var(--surface-hover); padding: 14px; border-radius: var(--radius-sm); margin-bottom: 12px;">
                <p style="margin: 0 0 10px 0; font-size: 12px; color: var(--text-secondary);">
                  Transition this ticket to <strong>IN_PROGRESS</strong> when you depart to investigate or begin physical work.
                </p>
                <button class="btn btn-primary" id="btn-modal-start-work" type="button" style="min-height: 44px; width: 100%;">
                  ▶️ Start Work / Move to IN_PROGRESS
                </button>
              </div>
            ` : ''}

            ${complaint.status === 'IN_PROGRESS' ? `
              <form id="form-staff-resolve-complaint">
                <div class="form-group" style="margin-bottom: 12px;">
                  <label class="form-label" for="staff-res-notes">Official Resolution Notes *</label>
                  <textarea class="form-input" id="staff-res-notes" rows="3" required placeholder="Describe repair performed, parts replaced, or corrective steps completed (e.g., Replaced MCB breaker and tested voltage)."></textarea>
                </div>
                <button class="btn btn-primary" id="btn-modal-submit-resolve" type="submit" style="min-height: 44px; width: 100%; background: var(--success); border-color: var(--success);">
                  ✓ Confirm Work Done & Mark RESOLVED
                </button>
              </form>
            ` : ''}

            ${(complaint.status === 'RESOLVED' || complaint.status === 'COMPLETED') ? `
              <div style="font-size: 13px; color: var(--success); font-weight: 600; text-align: center; padding: 12px; background: var(--surface-hover); border-radius: var(--radius-sm);">
                ✓ Work order has been resolved. Awaiting student closure verification.
              </div>
            ` : ''}
          </div>
        </div>

        <div class="modal-footer" style="padding: 12px 20px;">
          <button class="btn btn-secondary" id="btn-cancel-staff-modal" type="button" style="min-height: 44px;">
            Close
          </button>
        </div>
      </div>
    </div>
  `;

  const closeModal = () => { modalRoot.innerHTML = ""; };
  document.getElementById("btn-close-staff-modal")?.addEventListener("click", closeModal);
  document.getElementById("btn-cancel-staff-modal")?.addEventListener("click", closeModal);

  document.getElementById("btn-modal-start-work")?.addEventListener("click", async () => {
    await updateStaffComplaintStatus(
      complaint.id,
      "IN_PROGRESS",
      "Technician dispatched and commenced site inspection.",
      () => {
        closeModal();
        if (onUpdated) onUpdated();
      }
    );
  });

  document.getElementById("form-staff-resolve-complaint")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const notes = document.getElementById("staff-res-notes")?.value.trim();
    if (!notes) {
      showToast("Resolution notes are required to resolve a complaint", "error");
      return;
    }

    const btn = document.getElementById("btn-modal-submit-resolve");
    if (btn) {
      btn.disabled = true;
      btn.innerHTML = `<span class="spinner" style="width: 14px; height: 14px; border-width: 2px;"></span> Updating...`;
    }

    await updateStaffComplaintStatus(
      complaint.id,
      "RESOLVED",
      notes,
      () => {
        closeModal();
        if (onUpdated) onUpdated();
      }
    );
  });
}

/**
 * Open Resolution Modal directly from dashboard queue
 */
function openStaffResolutionModal(complaint, onUpdated) {
  openStaffComplaintDetailModal(complaint, onUpdated);
}

/**
 * Execute backend PATCH /api/v1/complaints/{id}/status
 */
async function updateStaffComplaintStatus(complaintId, newStatus, notes, onSuccess) {
  try {
    const payload = {
      status: newStatus,
      resolution_notes: notes || null
    };

    const resp = await api.patch(`/api/v1/complaints/${complaintId}/status`, payload);
    showToast(`Work order updated to ${newStatus} successfully!`, "success");
    if (onSuccess) onSuccess(resp);
  } catch (err) {
    console.error("Status update error:", err);
    showToast(err.message || "Failed to update complaint status", "error");
  }
}

/* ==========================================================================
   PART B: SECURITY GUARD GATE PASS WORKSTATION (GUARD)
   ========================================================================== */

/**
 * Render the Security Guard Gate Verification Scanner Workstation
 * Optimized for low-end mobile screens, large touch targets (>=44px), high contrast, rapid operation.
 */
export async function renderGuardScanner(mainEl, user) {
  if (!mainEl) return;

  mainEl.innerHTML = `
    <div style="max-width: 680px; margin: 0 auto;">
      <!-- Workstation Header -->
      <div style="margin-bottom: 16px; text-align: center;">
        <span class="status-badge approved" style="font-size: 11px; padding: 4px 10px; margin-bottom: 6px;">
          🛡️ Perimeter Gate Station 1 &bull; Active Post
        </span>
        <h2 style="margin: 4px 0 0 0; font-size: 22px; font-weight: 800; color: var(--text);">
          Perimeter QR Verification Station
        </h2>
        <p style="margin: 4px 0 0 0; font-size: 13px; color: var(--text-secondary);">
          Rapid cryptographic scan & entry/exit validation for student gate passes.
        </p>
      </div>

      <!-- Live Verification Input Card -->
      <div class="card" style="padding: 20px; margin-bottom: 20px; box-shadow: 0 4px 12px rgba(0,0,0,0.08);">
        <form id="form-guard-verify-qr">
          <div class="form-group" style="margin-bottom: 16px;">
            <label class="form-label" for="guard-qr-token-input" style="font-size: 13px; font-weight: 800; display: flex; justify-content: space-between;">
              <span>🔑 Single-Use QR Token / Pass Code</span>
              <span style="font-size: 11px; font-weight: normal; color: var(--text-muted);">Cryptographic Hash</span>
            </label>
            <div style="position: relative;">
              <input
                class="form-input"
                id="guard-qr-token-input"
                type="text"
                autocomplete="off"
                autocorrect="off"
                spellcheck="false"
                required
                placeholder="Scan or enter 64-char QR token..."
                style="font-family: var(--font-family-mono); font-size: 15px; font-weight: 700; padding: 14px 44px 14px 14px; min-height: 52px; border-width: 2px;"
              >
              <button
                class="btn-icon"
                id="btn-clear-qr-input"
                type="button"
                aria-label="Clear input"
                style="position: absolute; right: 6px; top: 8px; width: 36px; height: 36px;"
              >✕</button>
            </div>
          </div>

          <!-- Big Touch Target Primary Verification Button (>=48px) -->
          <button
            class="btn btn-primary"
            id="btn-submit-verify-qr"
            type="submit"
            style="width: 100%; min-height: 54px; font-size: 16px; font-weight: 800; letter-spacing: 0.5px; border-radius: var(--radius-md);"
          >
            ⚡ VERIFY & CONSUME GATE PASS
          </button>
        </form>

        <!-- Quick One-Tap Active Pass Selector (Assists Demos & Rapid Testing) -->
        <div style="margin-top: 16px; border-top: 1px dashed var(--border); padding-top: 14px;">
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
            <span style="font-size: 11px; font-weight: 700; color: var(--text-muted); text-transform: uppercase;">
              📋 Active Approved Passes (Ready for Exit):
            </span>
            <button class="btn btn-outline btn-sm" id="btn-refresh-ready-passes" type="button" style="padding: 2px 8px; min-height: 32px; font-size: 11px;">
              🔄 Refresh List
            </button>
          </div>
          <div id="guard-ready-passes-list" style="display: flex; flex-direction: column; gap: 8px;">
            <div class="state-container" style="padding: 10px;"><div class="spinner" style="width: 16px; height: 16px;"></div></div>
          </div>
        </div>
      </div>

      <!-- Result Feedback Canvas (High-Contrast Validation Banner) -->
      <div id="guard-verification-result-canvas" style="margin-bottom: 24px;"></div>

      <!-- Checked-Out Return Triage Section -->
      <div class="card" style="padding: 16px; margin-bottom: 20px;">
        <div class="card-header" style="padding: 0 0 10px 0; margin-bottom: 10px;">
          <div class="card-title" style="font-size: 14px;">
            🏃 Off-Campus Students (Awaiting Return Check-In)
          </div>
        </div>
        <div id="guard-checked-out-list">
          <div class="state-container" style="padding: 16px;"><div class="spinner" style="width: 16px; height: 16px;"></div></div>
        </div>
      </div>
    </div>
  `;

  // Attach clear button
  document.getElementById("btn-clear-qr-input")?.addEventListener("click", () => {
    const input = document.getElementById("guard-qr-token-input");
    if (input) {
      input.value = "";
      input.focus();
    }
  });

  // Attach refresh ready passes button
  document.getElementById("btn-refresh-ready-passes")?.addEventListener("click", () => {
    loadGuardReadyPasses();
    loadGuardCheckedOutPasses();
  });

  // Form submission handler
  document.getElementById("form-guard-verify-qr")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const input = document.getElementById("guard-qr-token-input");
    const tokenStr = input?.value.trim();
    if (!tokenStr) return;

    await executeGuardQRVerification(tokenStr);
  });

  await loadGuardReadyPasses();
  await loadGuardCheckedOutPasses();
}

/**
 * Load active approved passes ready for verification
 */
async function loadGuardReadyPasses() {
  const container = document.getElementById("guard-ready-passes-list");
  if (!container) return;

  try {
    const passes = await api.get("/api/v1/gatepasses");
    const ready = Array.isArray(passes) ? passes.filter(p => p.status === "APPROVED" && p.qr_token && p.qr_token.status === "ACTIVE") : [];

    if (ready.length === 0) {
      container.innerHTML = `
        <div style="font-size: 12px; color: var(--text-secondary); text-align: center; padding: 10px; background: var(--surface-hover); border-radius: var(--radius-sm);">
          No approved gate passes currently pending exit.
        </div>
      `;
      return;
    }

    container.innerHTML = ready.map(p => `
      <div style="background: var(--surface-hover); border: 1px solid var(--border); border-radius: var(--radius-sm); padding: 8px 12px; display: flex; justify-content: space-between; align-items: center; gap: 8px;">
        <div>
          <span style="font-family: var(--font-family-mono); font-size: 12px; font-weight: 700; color: var(--primary);">
            ${escapeHtml(p.pass_number)}
          </span>
          <span style="font-size: 12px; color: var(--text); margin-left: 6px;">
            Destination: <strong>${escapeHtml(p.destination)}</strong>
          </span>
          <div style="font-size: 11px; color: var(--text-muted); margin-top: 2px;">
            Valid Out: ${formatDateTime(p.out_time)}
          </div>
        </div>
        <button
          class="btn btn-secondary btn-sm btn-select-ready-qr"
          data-token="${escapeHtml(p.qr_token.qr_token)}"
          type="button"
          style="min-height: 40px; font-size: 11px; font-weight: 700; white-space: nowrap;"
        >
          📲 Select Pass
        </button>
      </div>
    `).join('');

    container.querySelectorAll(".btn-select-ready-qr").forEach(btn => {
      btn.addEventListener("click", () => {
        const token = btn.getAttribute("data-token");
        const input = document.getElementById("guard-qr-token-input");
        if (input) {
          input.value = token;
          input.focus();
        }
      });
    });
  } catch (err) {
    console.error("Error loading ready passes:", err);
    if (container) container.innerHTML = `<div style="font-size: 11px; color: var(--error);">Error loading active passes.</div>`;
  }
}

/**
 * Load students currently checked out (off campus) so guard can record return
 */
async function loadGuardCheckedOutPasses() {
  const container = document.getElementById("guard-checked-out-list");
  if (!container) return;

  try {
    const passes = await api.get("/api/v1/gatepasses");
    const checkedOut = Array.isArray(passes) ? passes.filter(p => p.status === "CHECKED_OUT") : [];

    if (checkedOut.length === 0) {
      container.innerHTML = `
        <div style="font-size: 12px; color: var(--text-secondary); text-align: center; padding: 14px;">
          ✓ All students currently on campus. No pending off-campus outings.
        </div>
      `;
      return;
    }

    container.innerHTML = `
      <div style="display: flex; flex-direction: column; gap: 8px;">
        ${checkedOut.map(p => `
          <div style="background: var(--surface-hover); border: 1px solid var(--border); border-radius: var(--radius-sm); padding: 10px 14px; display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 10px;">
            <div>
              <div style="display: flex; align-items: center; gap: 8px;">
                <span style="font-family: var(--font-family-mono); font-size: 12px; font-weight: 700;">${escapeHtml(p.pass_number)}</span>
                <span class="status-badge pending">CHECKED_OUT</span>
              </div>
              <div style="font-size: 13px; font-weight: 700; color: var(--text); margin-top: 2px;">
                📍 ${escapeHtml(p.destination)} &bull; ${escapeHtml(p.purpose)}
              </div>
              <div style="font-size: 11px; color: var(--text-secondary); margin-top: 2px;">
                Actual Exit Time: <strong>${formatDateTime(p.actual_out_time)}</strong>
              </div>
            </div>

            <button
              class="btn btn-primary btn-sm btn-guard-return"
              data-id="${p.id}"
              type="button"
              style="min-height: 44px; background: var(--success); border-color: var(--success);"
            >
              📥 Mark Student Return (Check-In)
            </button>
          </div>
        `).join('')}
      </div>
    `;

    container.querySelectorAll(".btn-guard-return").forEach(btn => {
      btn.addEventListener("click", async () => {
        const id = btn.getAttribute("data-id");
        btn.disabled = true;
        btn.innerHTML = `<span class="spinner" style="width: 14px; height: 14px;"></span> Recording...`;
        await executeGuardRecordReturn(id);
      });
    });
  } catch (err) {
    console.error("Error loading checked out passes:", err);
    if (container) container.innerHTML = `<div style="font-size: 11px; color: var(--error);">Error loading checked-out passes.</div>`;
  }
}

/**
 * Execute Atomic Single-Use QR Pass Verification
 * POST /api/v1/gatepasses/verify-qr
 */
async function executeGuardQRVerification(qrTokenStr) {
  const canvas = document.getElementById("guard-verification-result-canvas");
  const submitBtn = document.getElementById("btn-submit-verify-qr");

  if (submitBtn) {
    submitBtn.disabled = true;
    submitBtn.innerHTML = `<span class="spinner" style="width: 16px; height: 16px; border-width: 2px;"></span> Validating with Row-Level Lock...`;
  }

  try {
    const resp = await api.post("/api/v1/gatepasses/verify-qr", {
      qr_token: qrTokenStr
    });

    // SUCCESS CASE — VALID ACTIVE PASS CONSUMED
    if (canvas) {
      canvas.innerHTML = `
        <div class="card" style="padding: 20px; border: 3px solid var(--success); background: rgba(16, 185, 129, 0.08); border-radius: var(--radius-md);">
          <div style="display: flex; align-items: center; gap: 12px; margin-bottom: 12px;">
            <div style="width: 44px; height: 44px; border-radius: 50%; background: var(--success); color: white; display: flex; align-items: center; justify-content: center; font-size: 24px; font-weight: 800;">
              ✓
            </div>
            <div>
              <div style="font-size: 18px; font-weight: 800; color: var(--success);">
                PASS VALID &bull; EXIT PERMITTED
              </div>
              <div style="font-size: 12px; color: var(--text-secondary);">
                Authoritative verification confirmed by backend row-level lock.
              </div>
            </div>
          </div>

          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-top: 14px; font-size: 13px; border-top: 1px solid rgba(16, 185, 129, 0.2); padding-top: 12px;">
            <div>
              <span style="color: var(--text-muted); font-size: 11px; text-transform: uppercase;">Pass Number</span><br/>
              <strong style="font-family: var(--font-family-mono); font-size: 14px;">${escapeHtml(resp.pass_number || 'N/A')}</strong>
            </div>
            <div>
              <span style="color: var(--text-muted); font-size: 11px; text-transform: uppercase;">Student Registry ID</span><br/>
              <strong style="font-family: var(--font-family-mono); font-size: 12px;">${escapeHtml(resp.student_id ? resp.student_id.slice(0, 13) + '...' : 'Verified Student')}</strong>
            </div>
            <div>
              <span style="color: var(--text-muted); font-size: 11px; text-transform: uppercase;">Actual Checkout Timestamp</span><br/>
              <strong>${formatDateTime(resp.actual_out_time || new Date().toISOString())}</strong>
            </div>
            <div>
              <span style="color: var(--text-muted); font-size: 11px; text-transform: uppercase;">Token State</span><br/>
              <span class="status-badge approved" style="font-weight: 700;">CONSUMED (USED)</span>
            </div>
          </div>

          <div style="margin-top: 16px; background: rgba(16, 185, 129, 0.15); border-radius: var(--radius-sm); padding: 10px 12px; font-size: 12px; color: var(--text); font-weight: 600;">
            🔒 ONE-TIME PASS CONSUMED: This QR token has now been permanently flagged as USED. Replay attempts will be rejected immediately by backend atomic locking.
          </div>
        </div>
      `;
    }

    showToast("Gate Pass Validated! Student cleared for exit.", "success");
    await loadGuardReadyPasses();
    await loadGuardCheckedOutPasses();
  } catch (err) {
    console.warn("QR Verification Rejected:", err);

    // REJECTION OR REPLAY CASE
    const isReplay = err.message && (err.message.includes("REPLAY") || err.message.includes("already consumed"));
    const isExpired = err.message && (err.message.includes("expired") || err.message.includes("elapsed"));

    if (canvas) {
      canvas.innerHTML = `
        <div class="card" style="padding: 20px; border: 3px solid var(--error); background: rgba(239, 68, 68, 0.08); border-radius: var(--radius-md);">
          <div style="display: flex; align-items: center; gap: 12px; margin-bottom: 12px;">
            <div style="width: 44px; height: 44px; border-radius: 50%; background: var(--error); color: white; display: flex; align-items: center; justify-content: center; font-size: 24px; font-weight: 800;">
              ✕
            </div>
            <div>
              <div style="font-size: 18px; font-weight: 800; color: var(--error);">
                ${isReplay ? '🛑 REPLAY ATTEMPT DETECTED — EXIT DENIED' : (isExpired ? '⚠️ PASS EXPIRED — EXIT DENIED' : '⛔ INVALID GATE PASS')}
              </div>
              <div style="font-size: 12px; color: var(--text-secondary);">
                ${isReplay ? 'HTTP 409 Conflict &bull; Reused Single-Use QR' : 'Perimeter Verification Rejected'}
              </div>
            </div>
          </div>

          <div style="background: rgba(239, 68, 68, 0.12); border-radius: var(--radius-sm); padding: 12px; font-size: 13px; color: var(--text); font-weight: 600; line-height: 1.5; margin-top: 10px;">
            ${escapeHtml(err.message || 'Pass verification rejected by security server.')}
          </div>

          ${isReplay ? `
            <div style="margin-top: 12px; font-size: 12px; color: var(--error); font-weight: 700;">
              🛡️ SECURITY PROTOCOL NOTICE: In accordance with CampusFlow PRD specifications, gate pass QRs are strictly single-use. The student must apply for a new gate pass through their portal.
            </div>
          ` : ''}
        </div>
      `;
    }

    showToast(isReplay ? "Replay Rejected: QR has already been consumed!" : (err.message || "Pass verification failed"), "error");
  } finally {
    if (submitBtn) {
      submitBtn.disabled = false;
      submitBtn.innerHTML = `⚡ VERIFY & CONSUME GATE PASS`;
    }
  }
}

/**
 * Execute Return (Check-In) Recording
 * POST /api/v1/gatepasses/{id}/return
 */
async function executeGuardRecordReturn(passId) {
  try {
    await api.post(`/api/v1/gatepasses/${passId}/return`);
    showToast("Student return recorded! Gate pass marked COMPLETED.", "success");
    await loadGuardReadyPasses();
    await loadGuardCheckedOutPasses();
  } catch (err) {
    console.error("Error recording return:", err);
    showToast(err.message || "Failed to record student return", "error");
  }
}

/**
 * Render Recent Gate Activity Ledger (Perimeter Log)
 */
export async function renderGuardGateActivity(mainEl) {
  if (!mainEl) return;

  mainEl.innerHTML = `
    <div style="margin-bottom: 20px;">
      <div style="display: flex; justify-content: space-between; align-items: flex-start; flex-wrap: wrap; gap: 12px;">
        <div>
          <h2 style="margin: 0; font-size: 20px; font-weight: 800; color: var(--text);">
            📋 Perimeter Gate Activity Ledger
          </h2>
          <p style="margin: 4px 0 0 0; font-size: 13px; color: var(--text-secondary);">
            Chronological audit of exit checkouts, perimeter QR scans, and return check-ins.
          </p>
        </div>
        <button class="btn btn-secondary btn-sm" id="btn-refresh-gate-activity" type="button" style="min-height: 44px;">
          🔄 Refresh Log
        </button>
      </div>
    </div>

    <!-- Filter Buttons -->
    <div class="card" style="padding: 12px; margin-bottom: 18px;">
      <div style="display: flex; gap: 8px; flex-wrap: wrap;">
        <button class="btn btn-sm btn-primary guard-log-filter" data-filter="ALL" type="button" style="min-height: 40px;">All Passes</button>
        <button class="btn btn-sm btn-secondary guard-log-filter" data-filter="CHECKED_OUT" type="button" style="min-height: 40px;">Currently Off-Campus</button>
        <button class="btn btn-sm btn-secondary guard-log-filter" data-filter="COMPLETED" type="button" style="min-height: 40px;">Completed (Returned)</button>
        <button class="btn btn-sm btn-secondary guard-log-filter" data-filter="APPROVED" type="button" style="min-height: 40px;">Approved (Pending Exit)</button>
        <button class="btn btn-sm btn-secondary guard-log-filter" data-filter="REJECTED" type="button" style="min-height: 40px;">Rejected</button>
      </div>
    </div>

    <!-- Ledger Table Container -->
    <div class="card" style="padding: 0; overflow: hidden;">
      <div id="guard-ledger-table-container">
        <div class="state-container" style="padding: 40px 20px;"><div class="spinner"></div></div>
      </div>
    </div>
  `;

  document.getElementById("btn-refresh-gate-activity")?.addEventListener("click", loadGuardLedger);

  let currentFilter = "ALL";
  let cachedPasses = [];

  const filterBtns = document.querySelectorAll(".guard-log-filter");
  filterBtns.forEach(btn => {
    btn.addEventListener("click", () => {
      filterBtns.forEach(b => {
        b.classList.remove("btn-primary");
        b.classList.add("btn-secondary");
      });
      btn.classList.remove("btn-secondary");
      btn.classList.add("btn-primary");
      currentFilter = btn.getAttribute("data-filter");
      renderFilteredGuardLedger(cachedPasses, currentFilter);
    });
  });

  async function loadGuardLedger() {
    const container = document.getElementById("guard-ledger-table-container");
    if (container) container.innerHTML = `<div class="state-container" style="padding: 40px 20px;"><div class="spinner"></div></div>`;

    try {
      const data = await api.get("/api/v1/gatepasses");
      cachedPasses = Array.isArray(data) ? data : [];
      renderFilteredGuardLedger(cachedPasses, currentFilter);
    } catch (err) {
      console.error("Error loading gate passes:", err);
      if (container) {
        container.innerHTML = `
          <div class="state-container" style="padding: 30px; color: var(--error);">
            <div class="state-icon">⚠️</div>
            <div class="state-title">Failed to load gate activity log</div>
            <div class="state-desc">${escapeHtml(err.message || 'Server error')}</div>
          </div>
        `;
      }
    }
  }

  await loadGuardLedger();
}

/**
 * Render filtered gate activity ledger
 */
function renderFilteredGuardLedger(passes, filter) {
  const container = document.getElementById("guard-ledger-table-container");
  if (!container) return;

  let filtered = passes.slice();
  if (filter !== "ALL") {
    filtered = filtered.filter(p => p.status === filter);
  }

  if (filtered.length === 0) {
    container.innerHTML = `
      <div class="state-container" style="padding: 40px 20px;">
        <div class="state-icon">📋</div>
        <div class="state-title">No records found</div>
        <div class="state-desc">No gate pass records match the selected filter.</div>
      </div>
    `;
    return;
  }

  container.innerHTML = `
    <div class="table-container" style="margin: 0; border: none; border-radius: 0;">
      <table style="width: 100%; text-align: left; border-collapse: collapse;">
        <thead>
          <tr style="border-bottom: 1px solid var(--border); background: var(--surface-hover);">
            <th style="padding: 12px 14px; font-size: 11px; text-transform: uppercase;">Pass Number</th>
            <th style="padding: 12px 14px; font-size: 11px; text-transform: uppercase;">Destination & Purpose</th>
            <th style="padding: 12px 14px; font-size: 11px; text-transform: uppercase;">Status</th>
            <th style="padding: 12px 14px; font-size: 11px; text-transform: uppercase;">Actual Exit</th>
            <th style="padding: 12px 14px; font-size: 11px; text-transform: uppercase;">Actual Return</th>
            <th style="padding: 12px 14px; font-size: 11px; text-transform: uppercase; text-align: right;">Perimeter Action</th>
          </tr>
        </thead>
        <tbody>
          ${filtered.map(p => `
            <tr style="border-bottom: 1px solid var(--border);">
              <td style="padding: 12px 14px; font-family: var(--font-family-mono); font-size: 12px; font-weight: 700;">
                ${escapeHtml(p.pass_number)}
              </td>
              <td style="padding: 12px 14px;">
                <div style="font-size: 13px; font-weight: 700; color: var(--text);">${escapeHtml(p.destination)}</div>
                <div style="font-size: 11px; color: var(--text-secondary);">${escapeHtml(p.purpose)}</div>
              </td>
              <td style="padding: 12px 14px;">
                <span class="status-badge ${getGatePassBadgeClass(p.status)}">
                  ${escapeHtml(p.status)}
                </span>
              </td>
              <td style="padding: 12px 14px; font-size: 12px; color: var(--text-secondary); white-space: nowrap;">
                ${p.actual_out_time ? formatDateTime(p.actual_out_time) : '—'}
              </td>
              <td style="padding: 12px 14px; font-size: 12px; color: var(--text-secondary); white-space: nowrap;">
                ${p.actual_in_time ? formatDateTime(p.actual_in_time) : (p.status === 'CHECKED_OUT' ? '<span style="color: var(--warning); font-weight: 700;">Awaiting Return</span>' : '—')}
              </td>
              <td style="padding: 12px 14px; text-align: right; white-space: nowrap;">
                ${p.status === 'CHECKED_OUT' ? `
                  <button
                    class="btn btn-primary btn-sm btn-ledger-return"
                    data-id="${p.id}"
                    type="button"
                    style="min-height: 38px; background: var(--success); border-color: var(--success);"
                  >
                    📥 Mark Return
                  </button>
                ` : `
                  <span style="font-size: 11px; color: var(--text-muted);">Archived</span>
                `}
              </td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>
  `;

  container.querySelectorAll(".btn-ledger-return").forEach(btn => {
    btn.addEventListener("click", async () => {
      const id = btn.getAttribute("data-id");
      btn.disabled = true;
      btn.innerHTML = `<span class="spinner" style="width: 12px; height: 12px;"></span>`;
      await executeGuardRecordReturn(id);
      const data = await api.get("/api/v1/gatepasses");
      renderFilteredGuardLedger(data, filter);
    });
  });
}

/* ==========================================================================
   HELPER UTILITIES
   ========================================================================== */

function getStatusBadgeClass(status) {
  switch (status) {
    case "RESOLVED":
    case "COMPLETED":
      return "approved";
    case "IN_PROGRESS":
      return "info";
    case "ASSIGNED":
    case "OPEN":
    case "REOPENED":
      return "pending";
    case "REJECTED":
      return "rejected";
    default:
      return "info";
  }
}

function getGatePassBadgeClass(status) {
  switch (status) {
    case "APPROVED":
      return "approved";
    case "CHECKED_OUT":
      return "pending";
    case "COMPLETED":
      return "approved";
    case "REJECTED":
      return "rejected";
    case "PENDING":
      return "pending";
    default:
      return "info";
  }
}
