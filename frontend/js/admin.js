/**
 * CampusFlow MVP — Campus Admin Operational Control Tower Module
 * Phase 11: Campus Admin Experience
 * 
 * Implements authoritative workflows for CAMPUS ADMIN (dean.admin@bput.ac.in):
 * 1. Operational Control Tower (GET /api/v1/admin/control-tower/metrics)
 * 2. SLA Breaches Operational Telemetry (GET /api/v1/admin/control-tower/sla-breaches)
 * 3. Recurring Infrastructure Hotspots (GET /api/v1/admin/control-tower/recurring-complaints)
 * 4. Comprehensive Complaints Operations & Assignment (GET /api/v1/complaints, PATCH /assign, PATCH /status)
 * 5. Targeted Communications & Announcements (GET /api/v1/class-notices, POST /api/v1/class-notices)
 * 6. Append-Only Immutable Audit Trail (GET /api/v1/admin/audit-logs)
 * 7. Administrative Notification Center & Institutional Profile
 */

import { api } from "./api.js";
import { showToast, loadNoticeBoard } from "./ui.js";
import { escapeHtml, formatDate, timeAgo, formatRole } from "./utils.js";

/* --------------------------------------------------------------------------
   KNOWN INSTITUTIONAL STAFF REGISTRY (For Complaint Assignment)
   -------------------------------------------------------------------------- */
const INSTITUTIONAL_STAFF = [
  { id: "21ec6b37-1466-4abd-89e0-063336cf4781", name: "Kailash Sahoo", role: "STAFF", dept: "Estate & Maintenance", title: "Senior Maintenance Supervisor" },
  { id: "6d889135-a03f-4fbc-ba97-87d956c01195", name: "Sunil Sharma", role: "WARDEN", dept: "Hostel Administration", title: "Chief Warden (Block B)" },
  { id: "46cb1ec2-fb28-4b92-b97d-335bdaf669f3", name: "Dr. Bijoy Mishra", role: "HOSTEL_FACULTY", dept: "Hostel Affairs Board", title: "Faculty Advisor" },
  { id: "1f1d9bce-445d-484a-b8bc-7aa891f89fee", name: "Ramesh Nayak", role: "LAB_ASSISTANT", dept: "Mechanical Engineering", title: "Workshop Lathe Assistant" },
  { id: "af6a3c3b-ef1d-4511-8330-7f259ac036fc", name: "Dhaneswar Pradhan", role: "GUARD", dept: "Perimeter Security", title: "Main Gate Officer" }
];

function getStaffNameById(staffId) {
  if (!staffId) return null;
  const staff = INSTITUTIONAL_STAFF.find(s => s.id === staffId);
  return staff ? `${staff.name} (${staff.title})` : `Staff ID: ${staffId.substring(0, 8)}...`;
}

/* --------------------------------------------------------------------------
   STATUS BADGES & INDICATORS
   -------------------------------------------------------------------------- */
export function formatComplaintStatusBadge(status) {
  switch (status) {
    case "OPEN":
      return `<span class="status-badge pending">● OPEN</span>`;
    case "ASSIGNED":
      return `<span class="status-badge info">● ASSIGNED</span>`;
    case "IN_PROGRESS":
      return `<span class="status-badge info">● IN PROGRESS</span>`;
    case "RESOLVED":
      return `<span class="status-badge approved">✓ RESOLVED</span>`;
    case "COMPLETED":
    case "CLOSED":
      return `<span class="status-badge approved">✓ COMPLETED</span>`;
    case "REOPENED":
      return `<span class="status-badge rejected">↺ REOPENED</span>`;
    default:
      return `<span class="status-badge info">${escapeHtml(status || 'UNKNOWN')}</span>`;
  }
}

export function formatPriorityBadge(priority) {
  const p = (priority || 'NORMAL').toUpperCase();
  switch (p) {
    case "EMERGENCY":
      return `<span class="status-badge rejected" style="font-weight: 800;">🚨 EMERGENCY</span>`;
    case "HIGH":
      return `<span class="status-badge warning" style="font-weight: 700;">⚠ HIGH</span>`;
    case "NORMAL":
      return `<span class="status-badge info">● NORMAL</span>`;
    case "LOW":
      return `<span class="status-badge" style="background: var(--surface-hover); color: var(--text-muted); border: 1px solid var(--border);">● LOW</span>`;
    default:
      return `<span class="status-badge info">${escapeHtml(p)}</span>`;
  }
}

export function formatSlaStatusBadge(slaDeadline) {
  if (!slaDeadline) return `<span class="status-badge info">No SLA</span>`;
  const deadline = new Date(slaDeadline);
  const now = new Date();
  const diffMs = deadline - now;

  if (diffMs < 0) {
    const hoursOver = Math.abs(Math.round(diffMs / (1000 * 60 * 60)));
    return `<span class="status-badge rejected" style="font-weight: 800;">⏱️ BREACHED (+${hoursOver}h)</span>`;
  } else {
    const hoursLeft = Math.round(diffMs / (1000 * 60 * 60));
    return `<span class="status-badge approved" style="font-size: 11px;">⏱️ ${hoursLeft}h remaining</span>`;
  }
}

export function formatAuditActionBadge(action) {
  if (action.includes("REJECT") || action.includes("BREACH") || action.includes("LOCKOUT")) {
    return `<span class="status-badge rejected" style="font-size: 10px; font-weight: 700;">✕ ${escapeHtml(action)}</span>`;
  }
  if (action.includes("APPROV") || action.includes("COMPLET") || action.includes("RESOLV")) {
    return `<span class="status-badge approved" style="font-size: 10px; font-weight: 700;">✓ ${escapeHtml(action)}</span>`;
  }
  if (action.includes("ASSIGN") || action.includes("ORDER") || action.includes("SUBMIT") || action.includes("CREATED")) {
    return `<span class="status-badge info" style="font-size: 10px; font-weight: 700;">● ${escapeHtml(action)}</span>`;
  }
  return `<span class="status-badge info" style="font-size: 10px;">${escapeHtml(action)}</span>`;
}


/* ==========================================================================
   1. ADMIN CONTROL TOWER (PRIMARY WORKFLOW)
   GET /api/v1/admin/control-tower/metrics
   ========================================================================== */
