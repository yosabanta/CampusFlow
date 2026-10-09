/**
 * CampusFlow MVP — Warden & Hostel Authority Faculty Experience Engine
 * Phase 9: Gate Pass Approval, One-Time QR Inspection, Rejection Justification,
 * Gate Pass Ledger Records, Hostel Complaints Management, Notifications, and Profile.
 */

import { api } from "./api.js";
import { store } from "./state.js";
import { showToast } from "./ui.js";
import { escapeHtml, formatDate, formatDateTime, timeAgo, getGreeting, formatRole } from "./utils.js";

/* --------------------------------------------------------------------------
   DATABASE-BACKED STUDENT METADATA EXTRACTOR
   -------------------------------------------------------------------------- */
function getStudentMeta(gpOrStudentId) {
  if (typeof gpOrStudentId === "object" && gpOrStudentId !== null) {
    return {
      name: gpOrStudentId.student_name || "Enrolled Student",
      roll: gpOrStudentId.student_roll || "N/A",
      hostel: gpOrStudentId.student_hostel || "Hostel Residence",
      room: gpOrStudentId.student_room || "N/A",
      dept: gpOrStudentId.student_department || "Department",
      phone: gpOrStudentId.student_phone || "N/A"
    };
  }
  const studentId = gpOrStudentId;
  if (!studentId) return { name: "Student", roll: "N/A", hostel: "Hostel", room: "N/A", dept: "Engineering", phone: "N/A" };
  return {
    name: `Student #${studentId.slice(0, 8)}`,
    roll: "Enrolled Student",
    hostel: "Hostel Residence",
    room: "Resident",
    dept: "Department",
    phone: "N/A"
  };
}

/* ==========================================================================
   1. WARDEN DASHBOARD
   ========================================================================== */
export async function renderWardenDashboard(mainEl, user) {
  if (!mainEl) return;

  mainEl.innerHTML = `
    <!-- Top Welcome Card -->
    <div class="card" style="background: linear-gradient(135deg, var(--surface), var(--surface-hover)); border-left: 4px solid var(--primary);">
      <div style="display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 12px;">
        <div>
          <h2 style="font-size: 1.35rem; color: var(--text);">${escapeHtml(getGreeting(user.first_name))} 👋</h2>
          <p style="margin: 4px 0 0 0; font-size: 13px; color: var(--text-secondary);">
            Hostel Operations Desk &bull; <strong style="color: var(--text);">Chief Warden</strong> &bull; 
            <span class="status-badge info" style="font-size: 11px;">Mahanadi & Brahmani Halls</span>
          </p>
        </div>
        <div style="display: flex; gap: 8px;">
          <a href="#gatepasses" class="btn btn-sm btn-primary">Review Gate Passes</a>
          <a href="#complaints" class="btn btn-sm btn-secondary">Hostel Complaints</a>
        </div>
      </div>
    </div>

    <!-- Live Telemetry KPI Metrics Grid -->
    <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(210px, 1fr)); gap: 14px; margin-top: 20px;">
      <div class="card" style="padding: 16px; border-top: 3px solid var(--warning);">
        <div style="font-size: 11px; font-weight: 700; color: var(--text-muted); text-transform: uppercase;">
          Pending Approvals
        </div>
        <div id="warden-kpi-pending" style="font-size: 28px; font-weight: 800; color: var(--warning); margin-top: 6px;">
          <div class="spinner" style="width: 20px; height: 20px;"></div>
        </div>
        <div style="font-size: 12px; color: var(--text-secondary); margin-top: 4px;">
          Awaiting warden review
        </div>
      </div>

      <div class="card" style="padding: 16px; border-top: 3px solid var(--success);">
        <div style="font-size: 11px; font-weight: 700; color: var(--text-muted); text-transform: uppercase;">
          Approved Passes
        </div>
        <div id="warden-kpi-approved" style="font-size: 28px; font-weight: 800; color: var(--success); margin-top: 6px;">
          <div class="spinner" style="width: 20px; height: 20px;"></div>
        </div>
        <div style="font-size: 12px; color: var(--text-secondary); margin-top: 4px;">
          Active 1-time QR issued
        </div>
      </div>

      <div class="card" style="padding: 16px; border-top: 3px solid var(--info);">
        <div style="font-size: 11px; font-weight: 700; color: var(--text-muted); text-transform: uppercase;">
          Campus Checked Out
        </div>
        <div id="warden-kpi-out" style="font-size: 28px; font-weight: 800; color: var(--info); margin-top: 6px;">
          <div class="spinner" style="width: 20px; height: 20px;"></div>
        </div>
        <div style="font-size: 12px; color: var(--text-secondary); margin-top: 4px;">
          Currently outside campus
        </div>
      </div>

      <div class="card" style="padding: 16px; border-top: 3px solid var(--primary);">
        <div style="font-size: 11px; font-weight: 700; color: var(--text-muted); text-transform: uppercase;">
          Active Complaints
        </div>
        <div id="warden-kpi-complaints" style="font-size: 28px; font-weight: 800; color: var(--primary); margin-top: 6px;">
          <div class="spinner" style="width: 20px; height: 20px;"></div>
        </div>
        <div style="font-size: 12px; color: var(--text-secondary); margin-top: 4px;">
          Hostel maintenance tickets
        </div>
      </div>
    </div>

    <!-- Main Workspace Two-Column Layout -->
    <div style="display: grid; grid-template-columns: 2fr 1fr; gap: 20px; margin-top: 24px;">
      <!-- Left Column: Pending Passes Requiring Immediate Decision -->
      <div>
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px;">
          <h3 style="font-size: 15px; font-weight: 700; color: var(--text);">
            🚨 Pending Gate Pass Requests
          </h3>
          <a href="#gatepasses" style="font-size: 12px; color: var(--primary); font-weight: 600;">View All Passes →</a>
        </div>
        <div id="warden-dashboard-pending-queue">
          <div class="state-container" style="padding: 30px;"><div class="spinner"></div></div>
        </div>

        <!-- Recent Completed / Decided Passes Ledger -->
        <div style="margin-top: 28px;">
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px;">
            <h3 style="font-size: 15px; font-weight: 700; color: var(--text);">
              📋 Recent Outing & Leave Decisions
            </h3>
          </div>
          <div id="warden-dashboard-recent-ledger">
            <div class="state-container" style="padding: 30px;"><div class="spinner"></div></div>
          </div>
        </div>
      </div>

      <!-- Right Column: Complaints & Operational Quick Links -->
      <div>
        <h3 style="font-size: 15px; font-weight: 700; color: var(--text); margin-bottom: 12px;">
          🛠️ Hostel Maintenance Activity
        </h3>
        <div id="warden-dashboard-complaints-list">
          <div class="state-container" style="padding: 30px;"><div class="spinner"></div></div>
        </div>

        <!-- Quick Institutional Notices Mini-Widget -->
        <div style="margin-top: 24px;">
          <h3 style="font-size: 15px; font-weight: 700; color: var(--text); margin-bottom: 12px;">
            📢 Campus Circulars
          </h3>
          <div id="warden-dashboard-notices">
            <div class="state-container" style="padding: 20px;"><div class="spinner"></div></div>
          </div>
        </div>
      </div>
    </div>

    <!-- Modal Root Container for Gate Pass Review & Rejection -->
    <div id="hostel-modal-root"></div>
  `;

  // Fetch live operational data concurrently
  try {
    const [passes, complaints, notices] = await Promise.all([
      api.get("/api/v1/gatepasses"),
      api.get("/api/v1/complaints"),
      api.get("/api/v1/class-notices").catch(() => [])
    ]);

    // Update KPI numbers with authoritative data
    const pendingList = passes.filter(p => p.status === "PENDING");
    const approvedList = passes.filter(p => p.status === "APPROVED");
    const checkedOutList = passes.filter(p => p.status === "CHECKED_OUT");
    const activeComplaints = complaints.filter(c => c.status === "OPEN" || c.status === "ASSIGNED" || c.status === "IN_PROGRESS");

    const kpiPending = document.getElementById("warden-kpi-pending");
    const kpiApproved = document.getElementById("warden-kpi-approved");
    const kpiOut = document.getElementById("warden-kpi-out");
    const kpiComplaints = document.getElementById("warden-kpi-complaints");

    if (kpiPending) kpiPending.textContent = pendingList.length;
    if (kpiApproved) kpiApproved.textContent = approvedList.length;
    if (kpiOut) kpiOut.textContent = checkedOutList.length;
    if (kpiComplaints) kpiComplaints.textContent = activeComplaints.length;

    // Render Pending Queue
    const pendingQueueEl = document.getElementById("warden-dashboard-pending-queue");
    if (pendingQueueEl) {
      if (pendingList.length === 0) {
        pendingQueueEl.innerHTML = `
          <div class="card" style="padding: 24px; text-align: center;">
            <div style="font-size: 24px; margin-bottom: 6px;">🎉</div>
            <div style="font-size: 14px; font-weight: 700; color: var(--text);">No Pending Passes</div>
            <div style="font-size: 12px; color: var(--text-secondary); margin-top: 4px;">
              All student leave and day-outing requests have been processed.
            </div>
          </div>
        `;
      } else {
        pendingQueueEl.innerHTML = `
          <div style="display: flex; flex-direction: column; gap: 10px;">
            ${pendingList.map(gp => {
              const meta = getStudentMeta(gp);
              return `
                <div class="card" style="padding: 16px; border-left: 4px solid var(--warning);">
                  <div style="display: flex; justify-content: space-between; align-items: flex-start; gap: 12px; flex-wrap: wrap;">
                    <div>
                      <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 4px;">
                        <span style="font-family: var(--font-family-mono); font-weight: 700; font-size: 12px; color: var(--primary);">
                          ${escapeHtml(gp.pass_number)}
                        </span>
                        <span class="status-badge info" style="font-size: 10px;">${escapeHtml(gp.pass_type)}</span>
                        <span class="status-badge pending" style="font-size: 10px;">◷ PENDING</span>
                      </div>
                      <div style="font-size: 14px; font-weight: 700; color: var(--text);">
                        ${escapeHtml(meta.name)} &bull; <span style="font-weight: 500; color: var(--text-secondary); font-size: 12px;">Roll: ${escapeHtml(meta.roll)} (Room ${escapeHtml(meta.room)})</span>
                      </div>
                      <div style="font-size: 13px; color: var(--text-secondary); margin: 4px 0 6px 0;">
                        <strong>Destination:</strong> ${escapeHtml(gp.destination)} &bull; <strong>Purpose:</strong> ${escapeHtml(gp.purpose)}
                      </div>
                      <div style="font-size: 11px; color: var(--text-muted); display: flex; gap: 14px; flex-wrap: wrap;">
                        <span>📤 Out: ${formatDateTime(gp.out_time)}</span>
                        <span>📥 Expected: ${formatDateTime(gp.expected_in_time)}</span>
                        <span>🕒 Requested: ${timeAgo(gp.created_at)}</span>
                      </div>
                    </div>
                    <div style="display: flex; gap: 8px; align-items: center;">
                      <button class="btn btn-sm btn-primary" onclick="window.openWardenPassModal('${escapeHtml(gp.id)}')" type="button">
                        Review & Decide
                      </button>
                    </div>
                  </div>
                </div>
              `;
            }).join("")}
          </div>
        `;
      }
    }

    // Render Recent Decisions Ledger
    const recentLedgerEl = document.getElementById("warden-dashboard-recent-ledger");
    if (recentLedgerEl) {
      const decidedPasses = passes.filter(p => p.status !== "PENDING").slice(0, 5);
      if (decidedPasses.length === 0) {
        recentLedgerEl.innerHTML = `<div class="card" style="padding: 16px; font-size: 13px; color: var(--text-muted);">No decision history recorded yet.</div>`;
      } else {
        recentLedgerEl.innerHTML = `
          <div style="display: flex; flex-direction: column; gap: 8px;">
            ${decidedPasses.map(gp => {
              const meta = getStudentMeta(gp);
              return `
                <div class="card" style="padding: 12px 16px; display: flex; justify-content: space-between; align-items: center; gap: 12px; flex-wrap: wrap;">
                  <div>
                    <div style="display: flex; align-items: center; gap: 8px;">
                      <span style="font-family: var(--font-family-mono); font-weight: 700; font-size: 12px; color: var(--primary);">${escapeHtml(gp.pass_number)}</span>
                      <strong style="font-size: 13px; color: var(--text);">${escapeHtml(meta.name)}</strong>
                      <span style="font-size: 11px; color: var(--text-muted);">(Roll: ${escapeHtml(meta.roll)})</span>
                    </div>
                    <div style="font-size: 12px; color: var(--text-secondary); margin-top: 2px;">
                      ${escapeHtml(gp.destination)} &bull; Out: ${formatDateTime(gp.out_time)}
                    </div>
                  </div>
                  <div style="display: flex; align-items: center; gap: 10px;">
                    ${formatStatusBadge(gp.status)}
                    <button class="btn btn-sm btn-outline" onclick="window.openWardenPassModal('${escapeHtml(gp.id)}')" type="button">
                      Details
                    </button>
                  </div>
                </div>
              `;
            }).join("")}
          </div>
        `;
      }
    }

    // Render Complaints List (Hostel Filtered)
    const complaintsListEl = document.getElementById("warden-dashboard-complaints-list");
    if (complaintsListEl) {
      const topComplaints = complaints.slice(0, 4);
      if (topComplaints.length === 0) {
        complaintsListEl.innerHTML = `<div class="card" style="padding: 16px; font-size: 13px; color: var(--text-muted);">No complaints currently recorded.</div>`;
      } else {
        complaintsListEl.innerHTML = `
          <div style="display: flex; flex-direction: column; gap: 8px;">
            ${topComplaints.map(c => `
              <div class="card" style="padding: 12px 14px;">
                <div style="display: flex; justify-content: space-between; align-items: flex-start; gap: 8px;">
                  <div style="font-size: 13px; font-weight: 700; color: var(--text);">${escapeHtml(c.title)}</div>
                  ${formatStatusBadge(c.status)}
                </div>
                <div style="font-size: 11px; color: var(--text-muted); margin-top: 4px;">
                  📍 ${escapeHtml(c.location_details || c.location_type)} &bull; Lodged: ${timeAgo(c.created_at)}
                </div>
              </div>
            `).join("")}
          </div>
        `;
      }
    }

    // Render Campus Notices Mini-Widget
    const noticesEl = document.getElementById("warden-dashboard-notices");
    if (noticesEl) {
      const topNotices = (notices || []).slice(0, 3);
      if (topNotices.length === 0) {
        noticesEl.innerHTML = `<div class="card" style="padding: 14px; font-size: 12px; color: var(--text-muted);">No campus alerts posted today.</div>`;
      } else {
        noticesEl.innerHTML = `
          <div style="display: flex; flex-direction: column; gap: 6px;">
            ${topNotices.map(n => `
              <div class="card" style="padding: 10px 12px; border-left: 3px solid var(--primary);">
                <div style="font-size: 12px; font-weight: 700; color: var(--text);">${escapeHtml(n.title || n.notice_type)}</div>
                <div style="font-size: 11px; color: var(--text-secondary); margin-top: 2px;">${escapeHtml(n.details || '')}</div>
              </div>
            `).join("")}
          </div>
        `;
      }
    }

  } catch (err) {
    console.error("Failed to load Warden dashboard data:", err);
    showToast(err.message || "Failed to load live dashboard statistics", "error");
  }
}


/* ==========================================================================
   2. WARDEN GATE PASS MANAGEMENT & APPROVAL / REJECTION
   ========================================================================== */