export async function renderAdminControlTower(mainEl, user) {
  if (!mainEl) return;

  mainEl.innerHTML = `
    <!-- Top Greeting & Operational Header -->
    <div style="display: flex; justify-content: space-between; align-items: flex-start; flex-wrap: wrap; gap: 16px; margin-bottom: 24px;">
      <div>
        <div style="font-size: 12px; font-weight: 800; color: var(--primary); text-transform: uppercase; letter-spacing: 0.5px;">
          BPUT Institutional Operations Tower
        </div>
        <h2 style="margin: 4px 0 0 0; font-size: 24px; font-weight: 800; color: var(--text);">
          Campus Control Tower 🏢
        </h2>
        <p style="margin: 4px 0 0 0; font-size: 13px; color: var(--text-secondary);">
          Authoritative real-time telemetry across complaints, SLA breaches, infrastructure hotspots, gate passes, and audit trails.
        </p>
      </div>

      <div style="display: flex; gap: 8px; flex-wrap: wrap;">
        <button class="btn btn-primary" id="btn-admin-broadcast" type="button" style="min-height: 44px;">
          📢 Broadcast Announcement
        </button>
        <button class="btn btn-outline" id="btn-admin-refresh-tower" type="button" style="min-height: 44px;">
          ↻ Refresh Telemetry
        </button>
      </div>
    </div>

    <!-- Operational KPI Metrics Cards -->
    <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 16px; margin-bottom: 24px;" id="admin-kpis-grid">
      <!-- Total Complaints -->
      <div class="card" style="padding: 16px; border-left: 4px solid var(--primary);">
        <div style="font-size: 11px; font-weight: 700; color: var(--text-muted); text-transform: uppercase;">Total Complaints</div>
        <div id="kpi-total-complaints" style="font-size: 28px; font-weight: 800; color: var(--text); margin-top: 4px;">--</div>
        <div id="kpi-complaints-open-sub" style="font-size: 11px; color: var(--text-secondary); margin-top: 2px;">Active tickets in system</div>
      </div>

      <!-- SLA Breaches Alert Card -->
      <div class="card" style="padding: 16px; border-left: 4px solid var(--error); cursor: pointer;" id="card-kpi-sla">
        <div style="display: flex; justify-content: space-between; align-items: center;">
          <div style="font-size: 11px; font-weight: 700; color: var(--error); text-transform: uppercase;">SLA Breaches</div>
          <span class="status-badge rejected" style="font-size: 10px;">Urgent</span>
        </div>
        <div id="kpi-sla-breaches" style="font-size: 28px; font-weight: 800; color: var(--error); margin-top: 4px;">--</div>
        <div style="font-size: 11px; color: var(--text-muted); margin-top: 2px;">Past resolution deadline &bull; View ➔</div>
      </div>

      <!-- Recurring Hotspots Alert Card -->
      <div class="card" style="padding: 16px; border-left: 4px solid var(--warning); cursor: pointer;" id="card-kpi-recurring">
        <div style="display: flex; justify-content: space-between; align-items: center;">
          <div style="font-size: 11px; font-weight: 700; color: var(--warning); text-transform: uppercase;">Recurring Hotspots</div>
          <span class="status-badge warning" style="font-size: 10px;">Heuristic Flag</span>
        </div>
        <div id="kpi-recurring-hotspots" style="font-size: 28px; font-weight: 800; color: var(--warning); margin-top: 4px;">--</div>
        <div style="font-size: 11px; color: var(--text-muted); margin-top: 2px;">Repeated campus faults &bull; View ➔</div>
      </div>

      <!-- Gate Passes Status -->
      <div class="card" style="padding: 16px; border-left: 4px solid var(--info);">
        <div style="font-size: 11px; font-weight: 700; color: var(--text-muted); text-transform: uppercase;">Gate Passes Active</div>
        <div id="kpi-gatepasses-active" style="font-size: 28px; font-weight: 800; color: var(--text); margin-top: 4px;">--</div>
        <div id="kpi-gatepasses-sub" style="font-size: 11px; color: var(--text-secondary); margin-top: 2px;">Pending / Approved passes</div>
      </div>

      <!-- Immutable Audit Events -->
      <div class="card" style="padding: 16px; border-left: 4px solid #8B5CF6; cursor: pointer;" id="card-kpi-audits">
        <div style="font-size: 11px; font-weight: 700; color: #8B5CF6; text-transform: uppercase;">Immutable Audit Logs</div>
        <div id="kpi-total-audits" style="font-size: 28px; font-weight: 800; color: var(--text); margin-top: 4px;">--</div>
        <div style="font-size: 11px; color: var(--text-muted); margin-top: 2px;">Tamper-evident events &bull; View ➔</div>
      </div>
    </div>

    <!-- Dual Column Operational Workspaces -->
    <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(320px, 1fr)); gap: 20px;">
      <!-- Left Column: Critical Action Items (SLA Breaches & Hotspots) -->
      <div style="display: flex; flex-direction: column; gap: 20px;">
        <!-- Immediate Attention: SLA Breaches Table -->
        <div class="card" style="border-top: 3px solid var(--error);">
          <div class="card-header" style="display: flex; justify-content: space-between; align-items: center;">
            <div style="display: flex; align-items: center; gap: 8px;">
              <span style="font-size: 16px;">⏱️</span>
              <span class="card-title" style="color: var(--error);">SLA Breach Alerts</span>
            </div>
            <a href="#sla-breaches" class="btn btn-sm btn-outline">Full SLA View</a>
          </div>
          <div id="tower-sla-container" style="padding: 16px;">
            <div class="state-container"><div class="spinner"></div></div>
          </div>
        </div>

        <!-- Infrastructure Hotspots -->
        <div class="card" style="border-top: 3px solid var(--warning);">
          <div class="card-header" style="display: flex; justify-content: space-between; align-items: center;">
            <div style="display: flex; align-items: center; gap: 8px;">
              <span style="font-size: 16px;">🔁</span>
              <span class="card-title" style="color: var(--warning);">Recurring Infrastructure Hotspots</span>
            </div>
            <a href="#recurring-issues" class="btn btn-sm btn-outline">Full Hotspots View</a>
          </div>
          <div id="tower-recurring-container" style="padding: 16px;">
            <div class="state-container"><div class="spinner"></div></div>
          </div>
        </div>
      </div>

      <!-- Right Column: Status Distributions, Workload & Recent Audits -->
      <div style="display: flex; flex-direction: column; gap: 20px;">
        <!-- Complaints Breakdown by Status -->
        <div class="card">
          <div class="card-header" style="display: flex; justify-content: space-between; align-items: center;">
            <div class="card-title">📊 Operational Status Breakdown</div>
            <a href="#complaints" class="btn btn-sm btn-outline">Manage Tickets</a>
          </div>
          <div id="tower-status-breakdown" style="padding: 16px;">
            <div class="state-container"><div class="spinner"></div></div>
          </div>
        </div>

        <!-- Maintenance Staff Workload -->
        <div class="card">
          <div class="card-header">
            <div class="card-title">🛠️ Active Maintenance Workload</div>
          </div>
          <div id="tower-workload-container" style="padding: 16px;">
            <div class="state-container"><div class="spinner"></div></div>
          </div>
        </div>

        <!-- Recent System Audit Activity -->
        <div class="card">
          <div class="card-header" style="display: flex; justify-content: space-between; align-items: center;">
            <div class="card-title">🛡️ Recent Security & Audit Ledger</div>
            <a href="#audit" class="btn btn-sm btn-outline">Audit Ledger</a>
          </div>
          <div id="tower-audit-preview" style="padding: 16px;">
            <div class="state-container"><div class="spinner"></div></div>
          </div>
        </div>
      </div>
    </div>

    <!-- Modal Root Container -->
    <div id="admin-modal-root"></div>
  `;

  // Attach quick action listeners
  document.getElementById("btn-admin-broadcast")?.addEventListener("click", () => {
    openCreateAnnouncementModal(() => renderAdminControlTower(mainEl, user));
  });

  document.getElementById("btn-admin-refresh-tower")?.addEventListener("click", () => {
    loadControlTowerData();
  });

  document.getElementById("card-kpi-sla")?.addEventListener("click", () => {
    window.location.hash = "#sla-breaches";
  });

  document.getElementById("card-kpi-recurring")?.addEventListener("click", () => {
    window.location.hash = "#recurring-issues";
  });

  document.getElementById("card-kpi-audits")?.addEventListener("click", () => {
    window.location.hash = "#audit";
  });

  // Fetch and populate live data
  const loadControlTowerData = async () => {
    try {
      const [metricsRes, breachesRes, recurringRes, auditsRes] = await Promise.allSettled([
        api.get("/api/v1/admin/control-tower/metrics"),
        api.get("/api/v1/admin/control-tower/sla-breaches"),
        api.get("/api/v1/admin/control-tower/recurring-complaints"),
        api.get("/api/v1/admin/audit-logs?limit=4")
      ]);

      const metrics = metricsRes.status === "fulfilled" ? metricsRes.value : null;
      const breaches = breachesRes.status === "fulfilled" ? (breachesRes.value || []) : [];
      const recurring = recurringRes.status === "fulfilled" ? (recurringRes.value || []) : [];
      const audits = auditsRes.status === "fulfilled" ? (auditsRes.value || []) : [];

      if (!metrics) {
        throw new Error(metricsRes.reason?.message || "Failed to load Control Tower metrics.");
      }

      // Update KPI Cards
      document.getElementById("kpi-total-complaints")?.replaceChildren(
        document.createTextNode(String(metrics.total_complaints || 0))
      );
      const openCount = (metrics.complaints_by_status?.OPEN || 0) + 
                        (metrics.complaints_by_status?.ASSIGNED || 0) + 
                        (metrics.complaints_by_status?.IN_PROGRESS || 0);
      document.getElementById("kpi-complaints-open-sub")?.replaceChildren(
        document.createTextNode(`${openCount} active (${metrics.complaints_by_status?.OPEN || 0} open, ${metrics.complaints_by_status?.ASSIGNED || 0} assigned)`)
      );

      document.getElementById("kpi-sla-breaches")?.replaceChildren(
        document.createTextNode(String(metrics.sla_breaches_count || 0))
      );

      document.getElementById("kpi-recurring-hotspots")?.replaceChildren(
        document.createTextNode(String(metrics.recurring_hotspots_count || 0))
      );

      const pendingPasses = metrics.gate_passes_by_status?.PENDING || 0;
      const approvedPasses = metrics.gate_passes_by_status?.APPROVED || 0;
      document.getElementById("kpi-gatepasses-active")?.replaceChildren(
        document.createTextNode(String(pendingPasses + approvedPasses))
      );
      document.getElementById("kpi-gatepasses-sub")?.replaceChildren(
        document.createTextNode(`${pendingPasses} pending approval &bull; ${approvedPasses} approved active`)
      );

      document.getElementById("kpi-total-audits")?.replaceChildren(
        document.createTextNode(String(metrics.total_audit_events || 0))
      );

      // Render SLA Breaches Preview
      const slaEl = document.getElementById("tower-sla-container");
      if (slaEl) {
        if (breaches.length === 0) {
          slaEl.innerHTML = `
            <div style="text-align: center; padding: 20px; color: var(--success);">
              <div style="font-size: 24px; margin-bottom: 4px;">✓</div>
              <div style="font-weight: 700; font-size: 13px;">Zero Active SLA Breaches</div>
              <div style="font-size: 11px; color: var(--text-secondary); margin-top: 2px;">All residential complaints are within standard resolution deadlines.</div>
            </div>
          `;
        } else {
          slaEl.innerHTML = `
            <div style="display: flex; flex-direction: column; gap: 8px;">
              ${breaches.slice(0, 3).map(b => `
                <div class="card" style="padding: 12px; border-left: 3px solid var(--error);">
                  <div style="display: flex; justify-content: space-between; align-items: flex-start; gap: 8px;">
                    <div>
                      <span style="font-family: var(--font-family-mono); font-size: 11px; font-weight: 700;">${escapeHtml(b.ticket_number)}</span>
                      <div style="font-size: 13px; font-weight: 700; color: var(--text); margin-top: 2px;">${escapeHtml(b.title)}</div>
                    </div>
                    ${formatPriorityBadge(b.priority)}
                  </div>
                  <div style="font-size: 11px; color: var(--text-secondary); margin-top: 4px;">
                    📍 ${escapeHtml(b.location_details)} &bull; ${escapeHtml(b.category_id)}
                  </div>
                  <div style="display: flex; justify-content: space-between; align-items: center; margin-top: 8px; font-size: 11px;">
                    ${formatSlaStatusBadge(b.sla_deadline)}
                    <button class="btn btn-sm btn-outline" onclick="window.adminOpenComplaint('${escapeHtml(b.id)}')" type="button">
                      Action Ticket
                    </button>
                  </div>
                </div>
              `).join("")}
            </div>
          `;
        }
      }

      // Render Recurring Hotspots Preview
      const recEl = document.getElementById("tower-recurring-container");
      if (recEl) {
        if (recurring.length === 0) {
          recEl.innerHTML = `
            <div style="text-align: center; padding: 20px; color: var(--text-muted);">
              <div style="font-size: 20px; margin-bottom: 4px;">🔁</div>
              <div style="font-weight: 700; font-size: 13px;">No Recurring Hotspots Flagged</div>
              <div style="font-size: 11px; color: var(--text-secondary); margin-top: 2px;">Statistical recurrence heuristic is clean.</div>
            </div>
          `;
        } else {
          recEl.innerHTML = `
            <div style="display: flex; flex-direction: column; gap: 8px;">
              ${recurring.slice(0, 3).map(r => `
                <div class="card" style="padding: 12px; border-left: 3px solid var(--warning);">
                  <div style="display: flex; justify-content: space-between; align-items: flex-start; gap: 8px;">
                    <div>
                      <span class="status-badge warning" style="font-size: 10px; margin-bottom: 4px;">🔁 Recurring Hotspot</span>
                      <div style="font-size: 13px; font-weight: 700; color: var(--text);">${escapeHtml(r.title)}</div>
                    </div>
                    ${formatComplaintStatusBadge(r.status)}
                  </div>
                  <div style="font-size: 11px; color: var(--text-secondary); margin-top: 4px;">
                    📍 <strong>${escapeHtml(r.location_details)}</strong> &bull; ${escapeHtml(r.category_id)}
                  </div>
                  <div style="display: flex; justify-content: space-between; align-items: center; margin-top: 8px; font-size: 11px; color: var(--text-muted);">
                    <span>Reported: ${formatDate(r.created_at)}</span>
                    <button class="btn btn-sm btn-outline" onclick="window.adminOpenComplaint('${escapeHtml(r.id)}')" type="button">
                      Triage
                    </button>
                  </div>
                </div>
              `).join("")}
            </div>
          `;
        }
      }

      // Render Status Breakdown
      const statusEl = document.getElementById("tower-status-breakdown");
      if (statusEl) {
        const cStatus = metrics.complaints_by_status || {};
        const total = metrics.total_complaints || 1;
        statusEl.innerHTML = `
          <div style="display: flex; flex-direction: column; gap: 10px;">
            ${[
              { key: 'OPEN', label: 'Open (Pending Triage)', count: cStatus.OPEN || 0, color: 'var(--primary)' },
              { key: 'ASSIGNED', label: 'Assigned to Staff', count: cStatus.ASSIGNED || 0, color: 'var(--info)' },
              { key: 'IN_PROGRESS', label: 'In Progress (Active Work)', count: cStatus.IN_PROGRESS || 0, color: 'var(--warning)' },
              { key: 'RESOLVED', label: 'Resolved (Awaiting Student Close)', count: cStatus.RESOLVED || 0, color: 'var(--success)' },
              { key: 'COMPLETED', label: 'Completed & Closed', count: (cStatus.COMPLETED || 0) + (cStatus.CLOSED || 0), color: '#10B981' }
            ].map(row => {
              const pct = Math.round((row.count / total) * 100);
              return `
                <div>
                  <div style="display: flex; justify-content: space-between; font-size: 12px; margin-bottom: 4px;">
                    <span style="font-weight: 600; color: var(--text);">${row.label}</span>
                    <span style="font-weight: 700; color: var(--text);">${row.count} (${pct}%)</span>
                  </div>
                  <div class="progress-bar-wrap" style="height: 6px;">
                    <div class="progress-bar-fill" style="width: ${pct}%; background-color: ${row.color};"></div>
                  </div>
                </div>
              `;
            }).join("")}
          </div>
        `;
      }

      // Render Staff Workload
      const workloadEl = document.getElementById("tower-workload-container");
      if (workloadEl) {
        const staffWorkload = metrics.staff_workload || {};
        const staffEntries = Object.entries(staffWorkload);
        if (staffEntries.length === 0) {
          workloadEl.innerHTML = `
            <div style="font-size: 12px; color: var(--text-muted); text-align: center; padding: 12px;">
              No maintenance tickets currently assigned to active staff.
            </div>
          `;
        } else {
          workloadEl.innerHTML = `
            <div style="display: flex; flex-direction: column; gap: 8px;">
              ${staffEntries.map(([staffId, count]) => `
                <div style="display: flex; justify-content: space-between; align-items: center; padding: 8px 12px; background: var(--surface-hover); border-radius: var(--radius-sm); border: 1px solid var(--border);">
                  <div>
                    <div style="font-size: 13px; font-weight: 700; color: var(--text);">${escapeHtml(getStaffNameById(staffId))}</div>
                    <div style="font-size: 11px; color: var(--text-muted);">Estate Maintenance Unit</div>
                  </div>
                  <span class="status-badge info" style="font-weight: 700;">${count} active ticket(s)</span>
                </div>
              `).join("")}
            </div>
          `;
        }
      }

      // Render Audit Preview
      const auditEl = document.getElementById("tower-audit-preview");
      if (auditEl) {
        if (audits.length === 0) {
          auditEl.innerHTML = `<div style="font-size: 12px; color: var(--text-muted); padding: 12px;">No recent audit records.</div>`;
        } else {
          auditEl.innerHTML = `
            <div style="display: flex; flex-direction: column; gap: 6px;">
              ${audits.map(a => `
                <div style="font-size: 12px; padding: 8px 10px; background: var(--surface-hover); border-radius: var(--radius-sm); border-left: 3px solid #8B5CF6;">
                  <div style="display: flex; justify-content: space-between; align-items: center;">
                    ${formatAuditActionBadge(a.action)}
                    <span style="font-size: 10px; color: var(--text-muted);">${timeAgo(a.timestamp)}</span>
                  </div>
                  <div style="font-size: 11px; color: var(--text-secondary); margin-top: 4px;">
                    Entity: <code>${escapeHtml(a.entity_type)}</code> (${escapeHtml(a.entity_id.substring(0, 8))}...)
                  </div>
                </div>
              `).join("")}
            </div>
          `;
        }
      }

    } catch (err) {
      console.error("Control tower load error:", err);
      showToast("Unable to refresh Control Tower telemetry: " + err.message, "error");
    }
  };

  loadControlTowerData();
}