export async function renderWardenGatePasses(mainEl) {
  if (!mainEl) return;

  mainEl.innerHTML = `
    <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 12px; margin-bottom: 20px;">
      <div>
        <h2>🎫 Gate Pass Review & Audit Desk</h2>
        <p style="margin: 2px 0 0 0; font-size: 13px; color: var(--text-secondary);">
          Authoritative review of student day-outing and home-leave authorization requests.
        </p>
      </div>
      <div>
        <button class="btn btn-outline" id="btn-refresh-warden-passes" type="button">🔄 Refresh Passes</button>
      </div>
    </div>

    <!-- Filter Tabs -->
    <div class="filter-tab-bar" id="warden-filter-bar">
      <button class="filter-tab active" data-filter="ALL" type="button">All Passes</button>
      <button class="filter-tab" data-filter="PENDING" type="button">🚨 Pending Review</button>
      <button class="filter-tab" data-filter="APPROVED" type="button">✓ Approved (Active QR)</button>
      <button class="filter-tab" data-filter="CHECKED_OUT" type="button">● Checked Out</button>
      <button class="filter-tab" data-filter="COMPLETED" type="button">✓ Returned</button>
      <button class="filter-tab" data-filter="REJECTED" type="button">✕ Rejected</button>
      <button class="filter-tab" data-filter="OVERDUE" type="button">⚠️ Overdue</button>
    </div>

    <!-- Passes List Container -->
    <div id="warden-passes-container" style="margin-top: 16px;">
      <div class="state-container"><div class="spinner"></div></div>
    </div>

    <!-- Modal Root Container -->
    <div id="hostel-modal-root"></div>
  `;

  let currentFilter = "ALL";
  let cachedPasses = [];

  const loadPasses = async (filter = "ALL") => {
    currentFilter = filter;
    const container = document.getElementById("warden-passes-container");
    if (!container) return;

    container.innerHTML = `<div class="state-container"><div class="spinner"></div></div>`;

    try {
      cachedPasses = await api.get("/api/v1/gatepasses");
      renderPassesList(cachedPasses, currentFilter);
    } catch (err) {
      container.innerHTML = `
        <div class="card">
          <div class="state-container" style="color: var(--error);">
            <div class="state-icon">⚠️</div>
            <div class="state-title">Unable to Load Gate Passes</div>
            <div class="state-desc">${escapeHtml(err.message)}</div>
            <button class="btn btn-outline" onclick="location.reload()" type="button" style="margin-top: 12px;">Retry</button>
          </div>
        </div>
      `;
    }
  };

  const renderPassesList = (list, filter) => {
    const container = document.getElementById("warden-passes-container");
    if (!container) return;

    let displayList = list;
    if (filter !== "ALL") {
      displayList = list.filter(p => p.status === filter);
    }

    if (displayList.length === 0) {
      container.innerHTML = `
        <div class="card">
          <div class="state-container" style="padding: 40px 20px;">
            <div class="state-icon">🎫</div>
            <div class="state-title">No passes found</div>
            <div class="state-desc">There are no gate pass records matching status '${escapeHtml(filter)}'.</div>
          </div>
        </div>
      `;
      return;
    }

    container.innerHTML = `
      <div style="display: flex; flex-direction: column; gap: 12px;">
        ${displayList.map(gp => {
          const meta = getStudentMeta(gp);
          const isPending = gp.status === "PENDING";
          const isApproved = gp.status === "APPROVED";
          const isRejected = gp.status === "REJECTED";
          const isUsed = ["CHECKED_OUT", "COMPLETED", "OVERDUE"].includes(gp.status);

          return `
            <div class="card" style="padding: 16px; ${isPending ? 'border-left: 4px solid var(--warning);' : ''}">
              <div style="display: flex; justify-content: space-between; align-items: flex-start; gap: 12px; flex-wrap: wrap;">
                <div>
                  <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 4px;">
                    <span style="font-family: var(--font-family-mono); font-weight: 700; font-size: 12px; color: var(--primary);">
                      ${escapeHtml(gp.pass_number)}
                    </span>
                    <span class="status-badge info" style="font-size: 10px;">${escapeHtml(gp.pass_type)}</span>
                    ${isPending ? '<span class="status-badge pending" style="font-size: 10px;">🚨 ACTION REQUIRED</span>' : ''}
                  </div>
                  <h4 style="font-size: 15px; font-weight: 700; color: var(--text);">
                    ${escapeHtml(meta.name)} &bull; <span style="font-size: 12px; font-weight: 500; color: var(--text-secondary);">Roll: ${escapeHtml(meta.roll)} &bull; Room ${escapeHtml(meta.room)} (${escapeHtml(meta.hostel)})</span>
                  </h4>
                  <p style="font-size: 13px; color: var(--text-secondary); margin: 4px 0 8px 0;">
                    <strong>Destination:</strong> ${escapeHtml(gp.destination)} &bull; <strong>Purpose:</strong> ${escapeHtml(gp.purpose)}
                  </p>
                  <div style="font-size: 11px; color: var(--text-muted); display: flex; gap: 16px; flex-wrap: wrap;">
                    <span>📤 Out: ${formatDateTime(gp.out_time)}</span>
                    <span>📥 Expected Return: ${formatDateTime(gp.expected_in_time)}</span>
                    ${gp.actual_out_time ? `<span>Gate Out: ${formatDateTime(gp.actual_out_time)}</span>` : ''}
                    ${gp.actual_in_time ? `<span>Gate Return: ${formatDateTime(gp.actual_in_time)}</span>` : ''}
                    <span>🕒 Requested: ${formatDate(gp.created_at)}</span>
                  </div>
                  ${isRejected && gp.rejection_reason ? `
                    <div style="margin-top: 8px; font-size: 12px; background: var(--error-bg); color: var(--error-text); padding: 6px 10px; border-radius: var(--radius-sm); border: 1px solid var(--error-border);">
                      <strong>Rejection Reason:</strong> ${escapeHtml(gp.rejection_reason)}
                    </div>
                  ` : ''}
                </div>
                <div style="display: flex; flex-direction: column; align-items: flex-end; gap: 8px;">
                  ${formatStatusBadge(gp.status)}
                  <button class="btn btn-sm ${isPending ? 'btn-primary' : 'btn-outline'}" onclick="window.openWardenPassModal('${escapeHtml(gp.id)}')" type="button">
                    ${isPending ? 'Review & Decide →' : 'View Pass Details'}
                  </button>
                  ${isApproved && gp.qr_token && gp.qr_token.qr_data_uri ? `
                    <span style="font-size: 11px; color: var(--success-text); font-weight: 600;">✓ 1-Time QR Active</span>
                  ` : isUsed ? `
                    <span style="font-size: 11px; color: var(--text-muted);">✓ QR Consumed</span>
                  ` : ''}
                </div>
              </div>
            </div>
          `;
        }).join("")}
      </div>
    `;
  };

  // Wire Filter Bar
  document.getElementById("warden-filter-bar")?.querySelectorAll(".filter-tab").forEach(tab => {
    tab.addEventListener("click", () => {
      document.querySelectorAll("#warden-filter-bar .filter-tab").forEach(t => t.classList.remove("active"));
      tab.classList.add("active");
      const filter = tab.getAttribute("data-filter");
      renderPassesList(cachedPasses, filter);
    });
  });

  document.getElementById("btn-refresh-warden-passes")?.addEventListener("click", () => loadPasses(currentFilter));

  loadPasses("ALL");
}

/* --------------------------------------------------------------------------
   WARDEN GATE PASS ACTION & DETAIL MODAL
   -------------------------------------------------------------------------- */
window.openWardenPassModal = async function(passId) {
  const root = document.getElementById("hostel-modal-root");
  if (!root) return;

  root.innerHTML = `
    <div class="modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="modal-wp-title">
      <div class="modal-dialog" style="max-width: 580px;">
        <div class="modal-header">
          <div class="modal-title" id="modal-wp-title">🎫 Gate Pass Inspection</div>
          <button type="button" class="btn btn-sm btn-outline" id="btn-close-wp-modal">✕</button>
        </div>
        <div class="modal-body" id="wp-modal-body">
          <div class="state-container" style="padding: 40px;"><div class="spinner"></div></div>
        </div>
      </div>
    </div>
  `;

  const closeModal = () => root.replaceChildren();
  document.getElementById("btn-close-wp-modal")?.addEventListener("click", closeModal);

  try {
    const gp = await api.get(`/api/v1/gatepasses/${passId}`);
    const meta = getStudentMeta(gp);
    const bodyEl = document.getElementById("wp-modal-body");
    if (!bodyEl) return;

    const isPending = gp.status === "PENDING";
    const isApproved = gp.status === "APPROVED";
    const isRejected = gp.status === "REJECTED";
    const isUsed = ["CHECKED_OUT", "COMPLETED", "OVERDUE"].includes(gp.status);

    bodyEl.innerHTML = `
      <div id="wp-modal-alert" class="form-alert error" style="display: none; margin-bottom: 12px;"></div>

      <!-- Student Credentials Banner -->
      <div class="card" style="padding: 14px; background: var(--surface-hover); border-left: 4px solid var(--primary); margin-bottom: 16px;">
        <div style="font-size: 11px; font-weight: 700; color: var(--text-muted); text-transform: uppercase;">Student Applicant</div>
        <div style="font-size: 15px; font-weight: 700; color: var(--text); margin-top: 2px;">
          ${escapeHtml(meta.name)} &bull; Roll: ${escapeHtml(meta.roll)}
        </div>
        <div style="font-size: 12px; color: var(--text-secondary); margin-top: 2px;">
          ${escapeHtml(meta.dept)} &bull; ${escapeHtml(meta.hostel)} &bull; Room ${escapeHtml(meta.room)}
        </div>
        ${meta.phone ? `<div style="font-size: 11px; color: var(--text-muted); margin-top: 2px;">📞 Registered Phone: ${escapeHtml(meta.phone)}</div>` : ''}
      </div>

      <!-- Pass Parameters -->
      <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px; font-size: 13px; margin-bottom: 16px;">
        <div>
          <span style="color: var(--text-muted); font-size: 11px; font-weight: 700; text-transform: uppercase;">Pass Number</span><br/>
          <strong style="font-family: var(--font-family-mono); color: var(--primary);">${escapeHtml(gp.pass_number)}</strong>
        </div>
        <div>
          <span style="color: var(--text-muted); font-size: 11px; font-weight: 700; text-transform: uppercase;">Pass Classification</span><br/>
          <span class="status-badge info" style="font-size: 11px;">${escapeHtml(gp.pass_type)}</span>
        </div>
        <div>
          <span style="color: var(--text-muted); font-size: 11px; font-weight: 700; text-transform: uppercase;">Requested Out Time</span><br/>
          ${formatDateTime(gp.out_time)}
        </div>
        <div>
          <span style="color: var(--text-muted); font-size: 11px; font-weight: 700; text-transform: uppercase;">Expected In Time</span><br/>
          ${formatDateTime(gp.expected_in_time)}
        </div>
        <div style="grid-column: span 2;">
          <span style="color: var(--text-muted); font-size: 11px; font-weight: 700; text-transform: uppercase;">Destination</span><br/>
          <strong>${escapeHtml(gp.destination)}</strong>
        </div>
        <div style="grid-column: span 2;">
          <span style="color: var(--text-muted); font-size: 11px; font-weight: 700; text-transform: uppercase;">Purpose / Justification</span><br/>
          <p style="margin: 2px 0 0 0; color: var(--text-secondary);">${escapeHtml(gp.purpose)}</p>
        </div>
      </div>

      <!-- Decision & Perimeter Execution Status -->
      <div class="card" style="padding: 14px; margin-bottom: 16px;">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
          <span style="font-size: 12px; font-weight: 700; color: var(--text-muted); text-transform: uppercase;">Current Lifecycle Status</span>
          ${formatStatusBadge(gp.status)}
        </div>
        <div style="font-size: 12px; color: var(--text-secondary); display: flex; flex-direction: column; gap: 4px;">
          <div>Decision State: <strong>${escapeHtml(gp.decision_status)}</strong></div>
          ${gp.decision_at ? `<div>Decided At: ${formatDateTime(gp.decision_at)}</div>` : ''}
          ${gp.rejection_reason ? `<div style="color: var(--error); font-weight: 600;">Rejection Reason: ${escapeHtml(gp.rejection_reason)}</div>` : ''}
          ${gp.actual_out_time ? `<div>Gate Exit Scan: ${formatDateTime(gp.actual_out_time)}</div>` : ''}
          ${gp.actual_in_time ? `<div>Gate Return Scan: ${formatDateTime(gp.actual_in_time)}</div>` : ''}
        </div>
      </div>

      <!-- One-Time QR Section -->
      ${isApproved && gp.qr_token && gp.qr_token.qr_data_uri ? `
        <div class="qr-card-wrap" style="margin-bottom: 16px;">
          <div class="qr-title">ONE-TIME GATE PASS QR</div>
          <div class="qr-instructions">
            Valid for one successful security-gate verification. This cryptographic pass does NOT rotate or refresh.
          </div>
          <div style="display: flex; justify-content: center; margin: 12px 0;">
            <img src="${gp.qr_token.qr_data_uri}" alt="One-Time Pass QR Code" class="qr-img-display" style="width: 170px; height: 170px;" />
          </div>
          <div style="font-size: 11px; font-family: var(--font-family-mono); color: var(--text-muted);">
            Token ID: ${escapeHtml(gp.qr_token.qr_token.slice(0, 16))}... &bull; Status: ${escapeHtml(gp.qr_token.status)}
          </div>
        </div>
      ` : isUsed ? `
        <div class="card" style="padding: 12px; text-align: center; background: var(--surface-hover); margin-bottom: 16px;">
          <div style="font-weight: 700; color: var(--text-muted); font-size: 13px;">🔒 QR ALREADY USED</div>
          <div style="font-size: 11px; color: var(--text-muted); margin-top: 2px;">
            This single-use pass was consumed at the campus gate and cannot be reused or regenerated.
          </div>
        </div>
      ` : ''}

      <!-- Rejection Input Drawer (Hidden by default) -->
      <div id="rejection-form-drawer" style="display: none; margin-bottom: 16px; padding: 14px; background: var(--error-bg); border-radius: var(--radius-md); border: 1px solid var(--error-border);">
        <label class="form-label" for="wp-rejection-reason" style="color: var(--error-text);">
          Reason for Rejection * <span style="font-size: 11px; font-weight: normal;">(Communicated to student)</span>
        </label>
        <textarea id="wp-rejection-reason" class="form-textarea" rows="2" placeholder="e.g. Incomplete parental permission or late curfew violation..." required minlength="3" maxlength="255"></textarea>
        <div style="display: flex; justify-content: flex-end; gap: 8px; margin-top: 10px;">
          <button type="button" class="btn btn-sm btn-outline" id="btn-cancel-rejection">Cancel</button>
          <button type="button" class="btn btn-sm btn-danger" id="btn-confirm-rejection">Confirm Rejection</button>
        </div>
      </div>

      <!-- Action Buttons -->
      <div style="display: flex; justify-content: flex-end; gap: 10px; margin-top: 16px; border-top: 1px solid var(--border); padding-top: 14px;">
        <button type="button" class="btn btn-outline" id="btn-done-modal">Close</button>
        ${isPending ? `
          <button type="button" class="btn btn-danger" id="btn-trigger-reject">✕ Reject Request</button>
          <button type="button" class="btn btn-primary" id="btn-trigger-approve">✓ Approve Gate Pass</button>
        ` : ''}
      </div>
    `;

    document.getElementById("btn-done-modal")?.addEventListener("click", closeModal);

    // Wire Approve Action
    document.getElementById("btn-trigger-approve")?.addEventListener("click", async () => {
      const btn = document.getElementById("btn-trigger-approve");
      const alertEl = document.getElementById("wp-modal-alert");
      if (btn) { btn.disabled = true; btn.textContent = "Approving..."; }
      if (alertEl) alertEl.style.display = "none";

      try {
        const approvedGp = await api.patch(`/api/v1/gatepasses/${passId}/approve`);
        showToast(`PASS APPROVED: Gate pass #${approvedGp.pass_number} is now active with one-time QR.`, "success");
        // Re-open with updated approved details
        window.openWardenPassModal(passId);
        // Refresh underlying list if present
        const main = document.getElementById("app-main-content");
        if (main && window.location.hash === "#gatepasses") renderWardenGatePasses(main);
        if (main && (window.location.hash === "#dashboard" || window.location.hash === "")) renderWardenDashboard(main, store.getState().user);
      } catch (err) {
        if (alertEl) {
          alertEl.textContent = err.message || "Approval failed. Please try again.";
          alertEl.style.display = "block";
        }
        if (btn) { btn.disabled = false; btn.textContent = "✓ Approve Gate Pass"; }
      }
    });

    // Wire Rejection Drawer & Confirmation
    const rejectDrawer = document.getElementById("rejection-form-drawer");
    const reasonInput = document.getElementById("wp-rejection-reason");

    document.getElementById("btn-trigger-reject")?.addEventListener("click", () => {
      if (rejectDrawer) rejectDrawer.style.display = "block";
      reasonInput?.focus();
    });

    document.getElementById("btn-cancel-rejection")?.addEventListener("click", () => {
      if (rejectDrawer) rejectDrawer.style.display = "none";
    });

    document.getElementById("btn-confirm-rejection")?.addEventListener("click", async () => {
      const reasonVal = reasonInput?.value.trim();
      const alertEl = document.getElementById("wp-modal-alert");

      if (!reasonVal) {
        if (alertEl) {
          alertEl.textContent = "Please provide an explicit justification reason for rejecting this gate pass.";
          alertEl.style.display = "block";
        }
        reasonInput?.focus();
        return;
      }

      const confirmBtn = document.getElementById("btn-confirm-rejection");
      if (confirmBtn) { confirmBtn.disabled = true; confirmBtn.textContent = "Rejecting..."; }

      try {
        const rejectedGp = await api.patch(`/api/v1/gatepasses/${passId}/reject`, {
          rejection_reason: reasonVal
        });
        showToast(`REJECTED: Pass #${rejectedGp.pass_number} has been rejected.`, "success");
        // Re-open modal with rejected status
        window.openWardenPassModal(passId);
        // Refresh background view
        const main = document.getElementById("app-main-content");
        if (main && window.location.hash === "#gatepasses") renderWardenGatePasses(main);
        if (main && (window.location.hash === "#dashboard" || window.location.hash === "")) renderWardenDashboard(main, store.getState().user);
      } catch (err) {
        if (alertEl) {
          alertEl.textContent = err.message || "Failed to reject pass.";
          alertEl.style.display = "block";
        }
        if (confirmBtn) { confirmBtn.disabled = false; confirmBtn.textContent = "Confirm Rejection"; }
      }
    });

  } catch (err) {
    const bodyEl = document.getElementById("wp-modal-body");
    if (bodyEl) {
      bodyEl.innerHTML = `
        <div class="state-container" style="color: var(--error);">
          <div class="state-icon">⚠️</div>
          <div class="state-title">Failed to Load Pass Details</div>
          <div class="state-desc">${escapeHtml(err.message)}</div>
        </div>
      `;
    }
  }
};