/* ==========================================================================
   2. ADMIN — SLA BREACHES VIEW
   GET /api/v1/admin/control-tower/sla-breaches
   ========================================================================== */
export async function renderAdminSlaBreaches(mainEl) {
  if (!mainEl) return;

  mainEl.innerHTML = `
    <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 12px; margin-bottom: 20px;">
      <div>
        <div style="font-size: 12px; font-weight: 800; color: var(--error); text-transform: uppercase;">
          Statutory SLA Compliance Monitor
        </div>
        <h2 style="margin: 2px 0 0 0; font-size: 22px; font-weight: 800; color: var(--text);">
          ⏱️ Active SLA Breaches
        </h2>
        <p style="margin: 2px 0 0 0; font-size: 13px; color: var(--text-secondary);">
          Authoritative list of open complaints that have exceeded statutory campus resolution deadlines.
        </p>
      </div>

      <button class="btn btn-outline" id="btn-refresh-sla" type="button" style="min-height: 44px;">
        ↻ Refresh Breaches
      </button>
    </div>

    <!-- Breaches Table Container -->
    <div id="sla-breaches-container">
      <div class="state-container"><div class="spinner"></div></div>
    </div>

    <!-- Modal Root Container -->
    <div id="admin-modal-root"></div>
  `;

  document.getElementById("btn-refresh-sla")?.addEventListener("click", () => loadBreaches());

  const loadBreaches = async () => {
    const container = document.getElementById("sla-breaches-container");
    if (!container) return;

    container.innerHTML = `<div class="state-container"><div class="spinner"></div></div>`;

    try {
      const breaches = await api.get("/api/v1/admin/control-tower/sla-breaches");
      if (breaches.length === 0) {
        container.innerHTML = `
          <div class="card">
            <div class="state-container" style="padding: 40px 20px;">
              <div class="state-icon" style="color: var(--success); font-size: 36px;">✓</div>
              <div class="state-title" style="color: var(--success);">Zero Active SLA Breaches</div>
              <div class="state-desc">All registered complaints are being addressed within standard operational deadlines.</div>
            </div>
          </div>
        `;
        return;
      }

      container.innerHTML = `
        <div class="table-container">
          <table class="data-table">
            <thead>
              <tr>
                <th>Ticket ID</th>
                <th>Title & Category</th>
                <th>Location Details</th>
                <th>Priority</th>
                <th>Status</th>
                <th>Assigned Staff</th>
                <th>SLA Deadline</th>
                <th style="text-align: right;">Action</th>
              </tr>
            </thead>
            <tbody>
              ${breaches.map(b => `
                <tr style="background: rgba(239, 68, 68, 0.03);">
                  <td><code style="font-weight: 700; color: var(--text);">${escapeHtml(b.ticket_number)}</code></td>
                  <td>
                    <strong>${escapeHtml(b.title)}</strong><br/>
                    <span style="font-size: 11px; color: var(--text-muted); text-transform: uppercase;">${escapeHtml(b.category_id)}</span>
                  </td>
                  <td>${escapeHtml(b.location_details)}</td>
                  <td>${formatPriorityBadge(b.priority)}</td>
                  <td>${formatComplaintStatusBadge(b.status)}</td>
                  <td>${b.assigned_staff_id ? escapeHtml(getStaffNameById(b.assigned_staff_id)) : '<span style="color: var(--error); font-weight: 700;">Unassigned</span>'}</td>
                  <td>${formatSlaStatusBadge(b.sla_deadline)}</td>
                  <td style="text-align: right;">
                    <button class="btn btn-sm btn-primary" onclick="window.adminOpenComplaint('${escapeHtml(b.id)}')" type="button">
                      Triage / Assign
                    </button>
                  </td>
                </tr>
              `).join("")}
            </tbody>
          </table>
        </div>
      `;
    } catch (err) {
      container.innerHTML = `
        <div class="card">
          <div class="state-container" style="color: var(--error);">
            <div class="state-icon">⚠️</div>
            <div class="state-title">Unable to Load SLA Breaches</div>
            <div class="state-desc">${escapeHtml(err.message)}</div>
            <button class="btn btn-outline" onclick="window.renderAdminSlaBreaches(document.getElementById('app-main-content'))" type="button" style="margin-top: 12px;">
              Retry
            </button>
          </div>
        </div>
      `;
    }
  };

  loadBreaches();
}