/* ==========================================================================
   3. HOSTEL AUTHORITY FACULTY DASHBOARD & RECORDS
   ========================================================================== */
export async function renderHostelFacultyDashboard(mainEl, user) {
  if (!mainEl) return;

  mainEl.innerHTML = `
    <!-- Top Welcome Card -->
    <div class="card" style="background: linear-gradient(135deg, var(--surface), var(--surface-hover)); border-left: 4px solid var(--primary);">
      <div style="display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 12px;">
        <div>
          <h2 style="font-size: 1.35rem; color: var(--text);">${escapeHtml(getGreeting(user.first_name))} 👋</h2>
          <p style="margin: 4px 0 0 0; font-size: 13px; color: var(--text-secondary);">
            Hostel Residential Oversight &bull; <strong style="color: var(--text);">Hostel Authority Faculty</strong> &bull; 
            <span class="status-badge info" style="font-size: 11px;">Advisor & Welfare Desk</span>
          </p>
        </div>
        <div style="display: flex; gap: 8px;">
          <a href="#gatepasses" class="btn btn-sm btn-primary">Gate Pass Records</a>
          <a href="#complaints" class="btn btn-sm btn-secondary">Hostel Complaints</a>
        </div>
      </div>
    </div>

    <!-- Ledger Status Overview Cards -->
    <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 14px; margin-top: 20px;">
      <div class="card" style="padding: 16px; border-top: 3px solid var(--text-muted);">
        <div style="font-size: 11px; font-weight: 700; color: var(--text-muted); text-transform: uppercase;">Total Passes</div>
        <div id="hf-kpi-total" style="font-size: 26px; font-weight: 800; color: var(--text); margin-top: 4px;">
          <div class="spinner" style="width: 20px; height: 20px;"></div>
        </div>
      </div>
      <div class="card" style="padding: 16px; border-top: 3px solid var(--warning);">
        <div style="font-size: 11px; font-weight: 700; color: var(--text-muted); text-transform: uppercase;">Pending Review</div>
        <div id="hf-kpi-pending" style="font-size: 26px; font-weight: 800; color: var(--warning); margin-top: 4px;">
          <div class="spinner" style="width: 20px; height: 20px;"></div>
        </div>
      </div>
      <div class="card" style="padding: 16px; border-top: 3px solid var(--success);">
        <div style="font-size: 11px; font-weight: 700; color: var(--text-muted); text-transform: uppercase;">Approved (Active QR)</div>
        <div id="hf-kpi-approved" style="font-size: 26px; font-weight: 800; color: var(--success); margin-top: 4px;">
          <div class="spinner" style="width: 20px; height: 20px;"></div>
        </div>
      </div>
      <div class="card" style="padding: 16px; border-top: 3px solid var(--info);">
        <div style="font-size: 11px; font-weight: 700; color: var(--text-muted); text-transform: uppercase;">Checked Out</div>
        <div id="hf-kpi-out" style="font-size: 26px; font-weight: 800; color: var(--info); margin-top: 4px;">
          <div class="spinner" style="width: 20px; height: 20px;"></div>
        </div>
      </div>
      <div class="card" style="padding: 16px; border-top: 3px solid var(--primary);">
        <div style="font-size: 11px; font-weight: 700; color: var(--text-muted); text-transform: uppercase;">Returned</div>
        <div id="hf-kpi-completed" style="font-size: 26px; font-weight: 800; color: var(--primary); margin-top: 4px;">
          <div class="spinner" style="width: 20px; height: 20px;"></div>
        </div>
      </div>
    </div>

    <!-- Comprehensive Operational Records Table -->
    <div style="margin-top: 24px;">
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px; flex-wrap: wrap; gap: 8px;">
        <h3 style="font-size: 16px; font-weight: 700; color: var(--text);">
          📋 Institutional Gate Pass Ledger
        </h3>
        <a href="#gatepasses" class="btn btn-sm btn-outline">Open Full Records Table →</a>
      </div>
      <div id="hf-dashboard-ledger">
        <div class="state-container" style="padding: 30px;"><div class="spinner"></div></div>
      </div>
    </div>

    <!-- Active Complaints & Notices Grid -->
    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 20px; margin-top: 24px;">
      <div>
        <h3 style="font-size: 15px; font-weight: 700; color: var(--text); margin-bottom: 12px;">
          🛠️ Facility Complaints Roster
        </h3>
        <div id="hf-dashboard-complaints">
          <div class="state-container" style="padding: 20px;"><div class="spinner"></div></div>
        </div>
      </div>
      <div>
        <h3 style="font-size: 15px; font-weight: 700; color: var(--text); margin-bottom: 12px;">
          📢 Institutional Notices
        </h3>
        <div id="hf-dashboard-notices">
          <div class="state-container" style="padding: 20px;"><div class="spinner"></div></div>
        </div>
      </div>
    </div>

    <div id="hostel-modal-root"></div>
  `;

  try {
    const [passes, complaints, notices] = await Promise.all([
      api.get("/api/v1/gatepasses"),
      api.get("/api/v1/complaints"),
      api.get("/api/v1/class-notices").catch(() => [])
    ]);

    // Update KPI counts
    const kpiTotal = document.getElementById("hf-kpi-total");
    const kpiPending = document.getElementById("hf-kpi-pending");
    const kpiApproved = document.getElementById("hf-kpi-approved");
    const kpiOut = document.getElementById("hf-kpi-out");
    const kpiCompleted = document.getElementById("hf-kpi-completed");

    if (kpiTotal) kpiTotal.textContent = passes.length;
    if (kpiPending) kpiPending.textContent = passes.filter(p => p.status === "PENDING").length;
    if (kpiApproved) kpiApproved.textContent = passes.filter(p => p.status === "APPROVED").length;
    if (kpiOut) kpiOut.textContent = passes.filter(p => p.status === "CHECKED_OUT").length;
    if (kpiCompleted) kpiCompleted.textContent = passes.filter(p => p.status === "COMPLETED").length;

    // Render Ledger Preview Table
    const ledgerEl = document.getElementById("hf-dashboard-ledger");
    if (ledgerEl) {
      if (passes.length === 0) {
        ledgerEl.innerHTML = `<div class="card" style="padding: 20px; text-align: center; color: var(--text-muted);">No gate pass records in database.</div>`;
      } else {
        ledgerEl.innerHTML = `
          <div class="card" style="padding: 0; overflow-x: auto;">
            <table class="table" style="margin: 0;">
              <thead>
                <tr>
                  <th>Pass #</th>
                  <th>Student</th>
                  <th>Type</th>
                  <th>Destination</th>
                  <th>Out Time</th>
                  <th>Expected Return</th>
                  <th>Status</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                ${passes.slice(0, 8).map(gp => {
                  const meta = getStudentMeta(gp);
                  return `
                    <tr>
                      <td style="font-family: var(--font-family-mono); font-weight: 700; color: var(--primary);">
                        ${escapeHtml(gp.pass_number)}
                      </td>
                      <td>
                        <strong>${escapeHtml(meta.name)}</strong><br/>
                        <span style="font-size: 11px; color: var(--text-muted);">${escapeHtml(meta.roll)} (${escapeHtml(meta.room)})</span>
                      </td>
                      <td><span class="status-badge info" style="font-size: 10px;">${escapeHtml(gp.pass_type)}</span></td>
                      <td style="max-width: 140px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">
                        ${escapeHtml(gp.destination)}
                      </td>
                      <td style="font-size: 11px;">${formatDateTime(gp.out_time)}</td>
                      <td style="font-size: 11px;">${formatDateTime(gp.expected_in_time)}</td>
                      <td>${formatStatusBadge(gp.status)}</td>
                      <td>
                        <button class="btn btn-sm btn-outline" onclick="window.openWardenPassModal('${escapeHtml(gp.id)}')" type="button">
                          Details
                        </button>
                      </td>
                    </tr>
                  `;
                }).join("")}
              </tbody>
            </table>
          </div>
        `;
      }
    }

    // Complaints Preview
    const complaintsEl = document.getElementById("hf-dashboard-complaints");
    if (complaintsEl) {
      const topComplaints = complaints.slice(0, 3);
      if (topComplaints.length === 0) {
        complaintsEl.innerHTML = `<div class="card" style="padding: 14px; font-size: 12px; color: var(--text-muted);">No complaints recorded.</div>`;
      } else {
        complaintsEl.innerHTML = `
          <div style="display: flex; flex-direction: column; gap: 8px;">
            ${topComplaints.map(c => `
              <div class="card" style="padding: 10px 12px; display: flex; justify-content: space-between; align-items: center; gap: 8px;">
                <div>
                  <div style="font-size: 13px; font-weight: 700; color: var(--text);">${escapeHtml(c.title)}</div>
                  <div style="font-size: 11px; color: var(--text-muted);">${escapeHtml(c.location_details || c.location_type)} &bull; ${timeAgo(c.created_at)}</div>
                </div>
                ${formatStatusBadge(c.status)}
              </div>
            `).join("")}
          </div>
        `;
      }
    }

    // Notices Preview
    const noticesEl = document.getElementById("hf-dashboard-notices");
    if (noticesEl) {
      const topNotices = (notices || []).slice(0, 3);
      if (topNotices.length === 0) {
        noticesEl.innerHTML = `<div class="card" style="padding: 14px; font-size: 12px; color: var(--text-muted);">No campus notices.</div>`;
      } else {
        noticesEl.innerHTML = `
          <div style="display: flex; flex-direction: column; gap: 6px;">
            ${topNotices.map(n => `
              <div class="card" style="padding: 10px 12px; border-left: 3px solid var(--primary);">
                <div style="font-size: 12px; font-weight: 700; color: var(--text);">${escapeHtml(n.title || n.notice_type)}</div>
                <div style="font-size: 11px; color: var(--text-secondary); margin-top: 2px;">${escapeHtml(n.details || '')}</div>
              </div>
            `).join("")}
          </div>
        `;
      }
    }

  } catch (err) {
    console.error("Failed to load Hostel Faculty dashboard:", err);
    showToast(err.message || "Failed to load dashboard records", "error");
  }
}