/* ==========================================================================
   3. ADMIN — RECURRING COMPLAINTS VIEW
   GET /api/v1/admin/control-tower/recurring-complaints
   ========================================================================== */
export async function renderAdminRecurringComplaints(mainEl) {
  if (!mainEl) return;

  mainEl.innerHTML = `
    <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 12px; margin-bottom: 20px;">
      <div>
        <div style="font-size: 12px; font-weight: 800; color: var(--warning); text-transform: uppercase;">
          Infrastructure Hotspot Detection
        </div>
        <h2 style="margin: 2px 0 0 0; font-size: 22px; font-weight: 800; color: var(--text);">
          🔁 Recurring Complaints & Hotspots
        </h2>
        <p style="margin: 2px 0 0 0; font-size: 13px; color: var(--text-secondary);">
          Authoritative backend recurring issue visibility flagged by repeated complaints in identical campus zones.
        </p>
      </div>

      <button class="btn btn-outline" id="btn-refresh-recurring" type="button" style="min-height: 44px;">
        ↻ Refresh Hotspots
      </button>
    </div>

    <!-- Hotspots Table Container -->
    <div id="recurring-hotspots-container">
      <div class="state-container"><div class="spinner"></div></div>
    </div>

    <!-- Modal Root Container -->
    <div id="admin-modal-root"></div>
  `;

  document.getElementById("btn-refresh-recurring")?.addEventListener("click", () => loadRecurring());

  const loadRecurring = async () => {
    const container = document.getElementById("recurring-hotspots-container");
    if (!container) return;

    container.innerHTML = `<div class="state-container"><div class="spinner"></div></div>`;

    try {
      const hotspots = await api.get("/api/v1/admin/control-tower/recurring-complaints");
      if (hotspots.length === 0) {
        container.innerHTML = `
          <div class="card">
            <div class="state-container" style="padding: 40px 20px;">
              <div class="state-icon" style="color: var(--success); font-size: 36px;">✓</div>
              <div class="state-title">No Recurring Hotspots Flagged</div>
              <div class="state-desc">No repeated complaints meet the backend heuristic threshold for recurring infrastructure failure.</div>
            </div>
          </div>
        `;
        return;
      }

      container.innerHTML = `
        <div class="table-container">
          <table class="data-table">
            <thead>
              <tr>
                <th>Ticket ID</th>
                <th>Hotspot Location</th>
                <th>Category</th>
                <th>Title & Description</th>
                <th>Status</th>
                <th>Assigned Staff</th>
                <th>Reported At</th>
                <th style="text-align: right;">Action</th>
              </tr>
            </thead>
            <tbody>
              ${hotspots.map(h => `
                <tr>
                  <td>
                    <code style="font-weight: 700; color: var(--text);">${escapeHtml(h.ticket_number)}</code><br/>
                    <span class="status-badge warning" style="font-size: 9px; margin-top: 2px;">🔁 RECURRING</span>
                  </td>
                  <td><strong>${escapeHtml(h.location_details)}</strong><br/><span style="font-size: 11px; color: var(--text-muted);">${escapeHtml(h.location_type)}</span></td>
                  <td><span style="font-size: 12px; font-weight: 600; text-transform: uppercase;">${escapeHtml(h.category_id)}</span></td>
                  <td style="max-width: 240px;">
                    <strong>${escapeHtml(h.title)}</strong>
                    <div style="font-size: 11px; color: var(--text-secondary); margin-top: 2px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">
                      ${escapeHtml(h.description)}
                    </div>
                  </td>
                  <td>${formatComplaintStatusBadge(h.status)}</td>
                  <td>${h.assigned_staff_id ? escapeHtml(getStaffNameById(h.assigned_staff_id)) : '<span style="color: var(--text-muted);">Unassigned</span>'}</td>
                  <td style="font-size: 11px; color: var(--text-muted);">${formatDate(h.created_at)}</td>
                  <td style="text-align: right;">
                    <button class="btn btn-sm btn-outline" onclick="window.adminOpenComplaint('${escapeHtml(h.id)}')" type="button">
                      Triage
                    </button>
                  </td>
                </tr>
              `).join("")}
            </tbody>
          </table>
        </div>
      `;
    } catch (err) {
      container.innerHTML = `
        <div class="card">
          <div class="state-container" style="color: var(--error);">
            <div class="state-icon">⚠️</div>
            <div class="state-title">Unable to Load Recurring Hotspots</div>
            <div class="state-desc">${escapeHtml(err.message)}</div>
          </div>
        </div>
      `;
    }
  };

  loadRecurring();
}


/* ==========================================================================
   4. ADMIN — COMPLAINT OPERATIONS & ASSIGNMENT
   GET /api/v1/complaints, PATCH /assign, PATCH /status
   ========================================================================== */
export async function renderAdminComplaints(mainEl) {
  if (!mainEl) return;

  mainEl.innerHTML = `
    <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 12px; margin-bottom: 20px;">
      <div>
        <div style="font-size: 12px; font-weight: 800; color: var(--primary); text-transform: uppercase;">
          Campus Maintenance Operations
        </div>
        <h2 style="margin: 2px 0 0 0; font-size: 22px; font-weight: 800; color: var(--text);">
          🛠️ Complaint Operations & Dispatch
        </h2>
        <p style="margin: 2px 0 0 0; font-size: 13px; color: var(--text-secondary);">
          Review, assign maintenance supervisors, update operational states, and enforce resolution SLAs.
        </p>
      </div>

      <button class="btn btn-outline" id="btn-refresh-complaints" type="button" style="min-height: 44px;">
        ↻ Refresh Complaints
      </button>
    </div>

    <!-- Filter Tabs -->
    <div class="filter-tab-bar" id="admin-complaints-filter-bar">
      <button class="filter-tab active" data-filter="ALL" type="button">All Tickets</button>
      <button class="filter-tab" data-filter="OPEN" type="button">Open</button>
      <button class="filter-tab" data-filter="ASSIGNED" type="button">Assigned</button>
      <button class="filter-tab" data-filter="IN_PROGRESS" type="button">In Progress</button>
      <button class="filter-tab" data-filter="RESOLVED" type="button">Resolved</button>
      <button class="filter-tab" data-filter="COMPLETED" type="button">Completed</button>
      <button class="filter-tab" data-filter="REOPENED" type="button">Reopened</button>
    </div>

    <!-- Complaints Container -->
    <div id="admin-complaints-list-container" style="margin-top: 16px;">
      <div class="state-container"><div class="spinner"></div></div>
    </div>

    <!-- Modal Root Container -->
    <div id="admin-modal-root"></div>
  `;

  document.getElementById("btn-refresh-complaints")?.addEventListener("click", () => loadComplaints());

  let cachedComplaints = [];

  const loadComplaints = async (filter = "ALL") => {
    const container = document.getElementById("admin-complaints-list-container");
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
    const container = document.getElementById("admin-complaints-list-container");
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
      <div class="table-container">
        <table class="data-table">
          <thead>
            <tr>
              <th>Ticket ID</th>
              <th>Category & Title</th>
              <th>Location</th>
              <th>Priority</th>
              <th>Status</th>
              <th>Assigned Supervisor</th>
              <th>SLA Status</th>
              <th>Created</th>
              <th style="text-align: right;">Action</th>
            </tr>
          </thead>
          <tbody>
            ${displayList.map(c => `
              <tr>
                <td><code style="font-weight: 700; color: var(--text);">${escapeHtml(c.ticket_number)}</code></td>
                <td style="max-width: 200px;">
                  <strong>${escapeHtml(c.title)}</strong><br/>
                  <span style="font-size: 11px; color: var(--text-muted); text-transform: uppercase;">${escapeHtml(c.category_id)}</span>
                </td>
                <td>${escapeHtml(c.location_details)}</td>
                <td>${formatPriorityBadge(c.priority)}</td>
                <td>${formatComplaintStatusBadge(c.status)}</td>
                <td>${c.assigned_staff_id ? escapeHtml(getStaffNameById(c.assigned_staff_id)) : '<span style="color: var(--text-muted);">Unassigned</span>'}</td>
                <td>${formatSlaStatusBadge(c.sla_deadline)}</td>
                <td style="font-size: 11px; color: var(--text-muted);">${formatDate(c.created_at)}</td>
                <td style="text-align: right;">
                  <button class="btn btn-sm btn-outline" onclick="window.adminOpenComplaint('${escapeHtml(c.id)}')" type="button">
                    Manage
                  </button>
                </td>
              </tr>
            `).join("")}
          </tbody>
        </table>
      </div>
    `;
  };

  // Filter tabs listeners
  document.querySelectorAll("#admin-complaints-filter-bar .filter-tab").forEach(tab => {
    tab.addEventListener("click", (e) => {
      document.querySelectorAll("#admin-complaints-filter-bar .filter-tab").forEach(t => t.classList.remove("active"));
      e.target.classList.add("active");
      const filter = e.target.getAttribute("data-filter");
      renderComplaintsList(cachedComplaints, filter);
    });
  });

  loadComplaints();
}

// Global modal opener for complaint details & assignment
window.adminOpenComplaint = async (id) => {
  const modalRoot = document.getElementById("admin-modal-root");
  if (!modalRoot) return;

  modalRoot.innerHTML = `<div class="modal-backdrop active"><div class="modal-dialog" style="padding: 40px; text-align: center;"><div class="spinner"></div></div></div>`;

  try {
    const c = await api.get(`/api/v1/complaints/${id}`);

    modalRoot.innerHTML = `
      <div class="modal-backdrop active" id="modal-complaint-backdrop">
        <div class="modal-dialog" style="max-width: 650px;" role="dialog" aria-modal="true" aria-labelledby="modal-cmp-title">
          <div class="modal-header">
            <div>
              <span style="font-size: 11px; font-weight: 700; color: var(--text-muted); text-transform: uppercase;">Ticket Record</span>
              <h3 id="modal-cmp-title" style="margin: 2px 0 0 0; font-size: 18px; font-weight: 800;">
                ${escapeHtml(c.ticket_number)} &bull; ${escapeHtml(c.title)}
              </h3>
            </div>
            <button class="btn-icon" id="btn-close-cmp-modal" aria-label="Close" type="button">✕</button>
          </div>

          <div style="padding: 20px;">
            <!-- Status & Meta Bar -->
            <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 8px; margin-bottom: 16px; background: var(--surface-hover); padding: 12px; border-radius: var(--radius-sm); border: 1px solid var(--border);">
              <div style="display: flex; gap: 8px; align-items: center;">
                ${formatComplaintStatusBadge(c.status)}
                ${formatPriorityBadge(c.priority)}
                ${c.is_recurring ? '<span class="status-badge warning" style="font-size: 10px;">🔁 Recurring Hotspot</span>' : ''}
              </div>
              <div>
                ${formatSlaStatusBadge(c.sla_deadline)}
              </div>
            </div>

            <!-- Description & Location -->
            <div style="margin-bottom: 16px;">
              <div style="font-size: 11px; font-weight: 700; color: var(--text-muted); text-transform: uppercase;">Description</div>
              <div style="font-size: 13px; color: var(--text); margin-top: 4px; line-height: 1.5;">${escapeHtml(c.description)}</div>
            </div>

            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 20px; font-size: 12px;">
              <div>
                <strong style="color: var(--text-muted); font-size: 11px; text-transform: uppercase;">Location Details</strong><br/>
                <span>📍 ${escapeHtml(c.location_details)} (${escapeHtml(c.location_type)})</span>
              </div>
              <div>
                <strong style="color: var(--text-muted); font-size: 11px; text-transform: uppercase;">Category</strong><br/>
                <span style="text-transform: uppercase; font-weight: 600;">${escapeHtml(c.category_id)}</span>
              </div>
              <div>
                <strong style="color: var(--text-muted); font-size: 11px; text-transform: uppercase;">Current Assignment</strong><br/>
                <span>${c.assigned_staff_id ? escapeHtml(getStaffNameById(c.assigned_staff_id)) : '<span style="color: var(--error); font-weight: 700;">Unassigned</span>'}</span>
              </div>
              <div>
                <strong style="color: var(--text-muted); font-size: 11px; text-transform: uppercase;">Reported On</strong><br/>
                <span>${formatDate(c.created_at)}</span>
              </div>
            </div>

            <!-- Administrative Actions Section -->
            <div style="border-top: 1px solid var(--border); padding-top: 16px; margin-top: 16px;">
              <div style="font-size: 12px; font-weight: 700; color: var(--text); margin-bottom: 12px;">
                Administrative Actions (Backend RBAC Authorized)
              </div>

              <!-- Action 1: Assign Staff -->
              <div style="display: flex; gap: 10px; margin-bottom: 12px; align-items: flex-end;">
                <div style="flex: 1;">
                  <label class="form-label" for="sel-assign-staff" style="font-size: 11px;">Assign Maintenance Supervisor</label>
                  <select class="form-input" id="sel-assign-staff">
                    <option value="">-- Choose Institutional Staff --</option>
                    ${INSTITUTIONAL_STAFF.map(st => `
                      <option value="${st.id}" ${c.assigned_staff_id === st.id ? 'selected' : ''}>
                        ${escapeHtml(st.name)} — ${escapeHtml(st.title)} (${escapeHtml(st.dept)})
                      </option>
                    `).join("")}
                  </select>
                </div>
                <button class="btn btn-primary" id="btn-submit-assign" type="button" style="min-height: 38px;">
                  Assign
                </button>
              </div>

              <!-- Action 2: Update Status -->
              <div style="display: flex; gap: 10px; align-items: flex-end;">
                <div style="flex: 1;">
                  <label class="form-label" for="sel-update-status" style="font-size: 11px;">Transition Status</label>
                  <select class="form-input" id="sel-update-status">
                    <option value="OPEN" ${c.status === 'OPEN' ? 'selected' : ''}>OPEN</option>
                    <option value="ASSIGNED" ${c.status === 'ASSIGNED' ? 'selected' : ''}>ASSIGNED</option>
                    <option value="IN_PROGRESS" ${c.status === 'IN_PROGRESS' ? 'selected' : ''}>IN_PROGRESS</option>
                    <option value="RESOLVED" ${c.status === 'RESOLVED' ? 'selected' : ''}>RESOLVED</option>
                    <option value="COMPLETED" ${c.status === 'COMPLETED' ? 'selected' : ''}>COMPLETED</option>
                    <option value="REOPENED" ${c.status === 'REOPENED' ? 'selected' : ''}>REOPENED</option>
                  </select>
                </div>
                <button class="btn btn-secondary" id="btn-submit-status-upd" type="button" style="min-height: 38px;">
                  Update Status
                </button>
              </div>
            </div>

            <div style="display: flex; justify-content: flex-end; margin-top: 20px;">
              <button class="btn btn-secondary" id="btn-close-cmp-modal-bottom" type="button">
                Close
              </button>
            </div>
          </div>
        </div>
      </div>
    `;

    const closeModal = () => { modalRoot.innerHTML = ""; };
    document.getElementById("btn-close-cmp-modal")?.addEventListener("click", closeModal);
    document.getElementById("btn-close-cmp-modal-bottom")?.addEventListener("click", closeModal);

    // Assign Staff Action
    document.getElementById("btn-submit-assign")?.addEventListener("click", async () => {
      const staffId = document.getElementById("sel-assign-staff")?.value;
      if (!staffId) {
        showToast("Please choose a staff member to assign", "warning");
        return;
      }
      try {
        await api.patch(`/api/v1/complaints/${c.id}/assign`, {
          assigned_staff_id: staffId
        });
        showToast("Complaint assigned successfully!", "success");
        closeModal();
        const main = document.getElementById("app-main-content");
        if (main) {
          if (window.location.hash === "#sla-breaches") renderAdminSlaBreaches(main);
          else if (window.location.hash === "#recurring-issues") renderAdminRecurringComplaints(main);
          else renderAdminComplaints(main);
        }
      } catch (err) {
        showToast(err.message || "Failed to assign complaint", "error");
      }
    });

    // Update Status Action
    document.getElementById("btn-submit-status-upd")?.addEventListener("click", async () => {
      const newStatus = document.getElementById("sel-update-status")?.value;
      try {
        await api.patch(`/api/v1/complaints/${c.id}/status`, {
          status: newStatus,
          resolution_notes: `Status updated to ${newStatus} by Campus Admin.`
        });
        showToast(`Complaint status transitioned to ${newStatus}`, "success");
        closeModal();
        const main = document.getElementById("app-main-content");
        if (main) {
          if (window.location.hash === "#sla-breaches") renderAdminSlaBreaches(main);
          else if (window.location.hash === "#recurring-issues") renderAdminRecurringComplaints(main);
          else renderAdminComplaints(main);
        }
      } catch (err) {
        showToast(err.message || "Failed to update complaint status", "error");
      }
    });

  } catch (err) {
    showToast(err.message || "Unable to retrieve complaint record", "error");
    modalRoot.innerHTML = "";
  }
};


/* ==========================================================================
   5. ADMIN — TARGETED COMMUNICATIONS & ANNOUNCEMENTS
   GET /api/v1/class-notices, POST /api/v1/class-notices
   ========================================================================== */
export async function renderAdminAnnouncements(mainEl) {
  if (!mainEl) return;

  mainEl.innerHTML = `
    <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 12px; margin-bottom: 20px;">
      <div>
        <div style="font-size: 12px; font-weight: 800; color: var(--primary); text-transform: uppercase;">
          Campus-Wide & Cohort Communications
        </div>
        <h2 style="margin: 2px 0 0 0; font-size: 22px; font-weight: 800; color: var(--text);">
          📢 Targeted Communications & Announcements
        </h2>
        <p style="margin: 2px 0 0 0; font-size: 13px; color: var(--text-secondary);">
          Broadcast official notices targeted by department, academic batch, semester, and section cohorts.
        </p>
      </div>

      <div>
        <button class="btn btn-primary" id="btn-create-announcement" type="button" style="min-height: 44px;">
          ➕ Broadcast New Announcement
        </button>
      </div>
    </div>

    <!-- Announcements Feed Container -->
    <div id="admin-announcements-container">
      <div class="state-container"><div class="spinner"></div></div>
    </div>

    <!-- Modal Root Container -->
    <div id="admin-modal-root"></div>
  `;

  document.getElementById("btn-create-announcement")?.addEventListener("click", () => {
    openCreateAnnouncementModal(() => loadAnnouncements());
  });

  const loadAnnouncements = async () => {
    const container = document.getElementById("admin-announcements-container");
    if (!container) return;

    container.innerHTML = `<div class="state-container"><div class="spinner"></div></div>`;

    try {
      const notices = await api.get("/api/v1/class-notices");
      loadNoticeBoard(); // Synchronize pinned header banner

      if (notices.length === 0) {
        container.innerHTML = `
          <div class="card">
            <div class="state-container" style="padding: 40px 20px;">
              <div class="state-icon">📢</div>
              <div class="state-title">No announcements broadcast yet</div>
              <div class="state-desc">Click "Broadcast New Announcement" to notify campus cohorts.</div>
            </div>
          </div>
        `;
        return;
      }

      container.innerHTML = `
        <div style="display: flex; flex-direction: column; gap: 12px;">
          ${notices.map(n => `
            <div class="card" style="padding: 16px;">
              <div style="display: flex; justify-content: space-between; align-items: flex-start; flex-wrap: wrap; gap: 8px;">
                <div>
                  <div style="font-size: 16px; font-weight: 800; color: var(--text);">${escapeHtml(n.subject)}</div>
                  <div style="font-size: 12px; color: var(--text-secondary); margin-top: 2px;">
                    🎓 Target Cohort: <strong>${escapeHtml(n.target_branch)}</strong> &bull; Year ${n.target_year} (Sem ${n.target_semester}, Sec ${escapeHtml(n.target_section)})
                  </div>
                </div>
                <div>
                  <span class="status-badge info" style="font-weight: 700;">${escapeHtml(n.notice_type)}</span>
                </div>
              </div>

              <div style="font-size: 13px; color: var(--text); margin: 12px 0; background: var(--surface-hover); padding: 12px; border-radius: var(--radius-sm); border: 1px solid var(--border);">
                ${escapeHtml(n.details)}
              </div>

              <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 8px; font-size: 12px; color: var(--text-muted); border-top: 1px solid var(--border); padding-top: 10px;">
                <div style="display: flex; gap: 12px; flex-wrap: wrap;">
                  <span>📅 Effective Date: <strong>${formatDate(n.class_date)}</strong></span>
                  <span>⏰ Period: <strong>${escapeHtml(n.period)}</strong></span>
                </div>
                <div>
                  Broadcast: ${timeAgo(n.created_at)}
                </div>
              </div>
            </div>
          `).join("")}
        </div>
      `;
    } catch (err) {
      container.innerHTML = `
        <div class="card">
          <div class="state-container" style="color: var(--error);">
            <div class="state-icon">⚠️</div>
            <div class="state-title">Unable to Load Announcements</div>
            <div class="state-desc">${escapeHtml(err.message)}</div>
          </div>
        </div>
      `;
    }
  };

  loadAnnouncements();
}

// Modal: Create Announcement with Target Audience Visibility
function openCreateAnnouncementModal(onCreated) {
  const modalRoot = document.getElementById("admin-modal-root");
  if (!modalRoot) return;

  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const tomorrowIso = tomorrow.toISOString().slice(0, 16);

  modalRoot.innerHTML = `
    <div class="modal-backdrop active" id="modal-announcement-backdrop">
      <div class="modal-dialog" style="max-width: 620px;" role="dialog" aria-modal="true" aria-labelledby="modal-ann-title">
        <div class="modal-header">
          <h3 id="modal-ann-title" style="margin: 0; font-size: 18px; font-weight: 800;">
            📢 Broadcast Targeted Campus Announcement
          </h3>
          <button class="btn-icon" id="btn-close-ann-modal" aria-label="Close" type="button">✕</button>
        </div>
        <form id="form-create-announcement" style="padding: 20px;">
          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 16px;">
            <div class="form-group">
              <label class="form-label" for="ann-type">Notice Category *</label>
              <select class="form-input" id="ann-type" required>
                <option value="RESCHEDULED">RESCHEDULED — Schedule Modification</option>
                <option value="CANCELLED">CANCELLED — Class / Event Cancellation</option>
                <option value="ROOM_CHANGED">ROOM_CHANGED — Venue / Classroom Relocation</option>
                <option value="SWITCHED">SWITCHED — Slot / Session Exchange</option>
                <option value="POSTPONED">POSTPONED — Postponed to Future Date</option>
                <option value="FACULTY_CHANGED">FACULTY_CHANGED — Academic Substitution</option>
              </select>
            </div>
            <div class="form-group">
              <label class="form-label" for="ann-subject">Subject / Title *</label>
              <input class="form-input" id="ann-subject" type="text" required placeholder="e.g. End-Semester Examination Schedule Briefing" value="End-Semester Schedule Briefing">
            </div>
          </div>

          <div style="display: grid; grid-template-columns: 2fr 1fr 1fr 1fr; gap: 10px; margin-bottom: 16px;">
            <div class="form-group">
              <label class="form-label" for="ann-branch">Target Branch *</label>
              <input class="form-input" id="ann-branch" type="text" required value="Computer Science & Engineering">
            </div>
            <div class="form-group">
              <label class="form-label" for="ann-year">Year *</label>
              <input class="form-input" id="ann-year" type="number" required min="2018" max="2030" value="2022">
            </div>
            <div class="form-group">
              <label class="form-label" for="ann-sem">Sem *</label>
              <input class="form-input" id="ann-sem" type="number" required min="1" max="8" value="6">
            </div>
            <div class="form-group">
              <label class="form-label" for="ann-sec">Sec *</label>
              <input class="form-input" id="ann-sec" type="text" required maxlength="5" value="A">
            </div>
          </div>

          <!-- Audience Targeting Transparency Box -->
          <div style="background: var(--surface-hover); border: 1px solid var(--border); border-radius: var(--radius-sm); padding: 12px; margin-bottom: 16px;" id="ann-audience-preview">
            <div style="font-size: 11px; font-weight: 700; color: var(--text-muted); text-transform: uppercase;">
              🎯 Who Will Receive This Notice:
            </div>
            <div id="audience-text" style="font-size: 13px; font-weight: 600; color: var(--text); margin-top: 4px;">
              Students enrolled in <strong>Computer Science & Engineering</strong>, Batch <strong>2022</strong> (Semester 6, Section A).
            </div>
          </div>

          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 16px;">
            <div class="form-group">
              <label class="form-label" for="ann-date">Effective Date & Time *</label>
              <input class="form-input" id="ann-date" type="datetime-local" required value="${tomorrowIso}">
            </div>
            <div class="form-group">
              <label class="form-label" for="ann-period">Period / Time Slot *</label>
              <input class="form-input" id="ann-period" type="text" required placeholder="e.g. 10:00 AM - 11:00 AM" value="10:00 AM - 11:00 AM">
            </div>
          </div>

          <div class="form-group" style="margin-bottom: 20px;">
            <label class="form-label" for="ann-details">Notice Details & Directive *</label>
            <textarea class="form-input" id="ann-details" rows="3" required placeholder="Enter administrative instructions, venue guidelines, and student expectations.">Administrative advisory regarding upcoming semester review session.</textarea>
          </div>

          <div style="display: flex; justify-content: flex-end; gap: 10px;">
            <button class="btn btn-secondary" id="btn-cancel-ann" type="button" style="min-height: 44px;">
              Cancel
            </button>
            <button class="btn btn-primary" id="btn-submit-ann" type="submit" style="min-height: 44px;">
              🚀 Broadcast Announcement
            </button>
          </div>
        </form>
      </div>
    </div>
  `;

  const closeModal = () => { modalRoot.innerHTML = ""; };
  document.getElementById("btn-close-ann-modal")?.addEventListener("click", closeModal);
  document.getElementById("btn-cancel-ann")?.addEventListener("click", closeModal);

  // Dynamic audience preview update
  const updateAudience = () => {
    const branch = document.getElementById("ann-branch")?.value.trim() || 'Selected Department';
    const year = document.getElementById("ann-year")?.value || 'All';
    const sem = document.getElementById("ann-sem")?.value || 'All';
    const sec = document.getElementById("ann-sec")?.value || 'All';
    const audEl = document.getElementById("audience-text");
    if (audEl) {
      audEl.innerHTML = `Students enrolled in <strong>${escapeHtml(branch)}</strong>, Batch <strong>${escapeHtml(year)}</strong> (Semester ${escapeHtml(sem)}, Section ${escapeHtml(sec)}).`;
    }
  };

  ['ann-branch', 'ann-year', 'ann-sem', 'ann-sec'].forEach(id => {
    document.getElementById(id)?.addEventListener("input", updateAudience);
  });

  document.getElementById("form-create-announcement")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const btn = document.getElementById("btn-submit-ann");
    if (btn) {
      btn.disabled = true;
      btn.innerHTML = `<span class="spinner" style="width: 14px; height: 14px; border-width: 2px;"></span> Broadcasting...`;
    }

    const payload = {
      notice_type: document.getElementById("ann-type")?.value,
      subject: document.getElementById("ann-subject")?.value.trim(),
      target_branch: document.getElementById("ann-branch")?.value.trim(),
      target_year: parseInt(document.getElementById("ann-year")?.value, 10),
      target_semester: parseInt(document.getElementById("ann-sem")?.value, 10),
      target_section: document.getElementById("ann-sec")?.value.trim().toUpperCase(),
      class_date: new Date(document.getElementById("ann-date")?.value).toISOString(),
      period: document.getElementById("ann-period")?.value.trim(),
      details: document.getElementById("ann-details")?.value.trim()
    };

    try {
      await api.post("/api/v1/class-notices", payload);
      showToast("Announcement broadcast successfully to target cohort!", "success");
      closeModal();
      if (onCreated) onCreated();
    } catch (err) {
      console.error("Announcement broadcasting error:", err);
      showToast(err.message || "Failed to broadcast announcement", "error");
      if (btn) {
        btn.disabled = false;
        btn.innerHTML = `🚀 Broadcast Announcement`;
      }
    }
  });
}


/* ==========================================================================
   6. ADMIN — AUDIT LOGS (PS07 COMPLIANCE LEDGER)
   GET /api/v1/admin/audit-logs
   ========================================================================== */
export async function renderAdminAuditLogs(mainEl) {
  if (!mainEl) return;

  mainEl.innerHTML = `
    <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 12px; margin-bottom: 20px;">
      <div>
        <div style="font-size: 12px; font-weight: 800; color: #8B5CF6; text-transform: uppercase;">
          PS07 Regulatory Compliance & Security Ledger
        </div>
        <h2 style="margin: 2px 0 0 0; font-size: 22px; font-weight: 800; color: var(--text);">
          🛡️ Append-Only System Audit Trail
        </h2>
        <p style="margin: 2px 0 0 0; font-size: 13px; color: var(--text-secondary);">
          Cryptographically sequenced, immutable chronological record of all state mutations across campus operations.
        </p>
      </div>

      <button class="btn btn-outline" id="btn-refresh-audit" type="button" style="min-height: 44px;">
        ↻ Refresh Audit Trail
      </button>
    </div>

    <!-- Filters & Search -->
    <div style="display: flex; gap: 12px; flex-wrap: wrap; margin-bottom: 16px; background: var(--surface-hover); padding: 12px; border-radius: var(--radius-sm); border: 1px solid var(--border);">
      <div style="flex: 1; min-width: 180px;">
        <label class="form-label" for="filter-entity-type" style="font-size: 11px;">Filter by Entity Type</label>
        <select class="form-input" id="filter-entity-type" style="height: 38px;">
          <option value="">All Entities</option>
          <option value="COMPLAINT">COMPLAINT</option>
          <option value="GATE_PASS">GATE_PASS</option>
          <option value="ATTENDANCE_SESSION">ATTENDANCE_SESSION</option>
          <option value="LAB_REQUISITION">LAB_REQUISITION</option>
          <option value="LAB_EQUIPMENT">LAB_EQUIPMENT</option>
          <option value="DOCUMENT_REQUEST">DOCUMENT_REQUEST</option>
          <option value="STUDY_MATERIAL">STUDY_MATERIAL</option>
        </select>
      </div>

      <div style="flex: 1; min-width: 180px;">
        <label class="form-label" for="filter-action" style="font-size: 11px;">Filter by Action Event</label>
        <input class="form-input" id="filter-action" type="text" placeholder="e.g. APPROVED, REJECTED..." style="height: 38px;">
      </div>

      <div style="display: flex; align-items: flex-end;">
        <button class="btn btn-primary" id="btn-apply-audit-filter" type="button" style="min-height: 38px;">
          Filter Logs
        </button>
      </div>
    </div>

    <!-- Audit Log Table Container -->
    <div id="audit-logs-container">
      <div class="state-container"><div class="spinner"></div></div>
    </div>

    <!-- Modal Root Container -->
    <div id="admin-modal-root"></div>
  `;

  document.getElementById("btn-refresh-audit")?.addEventListener("click", () => loadAuditLogs());
  document.getElementById("btn-apply-audit-filter")?.addEventListener("click", () => loadAuditLogs());

  let cachedAuditLogs = [];

  const loadAuditLogs = async () => {
    const container = document.getElementById("audit-logs-container");
    if (!container) return;

    container.innerHTML = `<div class="state-container"><div class="spinner"></div></div>`;

    const entityType = document.getElementById("filter-entity-type")?.value || "";
    const action = document.getElementById("filter-action")?.value.trim() || "";

    let query = "/api/v1/admin/audit-logs?limit=50";
    if (entityType) query += `&entity_type=${encodeURIComponent(entityType)}`;
    if (action) query += `&action=${encodeURIComponent(action)}`;

    try {
      cachedAuditLogs = await api.get(query);
      if (cachedAuditLogs.length === 0) {
        container.innerHTML = `
          <div class="card">
            <div class="state-container" style="padding: 40px 20px;">
              <div class="state-icon">🛡️</div>
              <div class="state-title">No audit records match criteria</div>
              <div class="state-desc">Try clearing or broadening your filters.</div>
            </div>
          </div>
        `;
        return;
      }

      container.innerHTML = `
        <div class="table-container">
          <table class="data-table">
            <thead>
              <tr>
                <th>Timestamp</th>
                <th>Action Event</th>
                <th>Entity Type</th>
                <th>Entity Reference ID</th>
                <th>Actor Reference</th>
                <th>State Delta</th>
                <th style="text-align: right;">Inspect</th>
              </tr>
            </thead>
            <tbody>
              ${cachedAuditLogs.map(log => `
                <tr>
                  <td style="font-size: 11px; color: var(--text-muted); white-space: nowrap;">
                    ${formatDate(log.timestamp)}<br/>
                    <span>${timeAgo(log.timestamp)}</span>
                  </td>
                  <td>${formatAuditActionBadge(log.action)}</td>
                  <td><code style="font-weight: 700;">${escapeHtml(log.entity_type)}</code></td>
                  <td><code style="font-size: 11px;">${escapeHtml(log.entity_id.substring(0, 13))}...</code></td>
                  <td style="font-size: 11px;">
                    ${log.actor_id ? `<code>${escapeHtml(log.actor_id.substring(0, 8))}...</code>` : '<span style="color: var(--text-muted);">System</span>'}
                  </td>
                  <td style="max-width: 220px; font-size: 11px; color: var(--text-secondary); overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">
                    ${log.new_state ? JSON.stringify(log.new_state) : (log.previous_state ? 'State updated' : 'Initial event')}
                  </td>
                  <td style="text-align: right;">
                    <button class="btn btn-sm btn-outline" onclick="window.inspectAuditMetadata('${escapeHtml(log.id)}')" type="button">
                      🔍 Details
                    </button>
                  </td>
                </tr>
              `).join("")}
            </tbody>
          </table>
        </div>
      `;
    } catch (err) {
      container.innerHTML = `
        <div class="card">
          <div class="state-container" style="color: var(--error);">
            <div class="state-icon">⚠️</div>
            <div class="state-title">Unable to Load Audit Trail</div>
            <div class="state-desc">${escapeHtml(err.message)}</div>
          </div>
        </div>
      `;
    }
  };

  window.inspectAuditMetadata = (logId) => {
    const log = cachedAuditLogs.find(l => l.id === logId);
    if (!log) return;

    const modalRoot = document.getElementById("admin-modal-root");
    if (!modalRoot) return;

    modalRoot.innerHTML = `
      <div class="modal-backdrop active" id="modal-audit-backdrop">
        <div class="modal-dialog" style="max-width: 600px;" role="dialog" aria-modal="true" aria-labelledby="modal-audit-title">
          <div class="modal-header">
            <div>
              <span style="font-size: 11px; font-weight: 700; color: #8B5CF6; text-transform: uppercase;">Audit Event Record</span>
              <h3 id="modal-audit-title" style="margin: 2px 0 0 0; font-size: 18px; font-weight: 800;">
                ${escapeHtml(log.action)}
              </h3>
            </div>
            <button class="btn-icon" id="btn-close-audit-modal" aria-label="Close" type="button">✕</button>
          </div>

          <div style="padding: 20px;">
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 16px; font-size: 12px; background: var(--surface-hover); padding: 12px; border-radius: var(--radius-sm); border: 1px solid var(--border);">
              <div>
                <strong style="color: var(--text-muted); font-size: 10px; text-transform: uppercase;">Entity Type</strong><br/>
                <code>${escapeHtml(log.entity_type)}</code>
              </div>
              <div>
                <strong style="color: var(--text-muted); font-size: 10px; text-transform: uppercase;">Entity UUID</strong><br/>
                <code>${escapeHtml(log.entity_id)}</code>
              </div>
              <div>
                <strong style="color: var(--text-muted); font-size: 10px; text-transform: uppercase;">Actor UUID</strong><br/>
                <code>${escapeHtml(log.actor_id || 'System Daemon')}</code>
              </div>
              <div>
                <strong style="color: var(--text-muted); font-size: 10px; text-transform: uppercase;">Timestamp</strong><br/>
                <span>${formatDate(log.timestamp)}</span>
              </div>
            </div>

            <!-- Previous State -->
            <div style="margin-bottom: 14px;">
              <div style="font-size: 11px; font-weight: 700; color: var(--text-muted); text-transform: uppercase; margin-bottom: 4px;">
                Previous State:
              </div>
              <pre style="background: var(--surface); border: 1px solid var(--border); padding: 10px; border-radius: var(--radius-sm); font-family: var(--font-family-mono); font-size: 11px; overflow-x: auto; max-height: 120px;">${escapeHtml(JSON.stringify(log.previous_state, null, 2) || "None")}</pre>
            </div>

            <!-- New State -->
            <div style="margin-bottom: 20px;">
              <div style="font-size: 11px; font-weight: 700; color: var(--text-muted); text-transform: uppercase; margin-bottom: 4px;">
                New State Mutation:
              </div>
              <pre style="background: var(--surface); border: 1px solid var(--border); padding: 10px; border-radius: var(--radius-sm); font-family: var(--font-family-mono); font-size: 11px; overflow-x: auto; max-height: 160px;">${escapeHtml(JSON.stringify(log.new_state, null, 2) || "None")}</pre>
            </div>

            <div style="display: flex; justify-content: flex-end;">
              <button class="btn btn-secondary" id="btn-close-audit-modal-btn" type="button">
                Close
              </button>
            </div>
          </div>
        </div>
      </div>
    `;

    const closeModal = () => { modalRoot.innerHTML = ""; };
    document.getElementById("btn-close-audit-modal")?.addEventListener("click", closeModal);
    document.getElementById("btn-close-audit-modal-btn")?.addEventListener("click", closeModal);
  };

  loadAuditLogs();
}


/* ==========================================================================
   7. ADMIN NOTIFICATIONS & PROFILE
   ========================================================================== */
export async function renderAdminNotifications(mainEl) {
  if (!mainEl) return;

  mainEl.innerHTML = `
    <div style="margin-bottom: 20px;">
      <div style="font-size: 12px; font-weight: 800; color: var(--primary); text-transform: uppercase;">
        Administrative Transactional Alerts
      </div>
      <h2 style="margin: 2px 0 0 0; font-size: 22px; font-weight: 800; color: var(--text);">
        🔔 Campus Admin Notifications
      </h2>
      <p style="margin: 2px 0 0 0; font-size: 13px; color: var(--text-secondary);">
        Authoritative alerts on SLA deadlines, gate-pass escalations, and cross-departmental operations.
      </p>
    </div>

    <div id="admin-notifs-container">
      <div class="state-container"><div class="spinner"></div></div>
    </div>
  `;

  try {
    const data = await api.get("/api/v1/notifications");
    const container = document.getElementById("admin-notifs-container");
    if (!container) return;

    const notifs = data.notifications || [];

    if (notifs.length === 0) {
      container.innerHTML = `
        <div class="card">
          <div class="state-container" style="padding: 40px 20px;">
            <div class="state-icon">🔔</div>
            <div class="state-title">No administrative notifications</div>
            <div class="state-desc">You are all caught up with institutional alerts.</div>
          </div>
        </div>
      `;
      return;
    }

    container.innerHTML = `
      <div style="display: flex; flex-direction: column; gap: 10px;">
        ${notifs.map(n => `
          <div class="card" style="padding: 16px; ${!n.is_read ? 'background: var(--surface-hover); border-left: 4px solid var(--primary);' : ''}">
            <div style="display: flex; justify-content: space-between; align-items: flex-start; gap: 12px;">
              <div>
                <div style="font-size: 14px; font-weight: 700; color: var(--text);">${escapeHtml(n.title)}</div>
                <div style="font-size: 13px; color: var(--text-secondary); margin: 4px 0;">${escapeHtml(n.message)}</div>
                <div style="font-size: 11px; color: var(--text-muted);">${timeAgo(n.created_at)}</div>
              </div>
              <div>
                ${!n.is_read ? `
                  <button class="btn btn-sm btn-outline" onclick="window.markAdminNotifRead('${escapeHtml(n.id)}')" type="button">
                    Mark Read
                  </button>
                ` : `
                  <span class="status-badge approved" style="font-size: 10px;">✓ Read</span>
                `}
              </div>
            </div>
          </div>
        `).join("")}
      </div>
    `;
  } catch (err) {
    document.getElementById("admin-notifs-container")?.replaceChildren(
      document.createTextNode(`Unable to load notifications: ${err.message}`)
    );
  }
}

window.markAdminNotifRead = async function(id) {
  try {
    await api.patch(`/api/v1/notifications/${id}/read`);
    showToast("Notification marked as read", "success");
    const main = document.getElementById("app-main-content");
    if (main && window.location.hash === "#notifications") {
      renderAdminNotifications(main);
    }
  } catch (err) {
    showToast(err.message || "Failed to mark read", "error");
  }
};

export async function renderAdminProfile(mainEl, user) {
  if (!mainEl) return;

  mainEl.innerHTML = `
    <div style="margin-bottom: 20px;">
      <div style="font-size: 12px; font-weight: 800; color: var(--primary); text-transform: uppercase;">
        Authoritative Institutional Identity
      </div>
      <h2 style="margin: 2px 0 0 0; font-size: 22px; font-weight: 800; color: var(--text);">
        👤 Campus Administrator Profile
      </h2>
      <p style="margin: 2px 0 0 0; font-size: 13px; color: var(--text-secondary);">
        Executive administrative authority registered in BPUT campus directory.
      </p>
    </div>

    <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 16px;">
      <div class="card" style="padding: 20px;">
        <div class="card-header" style="padding: 0 0 12px 0;">
          <div class="card-title">Executive Identity</div>
          <span class="status-badge approved">✓ Active Campus Admin</span>
        </div>

        <div style="display: flex; align-items: center; gap: 16px; margin: 12px 0 16px 0;">
          <div class="account-avatar" style="width: 54px; height: 54px; font-size: 20px; font-weight: 800; background: var(--primary); color: #fff; border-radius: var(--radius-full); display: flex; align-items: center; justify-content: center;">
            ${(user.first_name || 'A')[0]}${(user.last_name || '')[0] || ''}
          </div>
          <div>
            <div style="font-size: 16px; font-weight: 800; color: var(--text);">${escapeHtml(user.first_name)} ${escapeHtml(user.last_name)}</div>
            <div style="font-size: 12px; color: var(--text-secondary); margin-top: 2px;">
              <span class="status-badge info">Dean of Campus Administration</span>
            </div>
          </div>
        </div>

        <div style="font-size: 13px; display: flex; flex-direction: column; gap: 12px; border-top: 1px solid var(--border); padding-top: 16px;">
          <div>
            <strong style="color: var(--text-muted); font-size: 11px; text-transform: uppercase;">Institutional Email</strong><br/>
            <span>${escapeHtml(user.email)}</span>
          </div>
          <div>
            <strong style="color: var(--text-muted); font-size: 11px; text-transform: uppercase;">Contact Number</strong><br/>
            <span>${escapeHtml(user.phone_number || 'N/A')}</span>
          </div>
          <div>
            <strong style="color: var(--text-muted); font-size: 11px; text-transform: uppercase;">Role System Code</strong><br/>
            <span style="font-family: var(--font-family-mono); font-size: 12px;">${escapeHtml(user.role)}</span>
          </div>
          <div>
            <strong style="color: var(--text-muted); font-size: 11px; text-transform: uppercase;">Registered Member Since</strong><br/>
            <span>${formatDate(user.created_at)}</span>
          </div>
        </div>
      </div>

      <div class="card" style="padding: 20px;">
        <div class="card-header" style="padding: 0 0 12px 0;">
          <div class="card-title">Governance Scope & System Privileges</div>
          <span class="status-badge approved">● Full Operational Scope</span>
        </div>

        <div style="font-size: 13px; display: flex; flex-direction: column; gap: 12px; margin-top: 8px;">
          <div>
            <strong style="color: var(--text-muted); font-size: 11px; text-transform: uppercase;">Control Tower Access</strong><br/>
            <span class="status-badge approved" style="font-size: 11px;">✓ High-Level Operational Telemetry Enabled</span>
          </div>
          <div>
            <strong style="color: var(--text-muted); font-size: 11px; text-transform: uppercase;">SLA Breach & Hotspot Surveillance</strong><br/>
            <span class="status-badge approved" style="font-size: 11px;">✓ Authoritative Oversight & Staff Dispatch Enabled</span>
          </div>
          <div>
            <strong style="color: var(--text-muted); font-size: 11px; text-transform: uppercase;">Regulatory Audit Trail</strong><br/>
            <span class="status-badge approved" style="font-size: 11px;">✓ Immutable Append-Only Ledger Inspection Enabled</span>
          </div>
          <div>
            <strong style="color: var(--text-muted); font-size: 11px; text-transform: uppercase;">Broadcast Authority</strong><br/>
            <span class="status-badge approved" style="font-size: 11px;">✓ Campus-Wide & Cohort Communications Enabled</span>
          </div>
          <div>
            <strong style="color: var(--text-muted); font-size: 11px; text-transform: uppercase;">Architecture Security Baseline</strong><br/>
            <span>BPUT Hackathon 2026 &bull; Strict Role-Based Boundary</span>
          </div>
        </div>
      </div>
    </div>
  `;
}