export async function renderHostelFacultyGatePasses(mainEl) {
  // Hostel Authority Faculty inspects the same live backend passes via records-oriented filterable table
  renderWardenGatePasses(mainEl);
}


/* ==========================================================================
   4. HOSTEL COMPLAINTS (WARDEN & FACULTY EXPERIENCE)
   ========================================================================== */
export async function renderHostelComplaints(mainEl, role) {
  if (!mainEl) return;

  mainEl.innerHTML = `
    <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 12px; margin-bottom: 20px;">
      <div>
        <h2>🛠️ Hostel & Campus Maintenance Complaints</h2>
        <p style="margin: 2px 0 0 0; font-size: 13px; color: var(--text-secondary);">
          ${role === "WARDEN" 
            ? "Triage, monitor, and update resolution states for residential maintenance tickets." 
            : "Review residential maintenance status, SLAs, and resolution telemetry."}
        </p>
      </div>
      <div>
        <button class="btn btn-outline" id="btn-refresh-hostel-complaints" type="button">🔄 Refresh Complaints</button>
      </div>
    </div>

    <!-- Filter Tabs -->
    <div class="filter-tab-bar" id="complaints-filter-bar">
      <button class="filter-tab active" data-filter="ALL" type="button">All Complaints</button>
      <button class="filter-tab" data-filter="OPEN" type="button">Open</button>
      <button class="filter-tab" data-filter="ASSIGNED" type="button">Assigned</button>
      <button class="filter-tab" data-filter="IN_PROGRESS" type="button">In Progress</button>
      <button class="filter-tab" data-filter="RESOLVED" type="button">Resolved</button>
      <button class="filter-tab" data-filter="COMPLETED" type="button">Completed</button>
    </div>

    <!-- Complaints Container -->
    <div id="hostel-complaints-container" style="margin-top: 16px;">
      <div class="state-container"><div class="spinner"></div></div>
    </div>

    <!-- Modal Root Container -->
    <div id="hostel-modal-root"></div>
  `;

  let cachedComplaints = [];

  const loadComplaints = async (filter = "ALL") => {
    const container = document.getElementById("hostel-complaints-container");
    if (!container) return;

    container.innerHTML = `<div class="state-container"><div class="spinner"></div></div>`;

    try {
      cachedComplaints = await api.get("/api/v1/complaints");
      renderComplaintsList(cachedComplaints, filter);
    } catch (err) {
      container.innerHTML = `
        <div class="card">
          <div class="state-container" style="color: var(--error);">
            <div class="state-icon">⚠️</div>
            <div class="state-title">Unable to Load Complaints</div>
            <div class="state-desc">${escapeHtml(err.message)}</div>
          </div>
        </div>
      `;
    }
  };

  const renderComplaintsList = (list, filter) => {
    const container = document.getElementById("hostel-complaints-container");
    if (!container) return;

    let displayList = list;
    if (filter !== "ALL") {
      displayList = list.filter(c => c.status === filter);
    }

    if (displayList.length === 0) {
      container.innerHTML = `
        <div class="card">
          <div class="state-container" style="padding: 40px 20px;">
            <div class="state-icon">🛠️</div>
            <div class="state-title">No complaints found</div>
            <div class="state-desc">There are no complaints matching status '${escapeHtml(filter)}'.</div>
          </div>
        </div>
      `;
      return;
    }

    container.innerHTML = `
      <div style="display: flex; flex-direction: column; gap: 12px;">
        ${displayList.map(c => `
          <div class="card" style="padding: 16px;">
            <div style="display: flex; justify-content: space-between; align-items: flex-start; gap: 12px; flex-wrap: wrap;">
              <div>
                <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 4px;">
                  <span style="font-family: var(--font-family-mono); font-weight: 700; font-size: 12px; color: var(--primary);">
                    ${escapeHtml(c.ticket_number)}
                  </span>
                  <span class="status-badge info" style="font-size: 10px;">${escapeHtml(c.category_id || 'GENERAL')}</span>
                  ${c.priority === 'URGENT' ? '<span class="status-badge rejected" style="font-size: 10px;">⚡ URGENT</span>' : ''}
                </div>
                <h4 style="font-size: 15px; font-weight: 700; color: var(--text);">${escapeHtml(c.title)}</h4>
                <p style="font-size: 13px; color: var(--text-secondary); margin: 4px 0 8px 0;">${escapeHtml(c.description)}</p>
                <div style="font-size: 11px; color: var(--text-muted); display: flex; gap: 14px; flex-wrap: wrap;">
                  <span>📍 ${escapeHtml(c.location_type)}: ${escapeHtml(c.location_details)}</span>
                  <span>📅 Lodged: ${formatDate(c.created_at)}</span>
                  ${c.sla_deadline ? `<span>⏰ SLA Target: ${formatDate(c.sla_deadline)}</span>` : ''}
                  ${c.resolved_at ? `<span>✓ Resolved: ${formatDate(c.resolved_at)}</span>` : ''}
                </div>
                ${c.resolution_notes ? `
                  <div style="margin-top: 8px; font-size: 12px; background: var(--surface-hover); padding: 6px 10px; border-radius: var(--radius-sm); border-left: 3px solid var(--success);">
                    <strong>Resolution Notes:</strong> ${escapeHtml(c.resolution_notes)}
                  </div>
                ` : ''}
                ${c.rating ? `
                  <div style="margin-top: 6px; font-size: 12px; color: var(--color-butter-yellow); filter: drop-shadow(0 0 1px rgba(0,0,0,0.5));">
                    Student Rating: ${'★'.repeat(c.rating)}${'☆'.repeat(5 - c.rating)} (${c.rating}/5)
                  </div>
                ` : ''}
              </div>
              <div style="display: flex; flex-direction: column; align-items: flex-end; gap: 8px;">
                ${formatStatusBadge(c.status)}
                ${role === "WARDEN" && c.status !== "COMPLETED" ? `
                  <button class="btn btn-sm btn-outline" onclick="window.openWardenComplaintUpdateModal('${escapeHtml(c.id)}', '${escapeHtml(c.ticket_number)}', '${escapeHtml(c.status)}')" type="button">
                    Update Status
                  </button>
                ` : ''}
              </div>
            </div>
          </div>
        `).join("")}
      </div>
    `;
  };

  // Wire Filter Bar
  document.getElementById("complaints-filter-bar")?.querySelectorAll(".filter-tab").forEach(tab => {
    tab.addEventListener("click", () => {
      document.querySelectorAll("#complaints-filter-bar .filter-tab").forEach(t => t.classList.remove("active"));
      tab.classList.add("active");
      renderComplaintsList(cachedComplaints, tab.getAttribute("data-filter"));
    });
  });

  document.getElementById("btn-refresh-hostel-complaints")?.addEventListener("click", () => loadComplaints());

  loadComplaints("ALL");
}

/* --------------------------------------------------------------------------
   WARDEN COMPLAINT STATUS UPDATE MODAL
   -------------------------------------------------------------------------- */
window.openWardenComplaintUpdateModal = function(complaintId, ticketNumber, currentStatus) {
  const root = document.getElementById("hostel-modal-root");
  if (!root) return;

  root.innerHTML = `
    <div class="modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="modal-wc-title">
      <div class="modal-dialog" style="max-width: 440px;">
        <div class="modal-header">
          <div class="modal-title" id="modal-wc-title">🛠️ Update Status: ${escapeHtml(ticketNumber)}</div>
          <button type="button" class="btn btn-sm btn-outline" id="btn-close-wc-modal">✕</button>
        </div>
        <form id="form-update-complaint">
          <div class="modal-body">
            <div id="modal-wc-alert" class="form-alert error" style="display: none; margin-bottom: 12px;"></div>

            <div class="form-group">
              <label class="form-label" for="wc-status-select">Transition Status *</label>
              <select id="wc-status-select" class="form-select" required>
                <option value="IN_PROGRESS" ${currentStatus === 'IN_PROGRESS' ? 'selected' : ''}>In Progress (Work Order Dispatched)</option>
                <option value="RESOLVED" ${currentStatus === 'RESOLVED' ? 'selected' : ''}>Resolved (Maintenance Completed)</option>
              </select>
            </div>

            <div class="form-group">
              <label class="form-label" for="wc-resolution-notes">Resolution / Action Notes</label>
              <textarea id="wc-resolution-notes" class="form-textarea" rows="3" placeholder="Provide notes regarding work done, parts replaced, or inspection results..."></textarea>
            </div>
          </div>
          <div class="modal-footer">
            <button type="button" class="btn btn-outline" id="btn-cancel-wc">Cancel</button>
            <button type="submit" class="btn btn-primary" id="btn-submit-wc">Save Status</button>
          </div>
        </form>
      </div>
    </div>
  `;

  const closeModal = () => root.replaceChildren();
  document.getElementById("btn-close-wc-modal")?.addEventListener("click", closeModal);
  document.getElementById("btn-cancel-wc")?.addEventListener("click", closeModal);

  document.getElementById("form-update-complaint")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const btn = document.getElementById("btn-submit-wc");
    const alertEl = document.getElementById("modal-wc-alert");
    if (btn) { btn.disabled = true; btn.textContent = "Updating..."; }
    if (alertEl) alertEl.style.display = "none";

    try {
      const newStatus = document.getElementById("wc-status-select").value;
      const notes = document.getElementById("wc-resolution-notes").value.trim() || undefined;

      await api.patch(`/api/v1/complaints/${complaintId}/status`, {
        status: newStatus,
        resolution_notes: notes
      });

      closeModal();
      showToast(`Complaint status updated to ${newStatus}`, "success");
      const main = document.getElementById("app-main-content");
      if (main) renderHostelComplaints(main, "WARDEN");
    } catch (err) {
      if (alertEl) {
        alertEl.textContent = err.message || "Failed to update complaint status.";
        alertEl.style.display = "block";
      }
      if (btn) { btn.disabled = false; btn.textContent = "Save Status"; }
    }
  });
};


/* ==========================================================================
   5. STAFF INSTITUTIONAL PROFILE
   ========================================================================== */
export function renderStaffProfile(mainEl, user) {
  if (!mainEl || !user) return;

  const roleTitle = formatRole(user.role);

  mainEl.innerHTML = `
    <div style="margin-bottom: 20px;">
      <h2>👤 Institutional Profile & Credentials</h2>
      <p style="margin: 2px 0 0 0; font-size: 13px; color: var(--text-secondary);">
        Authoritative verified campus credentials from institutional registry.
      </p>
    </div>

    <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 16px;">
      <div class="card">
        <div class="card-header">
          <div class="card-title">Identity & Role</div>
          <span class="status-badge approved">✓ Active</span>
        </div>
        <div style="display: flex; align-items: center; gap: 16px; margin: 12px 0 16px 0;">
          <div class="account-avatar" style="width: 52px; height: 52px; font-size: 18px; font-weight: 700;">
            ${(user.first_name || 'U')[0]}${(user.last_name || '')[0] || ''}
          </div>
          <div>
            <div style="font-size: 16px; font-weight: 700; color: var(--text);">${escapeHtml(user.first_name)} ${escapeHtml(user.last_name)}</div>
            <div style="font-size: 12px; color: var(--text-secondary); margin-top: 2px;">
              <span class="status-badge info">${escapeHtml(roleTitle)}</span>
            </div>
          </div>
        </div>

        <div style="font-size: 13px; display: flex; flex-direction: column; gap: 10px; border-top: 1px solid var(--border); padding-top: 12px;">
          <div>
            <strong style="color: var(--text-muted); font-size: 11px; text-transform: uppercase;">Institutional Email</strong><br/>
            <span>${escapeHtml(user.email)}</span>
          </div>
          <div>
            <strong style="color: var(--text-muted); font-size: 11px; text-transform: uppercase;">Contact Number</strong><br/>
            <span>${escapeHtml(user.phone_number || 'N/A')}</span>
          </div>
          <div>
            <strong style="color: var(--text-muted); font-size: 11px; text-transform: uppercase;">Account Role Code</strong><br/>
            <span style="font-family: var(--font-family-mono); font-size: 12px;">${escapeHtml(user.role)}</span>
          </div>
          <div>
            <strong style="color: var(--text-muted); font-size: 11px; text-transform: uppercase;">Registry Member Since</strong><br/>
            <span>${formatDate(user.created_at)}</span>
          </div>
        </div>
      </div>

      <div class="card">
        <div class="card-header">
          <div class="card-title">Security & Protocol State</div>
          <span class="status-badge approved">● Operational</span>
        </div>
        <div style="font-size: 13px; display: flex; flex-direction: column; gap: 10px; margin-top: 12px;">
          <div>
            <strong style="color: var(--text-muted); font-size: 11px; text-transform: uppercase;">Authentication Mode</strong><br/>
            <span>HS256 Cryptographic Bearer Token</span>
          </div>
          <div>
            <strong style="color: var(--text-muted); font-size: 11px; text-transform: uppercase;">Session Status</strong><br/>
            <span class="status-badge approved" style="font-size: 10px;">✓ Active Verified Session</span>
          </div>
          <div>
            <strong style="color: var(--text-muted); font-size: 11px; text-transform: uppercase;">Perimeter Token Policy</strong><br/>
            <span>Single-Use Non-Rotating Cryptographic QR Tokens</span>
          </div>
          <div>
            <strong style="color: var(--text-muted); font-size: 11px; text-transform: uppercase;">Client Architecture</strong><br/>
            <span>Low-Bandwidth Vanilla PWA Shell &bull; BPUT Hackathon 2026</span>
          </div>
        </div>
      </div>
    </div>
  `;
}


/* ==========================================================================
   6. STAFF NOTIFICATIONS (FULL VIEW)
   ========================================================================== */
export async function renderStaffNotifications(mainEl) {
  if (!mainEl) return;

  mainEl.innerHTML = `
    <div style="margin-bottom: 20px;">
      <h2>🔔 Institutional Notification Center</h2>
      <p style="margin: 2px 0 0 0; font-size: 13px; color: var(--text-secondary);">
        Transactional operational alerts, gate pass submissions, and system audit notices.
      </p>
    </div>

    <div id="staff-notifications-container" style="margin-top: 16px;">
      <div class="state-container"><div class="spinner"></div></div>
    </div>
  `;

  try {
    const data = await api.get("/api/v1/notifications");
    const container = document.getElementById("staff-notifications-container");
    if (!container) return;

    const notifs = data.notifications || [];

    if (notifs.length === 0) {
      container.innerHTML = `
        <div class="card">
          <div class="state-container" style="padding: 40px 20px;">
            <div class="state-icon">🔔</div>
            <div class="state-title">No notifications</div>
            <div class="state-desc">You are all caught up with your hostel and campus alerts.</div>
          </div>
        </div>
      `;
      return;
    }

    container.innerHTML = `
      <div style="display: flex; flex-direction: column; gap: 10px;">
        ${notifs.map(n => `
          <div class="card" style="padding: 16px; ${!n.is_read ? 'background: var(--primary-subtle); border-left: 4px solid var(--primary);' : ''}">
            <div style="display: flex; justify-content: space-between; align-items: flex-start; gap: 12px;">
              <div>
                <div style="font-size: 14px; font-weight: 700; color: var(--text);">${escapeHtml(n.title)}</div>
                <div style="font-size: 13px; color: var(--text-secondary); margin: 4px 0;">${escapeHtml(n.message)}</div>
                <div style="font-size: 11px; color: var(--text-muted);">${timeAgo(n.created_at)}</div>
              </div>
              ${!n.is_read ? `
                <button class="btn btn-sm btn-outline" onclick="window.markStaffNotifRead('${escapeHtml(n.id)}')" type="button">
                  Mark Read
                </button>
              ` : `
                <span class="status-badge approved" style="font-size: 10px;">✓ Read</span>
              `}
            </div>
          </div>
        `).join("")}
      </div>
    `;
  } catch (err) {
    document.getElementById("staff-notifications-container")?.replaceChildren(
      document.createTextNode(`Unable to load notifications: ${err.message}`)
    );
  }
}

window.markStaffNotifRead = async function(id) {
  try {
    await api.patch(`/api/v1/notifications/${id}/read`);
    showToast("Notification marked as read", "success");
    const main = document.getElementById("app-main-content");
    if (main) renderStaffNotifications(main);
  } catch (err) {
    showToast(err.message || "Failed to mark read", "error");
  }
};


/* ==========================================================================
   STATUS BADGE FORMATTER
   ========================================================================== */
function formatStatusBadge(status) {
  switch (status) {
    case "APPROVED":
    case "COMPLETED":
    case "RESOLVED":
      return `<span class="status-badge approved">✓ ${escapeHtml(status)}</span>`;
    case "PENDING":
    case "SUBMITTED":
    case "UNDER_REVIEW":
      return `<span class="status-badge pending">◷ ${escapeHtml(status)}</span>`;
    case "REJECTED":
    case "OVERDUE":
      return `<span class="status-badge rejected">✕ ${escapeHtml(status)}</span>`;
    case "ASSIGNED":
    case "IN_PROGRESS":
    case "CHECKED_OUT":
      return `<span class="status-badge info">● ${escapeHtml(status)}</span>`;
    default:
      return `<span class="status-badge info">${escapeHtml(status || 'UNKNOWN')}</span>`;
  }
}
