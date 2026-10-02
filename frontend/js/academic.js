/**
 * CampusFlow MVP — Academic & Laboratory Operations Module
 * Phase 10: Teacher / Academic Staff + Lab / Workshop Assistant Experience
 * 
 * Implements authoritative workflows for:
 * 1. TEACHER:
 *    - Academic Dashboard with Live Telemetry
 *    - Digital Attendance Sessions & Roll-Call Roster
 *    - Student Attendance Verification & Inspection
 *    - Class Management (Cancellations, Switches, Reschedules, Room Changes, Faculty Changes)
 *    - Class Notices Publication & Filtering
 *    - Study Materials Repository & Cohort Targeting
 *    - Institutional Profile & Notifications
 * 
 * 2. LAB_ASSISTANT:
 *    - Laboratory & Workshop Dashboard
 *    - Equipment Inventory Roster & Maintenance Logging
 *    - Procurement Requisitions State Machine:
 *      DRAFT -> SUBMITTED -> UNDER_REVIEW -> APPROVED/REJECTED -> ORDERED -> COMPLETED
 *    - Line Items Management & Rejection Reason Transparency
 *    - Workshop Notices, Notifications & Institutional Profile
 */

import { api } from "./api.js";
import { showToast, loadNoticeBoard } from "./ui.js";
import { escapeHtml, formatDate, timeAgo, formatRole } from "./utils.js";

/* --------------------------------------------------------------------------
   SHARED FORMATTERS & STATE HELPERS
   -------------------------------------------------------------------------- */

const ACTIVE_SESSIONS_STORAGE_KEY = "campusflow_teacher_active_sessions";

function getStoredSessions() {
  try {
    const raw = localStorage.getItem(ACTIVE_SESSIONS_STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function storeSession(session) {
  try {
    const sessions = getStoredSessions();
    const filtered = sessions.filter(s => s.id !== session.id);
    filtered.unshift(session);
    localStorage.setItem(ACTIVE_SESSIONS_STORAGE_KEY, JSON.stringify(filtered.slice(0, 20)));
  } catch (err) {
    console.warn("Failed to store attendance session in localStorage:", err);
  }
}

export function formatNoticeBadge(type) {
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
    case "FACULTY_CHANGED":
      return `<span class="status-badge info">👤 Faculty Changed</span>`;
    default:
      return `<span class="status-badge info">ℹ ${escapeHtml(type || 'Notice')}</span>`;
  }
}

export function formatEquipmentStatusBadge(status) {
  switch (status) {
    case "FUNCTIONAL":
      return `<span class="status-badge approved">✓ Functional</span>`;
    case "NEEDS_REPAIR":
      return `<span class="status-badge warning">⚠ Needs Repair</span>`;
    case "NON_FUNCTIONAL":
      return `<span class="status-badge rejected">✕ Non-Functional</span>`;
    default:
      return `<span class="status-badge info">${escapeHtml(status || 'Unknown')}</span>`;
  }
}

export function formatRequisitionStatusBadge(status) {
  switch (status) {
    case "DRAFT":
      return `<span class="status-badge" style="background: var(--surface-hover); color: var(--text-secondary); border: 1px solid var(--border);">📝 Draft</span>`;
    case "SUBMITTED":
      return `<span class="status-badge pending">◷ Submitted</span>`;
    case "UNDER_REVIEW":
      return `<span class="status-badge info">🔍 Under Review</span>`;
    case "APPROVED":
      return `<span class="status-badge approved">✓ Approved</span>`;
    case "REJECTED":
      return `<span class="status-badge rejected">✕ Rejected</span>`;
    case "ORDERED":
      return `<span class="status-badge info">📦 Ordered</span>`;
    case "COMPLETED":
      return `<span class="status-badge approved">✓ Completed</span>`;
    default:
      return `<span class="status-badge info">${escapeHtml(status || 'Unknown')}</span>`;
  }
}

// Known sample roster for quick roll call demo
const DEMO_STUDENT_ROSTER = [
  { id: "b84a4d69-d4a7-48e8-a9fa-987d7c38b0da", name: "Priya Sharma", roll: "2201042", branch: "Computer Science & Engineering", batch: 2022, sec: "A" },
  { id: "24ade993-73be-43ab-bb8a-7c9b92731807", name: "Sanjay Soren", roll: "2201019", branch: "Computer Science & Engineering", batch: 2022, sec: "B" },
  { id: "318beb45-4a69-4be2-ad60-f4587efe9bc5", name: "Rahul Verma", roll: "2301088", branch: "Mechanical Engineering", batch: 2023, sec: "A" }
];


/* ==========================================================================
   ==========================================================================
   ROLE 1: TEACHER / ACADEMIC STAFF EXPERIENCE
   ==========================================================================
   ========================================================================== */

/* --------------------------------------------------------------------------
   1. TEACHER DASHBOARD
   -------------------------------------------------------------------------- */
export async function renderTeacherDashboard(mainEl, user) {
  if (!mainEl) return;

  mainEl.innerHTML = `
    <!-- Top Greeting Banner -->
    <div style="display: flex; justify-content: space-between; align-items: flex-start; flex-wrap: wrap; gap: 16px; margin-bottom: 24px;">
      <div>
        <div style="font-size: 13px; font-weight: 700; color: var(--primary); text-transform: uppercase; letter-spacing: 0.5px;">
          Academic Operations Desk
        </div>
        <h2 style="margin: 4px 0 0 0; font-size: 24px; font-weight: 800; color: var(--text);">
          Welcome back, Prof. ${escapeHtml(user.last_name || user.first_name)} 🎓
        </h2>
        <p style="margin: 4px 0 0 0; font-size: 13px; color: var(--text-secondary);">
          Department of Computer Science & Engineering &bull; Lecture & Cohort Management
        </p>
      </div>

      <div style="display: flex; gap: 8px; flex-wrap: wrap;">
        <button class="btn btn-primary" id="btn-dash-new-session" type="button" style="min-height: 44px;">
          📝 Start Attendance Session
        </button>
        <button class="btn btn-secondary" id="btn-dash-new-notice" type="button" style="min-height: 44px;">
          🗓️ Schedule Adjustment
        </button>
      </div>
    </div>

    <!-- Quick Operational KPIs -->
    <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 16px; margin-bottom: 24px;" id="teacher-kpis-grid">
      <div class="card" style="padding: 16px; border-left: 4px solid var(--primary);">
        <div style="font-size: 12px; font-weight: 700; color: var(--text-muted); text-transform: uppercase;">Recent Sessions</div>
        <div id="kpi-sessions-count" style="font-size: 28px; font-weight: 800; color: var(--text); margin-top: 4px;">0</div>
        <div style="font-size: 11px; color: var(--text-secondary); margin-top: 2px;">Conducted & recorded</div>
      </div>

      <div class="card" style="padding: 16px; border-left: 4px solid var(--warning);">
        <div style="font-size: 12px; font-weight: 700; color: var(--text-muted); text-transform: uppercase;">Class Notices</div>
        <div id="kpi-notices-count" style="font-size: 28px; font-weight: 800; color: var(--text); margin-top: 4px;">0</div>
        <div style="font-size: 11px; color: var(--text-secondary); margin-top: 2px;">Timetable adjustments</div>
      </div>

      <div class="card" style="padding: 16px; border-left: 4px solid var(--success);">
        <div style="font-size: 12px; font-weight: 700; color: var(--text-muted); text-transform: uppercase;">Study Materials</div>
        <div id="kpi-materials-count" style="font-size: 28px; font-weight: 800; color: var(--text); margin-top: 4px;">0</div>
        <div style="font-size: 11px; color: var(--text-secondary); margin-top: 2px;">Published to cohorts</div>
      </div>

      <div class="card" style="padding: 16px; border-left: 4px solid var(--info);">
        <div style="font-size: 12px; font-weight: 700; color: var(--text-muted); text-transform: uppercase;">Unread Alerts</div>
        <div id="kpi-notifs-count" style="font-size: 28px; font-weight: 800; color: var(--text); margin-top: 4px;">0</div>
        <div style="font-size: 11px; color: var(--text-secondary); margin-top: 2px;">System & academic alerts</div>
      </div>
    </div>

    <!-- Dual Column Workspace -->
    <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(320px, 1fr)); gap: 20px;">
      <!-- Left Column: Attendance & Study Materials -->
      <div style="display: flex; flex-direction: column; gap: 20px;">
        <!-- Recent Attendance Sessions -->
        <div class="card">
          <div class="card-header" style="display: flex; justify-content: space-between; align-items: center;">
            <div class="card-title">📝 Lecture Attendance Sessions</div>
            <a href="#attendance" class="btn btn-sm btn-outline">Go to Attendance</a>
          </div>
          <div id="dash-sessions-container" style="padding: 16px;">
            <div class="state-container"><div class="spinner"></div></div>
          </div>
        </div>

        <!-- Recently Published Study Materials -->
        <div class="card">
          <div class="card-header" style="display: flex; justify-content: space-between; align-items: center;">
            <div class="card-title">📚 Published Course Materials</div>
            <a href="#materials" class="btn btn-sm btn-outline">View All</a>
          </div>
          <div id="dash-materials-container" style="padding: 16px;">
            <div class="state-container"><div class="spinner"></div></div>
          </div>
        </div>
      </div>

      <!-- Right Column: Class Notices & Activity Feed -->
      <div style="display: flex; flex-direction: column; gap: 20px;">
        <!-- Active Timetable Notices -->
        <div class="card">
          <div class="card-header" style="display: flex; justify-content: space-between; align-items: center;">
            <div class="card-title">📢 Recent Timetable Modifications</div>
            <a href="#class-notices" class="btn btn-sm btn-outline">Manage Notices</a>
          </div>
          <div id="dash-notices-container" style="padding: 16px;">
            <div class="state-container"><div class="spinner"></div></div>
          </div>
        </div>

        <!-- Academic Notifications Feed -->
        <div class="card">
          <div class="card-header" style="display: flex; justify-content: space-between; align-items: center;">
            <div class="card-title">🔔 Recent Notifications</div>
            <a href="#notifications" class="btn btn-sm btn-outline">Notification Center</a>
          </div>
          <div id="dash-notifs-container" style="padding: 16px;">
            <div class="state-container"><div class="spinner"></div></div>
          </div>
        </div>
      </div>
    </div>

    <!-- Modals Container -->
    <div id="academic-modal-root"></div>
  `;

  // Attach quick action listeners
  document.getElementById("btn-dash-new-session")?.addEventListener("click", () => {
    window.location.hash = "#attendance";
  });
  document.getElementById("btn-dash-new-notice")?.addEventListener("click", () => {
    openCreateNoticeModal(() => renderTeacherDashboard(mainEl, user));
  });

  // Fetch Live Backend Data in Parallel
  try {
    const [noticesRes, materialsRes, notifsRes] = await Promise.allSettled([
      api.get("/api/v1/class-notices"),
      api.get("/api/v1/materials"),
      api.get("/api/v1/notifications")
    ]);

    const notices = noticesRes.status === "fulfilled" ? (noticesRes.value || []) : [];
    const materials = materialsRes.status === "fulfilled" ? (materialsRes.value || []) : [];
    const notifsData = notifsRes.status === "fulfilled" ? (notifsRes.value || {}) : {};
    const notifs = notifsData.notifications || [];
    const unreadCount = notifsData.unread_count || notifs.filter(n => !n.is_read).length;

    // Load recent stored sessions
    const storedSessions = getStoredSessions();

    // Update KPI counters
    document.getElementById("kpi-sessions-count")?.replaceChildren(document.createTextNode(String(storedSessions.length)));
    document.getElementById("kpi-notices-count")?.replaceChildren(document.createTextNode(String(notices.length)));
    document.getElementById("kpi-materials-count")?.replaceChildren(document.createTextNode(String(materials.length)));
    document.getElementById("kpi-notifs-count")?.replaceChildren(document.createTextNode(String(unreadCount)));

    // Render Recent Sessions
    const sessionsEl = document.getElementById("dash-sessions-container");
    if (sessionsEl) {
      if (storedSessions.length === 0) {
        sessionsEl.innerHTML = `
          <div class="state-container" style="padding: 24px 16px;">
            <div class="state-icon">📝</div>
            <div class="state-title" style="font-size: 13px;">No attendance sessions initiated yet</div>
            <div class="state-desc" style="font-size: 11px;">Create your first roll-call lecture session today.</div>
            <button class="btn btn-sm btn-primary" onclick="window.location.hash='#attendance'" type="button" style="margin-top: 10px;">
              + New Session
            </button>
          </div>
        `;
      } else {
        sessionsEl.innerHTML = `
          <div style="display: flex; flex-direction: column; gap: 8px;">
            ${storedSessions.slice(0, 3).map(s => `
              <div class="card" style="padding: 12px; display: flex; justify-content: space-between; align-items: center; gap: 8px;">
                <div>
                  <div style="font-size: 13px; font-weight: 700; color: var(--text);">${escapeHtml(s.subject)}</div>
                  <div style="font-size: 11px; color: var(--text-secondary); margin-top: 2px;">
                    🎓 ${escapeHtml(s.branch)} &bull; Year ${s.batch_year} (Sec ${escapeHtml(s.section)})
                  </div>
                  <div style="font-size: 10px; color: var(--text-muted); margin-top: 2px;">
                    📅 ${formatDate(s.session_date)}
                  </div>
                </div>
                <div>
                  <button class="btn btn-sm btn-outline" onclick="window.selectAttendanceSession('${escapeHtml(s.id)}')" type="button">
                    View Roster
                  </button>
                </div>
              </div>
            `).join("")}
          </div>
        `;
      }
    }

    // Render Recent Materials
    const materialsEl = document.getElementById("dash-materials-container");
    if (materialsEl) {
      if (materials.length === 0) {
        materialsEl.innerHTML = `
          <div class="state-container" style="padding: 24px 16px;">
            <div class="state-icon">📚</div>
            <div class="state-title" style="font-size: 13px;">No study materials published yet</div>
            <div class="state-desc" style="font-size: 11px;">Upload lecture notes or syllabus modules for students.</div>
          </div>
        `;
      } else {
        materialsEl.innerHTML = `
          <div style="display: flex; flex-direction: column; gap: 8px;">
            ${materials.slice(0, 3).map(m => {
              const target = (m.targets && m.targets[0]) ? m.targets[0] : null;
              return `
                <div class="card" style="padding: 12px; display: flex; justify-content: space-between; align-items: center; gap: 8px;">
                  <div>
                    <div style="font-size: 13px; font-weight: 700; color: var(--text);">${escapeHtml(m.title)}</div>
                    <div style="font-size: 11px; color: var(--text-secondary); margin-top: 2px;">
                      ${target ? `🎓 ${escapeHtml(target.branch)} (Sem ${target.semester}) &bull; ${escapeHtml(target.subject)}` : 'Academic Cohort'}
                    </div>
                    <div style="font-size: 10px; color: var(--text-muted); margin-top: 2px;">
                      📅 ${formatDate(m.created_at)} &bull; ${escapeHtml(m.file_type || 'PDF')}
                    </div>
                  </div>
                  <div>
                    <span class="status-badge approved" style="font-size: 10px;">Published</span>
                  </div>
                </div>
              `;
            }).join("")}
          </div>
        `;
      }
    }

    // Render Recent Notices
    const noticesEl = document.getElementById("dash-notices-container");
    if (noticesEl) {
      if (notices.length === 0) {
        noticesEl.innerHTML = `
          <div class="state-container" style="padding: 24px 16px;">
            <div class="state-icon">📢</div>
            <div class="state-title" style="font-size: 13px;">No timetable notices</div>
            <div class="state-desc" style="font-size: 11px;">Classes are currently running as per standard schedule.</div>
          </div>
        `;
      } else {
        noticesEl.innerHTML = `
          <div style="display: flex; flex-direction: column; gap: 8px;">
            ${notices.slice(0, 4).map(n => `
              <div class="card" style="padding: 12px;">
                <div style="display: flex; justify-content: space-between; align-items: flex-start; gap: 8px;">
                  <div style="font-size: 13px; font-weight: 700; color: var(--text);">${escapeHtml(n.subject)}</div>
                  ${formatNoticeBadge(n.notice_type)}
                </div>
                <div style="font-size: 12px; color: var(--text-secondary); margin: 4px 0;">${escapeHtml(n.details)}</div>
                <div style="display: flex; gap: 8px; flex-wrap: wrap; font-size: 11px; color: var(--text-muted);">
                  <span>📅 ${formatDate(n.class_date)}</span>
                  <span>⏰ ${escapeHtml(n.period)}</span>
                  <span>🎓 ${escapeHtml(n.target_branch)} (Sec ${escapeHtml(n.target_section)})</span>
                </div>
              </div>
            `).join("")}
          </div>
        `;
      }
    }

    // Render Notifications Feed
    const notifsEl = document.getElementById("dash-notifs-container");
    if (notifsEl) {
      if (notifs.length === 0) {
        notifsEl.innerHTML = `
          <div class="state-container" style="padding: 24px 16px;">
            <div class="state-icon">🔔</div>
            <div class="state-title" style="font-size: 13px;">No new alerts</div>
            <div class="state-desc" style="font-size: 11px;">You are completely up to date.</div>
          </div>
        `;
      } else {
        notifsEl.innerHTML = `
          <div style="display: flex; flex-direction: column; gap: 8px;">
            ${notifs.slice(0, 3).map(n => `
              <div class="card" style="padding: 10px 12px; ${!n.is_read ? 'border-left: 3px solid var(--primary); background: var(--surface-hover);' : ''}">
                <div style="font-size: 12px; font-weight: 700; color: var(--text);">${escapeHtml(n.title)}</div>
                <div style="font-size: 11px; color: var(--text-secondary); margin-top: 2px;">${escapeHtml(n.message)}</div>
                <div style="font-size: 10px; color: var(--text-muted); margin-top: 4px;">${timeAgo(n.created_at)}</div>
              </div>
            `).join("")}
          </div>
        `;
      }
    }

  } catch (err) {
    console.error("Failed to load Teacher dashboard:", err);
    showToast("Failed to load some dashboard data: " + err.message, "error");
  }
}


/* --------------------------------------------------------------------------
   2. TEACHER DIGITAL ATTENDANCE (PRIMARY WORKFLOW)
   -------------------------------------------------------------------------- */
export async function renderTeacherAttendance(mainEl, preselectedSessionId = null) {
  if (!mainEl) return;

  mainEl.innerHTML = `
    <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 12px; margin-bottom: 20px;">
      <div>
        <div style="font-size: 12px; font-weight: 700; color: var(--primary); text-transform: uppercase;">
          Classroom Roll Call Operations
        </div>
        <h2 style="margin: 2px 0 0 0; font-size: 22px; font-weight: 800; color: var(--text);">
          📝 Digital Lecture Attendance
        </h2>
        <p style="margin: 2px 0 0 0; font-size: 13px; color: var(--text-secondary);">
          Initiate authoritative lecture sessions, mark roll-call presence, and inspect student attendance profiles.
        </p>
      </div>

      <div style="display: flex; gap: 8px; flex-wrap: wrap;">
        <button class="btn btn-primary" id="btn-create-session" type="button" style="min-height: 44px;">
          ➕ New Lecture Session
        </button>
        <button class="btn btn-secondary" id="btn-inspect-student" type="button" style="min-height: 44px;">
          🔍 Inspect Student Summary
        </button>
      </div>
    </div>

    <!-- Active Roll Call Workspace -->
    <div id="attendance-active-workspace" style="margin-bottom: 24px;">
      <!-- Populated dynamically with active session roster or prompt -->
    </div>

    <!-- Previous / Saved Sessions History -->
    <div class="card" style="margin-top: 24px;">
      <div class="card-header" style="display: flex; justify-content: space-between; align-items: center;">
        <div class="card-title">📋 Recent Lecture Sessions History</div>
        <button class="btn btn-sm btn-outline" id="btn-refresh-history" type="button">↻ Refresh</button>
      </div>
      <div id="attendance-history-container" style="padding: 16px;">
        <div class="state-container"><div class="spinner"></div></div>
      </div>
    </div>

    <!-- Modal Root Container -->
    <div id="attendance-modal-root"></div>
  `;

  // Attach buttons
  document.getElementById("btn-create-session")?.addEventListener("click", () => {
    openCreateSessionModal((newSession) => {
      loadSessionRoster(newSession.id);
    });
  });

  document.getElementById("btn-inspect-student")?.addEventListener("click", () => {
    openStudentAttendanceLookupModal();
  });

  document.getElementById("btn-refresh-history")?.addEventListener("click", () => {
    renderAttendanceHistory();
  });

  // Global helper for opening session from history
  window.selectAttendanceSession = (sessionId) => {
    loadSessionRoster(sessionId);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const renderAttendanceHistory = () => {
    const historyEl = document.getElementById("attendance-history-container");
    if (!historyEl) return;

    const stored = getStoredSessions();
    if (stored.length === 0) {
      historyEl.innerHTML = `
        <div class="state-container" style="padding: 30px 16px;">
          <div class="state-icon">📋</div>
          <div class="state-title" style="font-size: 14px;">No lecture sessions conducted in this browser session</div>
          <div class="state-desc" style="font-size: 12px;">Click "New Lecture Session" above to begin your first roll-call.</div>
        </div>
      `;
      return;
    }

    historyEl.innerHTML = `
      <div class="table-container">
        <table class="data-table">
          <thead>
            <tr>
              <th>Subject</th>
              <th>Target Cohort</th>
              <th>Session Date</th>
              <th>Status</th>
              <th style="text-align: right;">Actions</th>
            </tr>
          </thead>
          <tbody>
            ${stored.map(s => `
              <tr>
                <td><strong>${escapeHtml(s.subject)}</strong></td>
                <td>${escapeHtml(s.branch)} &bull; ${s.batch_year} (Sec ${escapeHtml(s.section)})</td>
                <td>${formatDate(s.session_date)}</td>
                <td>
                  ${s.is_recorded 
                    ? `<span class="status-badge approved">✓ Records Saved (${s.records_count || 0})</span>` 
                    : `<span class="status-badge pending">◷ Pending Roll-Call</span>`}
                </td>
                <td style="text-align: right;">
                  <button class="btn btn-sm btn-outline" onclick="window.selectAttendanceSession('${escapeHtml(s.id)}')" type="button">
                    ${s.is_recorded ? 'View Records' : 'Mark Attendance'}
                  </button>
                </td>
              </tr>
            `).join("")}
          </tbody>
        </table>
      </div>
    `;
  };

  // Helper to load and render roster for a session
  const loadSessionRoster = async (sessionId) => {
    const workspace = document.getElementById("attendance-active-workspace");
    if (!workspace) return;

    workspace.innerHTML = `<div class="card" style="padding: 40px;"><div class="state-container"><div class="spinner"></div><div class="state-title" style="margin-top: 10px;">Loading Session Details from Backend...</div></div></div>`;

    try {
      const session = await api.get(`/api/v1/attendance/sessions/${sessionId}`);
      const isAlreadyRecorded = session.records && session.records.length > 0;

      // Update in storage
      storeSession({
        id: session.id,
        subject: session.subject,
        branch: session.branch,
        batch_year: session.batch_year,
        section: session.section,
        session_date: session.session_date,
        is_recorded: isAlreadyRecorded,
        records_count: session.records ? session.records.length : 0
      });

      renderAttendanceHistory();

      // Filter cohort roster to match session if applicable, or fallback to all demo students
      let cohortRoster = DEMO_STUDENT_ROSTER.filter(st => 
        st.branch.toLowerCase().includes(session.branch.toLowerCase()) || 
        st.sec === session.section
      );
      if (cohortRoster.length === 0) {
        cohortRoster = DEMO_STUDENT_ROSTER;
      }

      // Map recorded status if exists
      const recordedMap = {};
      if (session.records) {
        session.records.forEach(r => {
          recordedMap[r.student_id] = r.status;
        });
      }

      workspace.innerHTML = `
        <div class="card" style="border-top: 4px solid var(--primary); padding: 20px;">
          <!-- Session Header Info -->
          <div style="display: flex; justify-content: space-between; align-items: flex-start; flex-wrap: wrap; gap: 12px; margin-bottom: 20px; border-bottom: 1px solid var(--border); padding-bottom: 16px;">
            <div>
              <span class="status-badge info" style="margin-bottom: 6px; display: inline-block;">
                Session ID: ${escapeHtml(session.id.substring(0, 8))}...
              </span>
              <h3 style="margin: 0; font-size: 20px; font-weight: 800; color: var(--text);">
                ${escapeHtml(session.subject)}
              </h3>
              <div style="font-size: 13px; color: var(--text-secondary); margin-top: 4px;">
                🎓 <strong>${escapeHtml(session.branch)}</strong> &bull; Batch ${session.batch_year} &bull; Section <strong>${escapeHtml(session.section)}</strong>
              </div>
              <div style="font-size: 12px; color: var(--text-muted); margin-top: 2px;">
                📅 Lecture Date: <strong>${formatDate(session.session_date)}</strong>
              </div>
            </div>

            <div style="text-align: right;">
              ${isAlreadyRecorded ? `
                <div class="status-badge approved" style="font-size: 12px; padding: 6px 12px;">
                  ✓ Confirmed on Backend (${session.records.length} records)
                </div>
                <div style="font-size: 11px; color: var(--text-muted); margin-top: 4px;">
                  Attendance locked and stored in authoritative ledger.
                </div>
              ` : `
                <div class="status-badge pending" style="font-size: 12px; padding: 6px 12px;">
                  ◷ Live Roll-Call In Progress
                </div>
                <div style="display: flex; gap: 8px; margin-top: 8px;">
                  <button class="btn btn-sm btn-outline" id="btn-mark-all-present" type="button">
                    ✓ Mark All Present
                  </button>
                  <button class="btn btn-sm btn-outline" id="btn-mark-all-absent" type="button">
                    ✕ Mark All Absent
                  </button>
                </div>
              `}
            </div>
          </div>

          <!-- Student Roll Call Roster Table -->
          <div class="table-container">
            <table class="data-table" id="roster-table">
              <thead>
                <tr>
                  <th style="width: 120px;">Roll No</th>
                  <th>Student Name</th>
                  <th>Target Cohort</th>
                  <th style="width: 280px; text-align: center;">Attendance State</th>
                </tr>
              </thead>
              <tbody>
                ${cohortRoster.map(student => {
                  const existingStatus = recordedMap[student.id];
                  return `
                    <tr data-student-id="${escapeHtml(student.id)}">
                      <td><span style="font-family: var(--font-family-mono); font-weight: 700;">${escapeHtml(student.roll)}</span></td>
                      <td>
                        <strong>${escapeHtml(student.name)}</strong>
                      </td>
                      <td>
                        <span style="font-size: 12px; color: var(--text-secondary);">${escapeHtml(student.branch)} (${escapeHtml(student.sec)})</span>
                      </td>
                      <td style="text-align: center;">
                        ${isAlreadyRecorded ? `
                          ${existingStatus === 'PRESENT' ? '<span class="status-badge approved" style="font-size: 11px;">✓ PRESENT</span>' :
                            existingStatus === 'LATE' ? '<span class="status-badge warning" style="font-size: 11px;">◷ LATE</span>' :
                            '<span class="status-badge rejected" style="font-size: 11px;">✕ ABSENT</span>'}
                        ` : `
                          <div class="attendance-btn-group" role="radiogroup" style="display: inline-flex; border: 1px solid var(--border); border-radius: var(--radius-md); overflow: hidden;">
                            <label class="attendance-radio-lbl ${existingStatus === 'PRESENT' || !existingStatus ? 'selected-present' : ''}" style="cursor: pointer; padding: 6px 12px; font-size: 12px; font-weight: 700; min-height: 44px; display: inline-flex; align-items: center; gap: 4px;">
                              <input type="radio" name="att_${student.id}" value="PRESENT" ${existingStatus === 'PRESENT' || !existingStatus ? 'checked' : ''} style="margin: 0;">
                              <span>Present</span>
                            </label>
                            <label class="attendance-radio-lbl ${existingStatus === 'LATE' ? 'selected-late' : ''}" style="cursor: pointer; padding: 6px 12px; font-size: 12px; font-weight: 700; min-height: 44px; display: inline-flex; align-items: center; gap: 4px; border-left: 1px solid var(--border); border-right: 1px solid var(--border);">
                              <input type="radio" name="att_${student.id}" value="LATE" ${existingStatus === 'LATE' ? 'checked' : ''} style="margin: 0;">
                              <span>Late</span>
                            </label>
                            <label class="attendance-radio-lbl ${existingStatus === 'ABSENT' ? 'selected-absent' : ''}" style="cursor: pointer; padding: 6px 12px; font-size: 12px; font-weight: 700; min-height: 44px; display: inline-flex; align-items: center; gap: 4px;">
                              <input type="radio" name="att_${student.id}" value="ABSENT" ${existingStatus === 'ABSENT' ? 'checked' : ''} style="margin: 0;">
                              <span>Absent</span>
                            </label>
                          </div>
                        `}
                      </td>
                    </tr>
                  `;
                }).join("")}
              </tbody>
            </table>
          </div>

          <!-- Bottom Submission Controls -->
          ${!isAlreadyRecorded ? `
            <div style="margin-top: 20px; display: flex; justify-content: flex-end; gap: 12px; border-top: 1px solid var(--border); padding-top: 16px;">
              <button class="btn btn-secondary" onclick="window.location.hash='#dashboard'" type="button" style="min-height: 44px;">
                Cancel
              </button>
              <button class="btn btn-primary" id="btn-submit-attendance-records" type="button" style="min-height: 44px; padding: 0 24px;">
                💾 Save Authoritative Records
              </button>
            </div>
          ` : `
            <div style="margin-top: 20px; display: flex; justify-content: space-between; align-items: center; border-top: 1px solid var(--border); padding-top: 16px;">
              <div style="font-size: 12px; color: var(--text-muted);">
                Records locked in database. Duplicates will be rejected by backend constraints.
              </div>
              <button class="btn btn-outline" onclick="window.selectAttendanceSession('')" type="button">
                Close Active Roster
              </button>
            </div>
          `}
        </div>
      `;

      // Attach radio and batch actions if not recorded yet
      if (!isAlreadyRecorded) {
        document.getElementById("btn-mark-all-present")?.addEventListener("click", () => {
          workspace.querySelectorAll("tbody tr").forEach(row => {
            const radio = row.querySelector('input[value="PRESENT"]');
            if (radio) {
              radio.checked = true;
              updateRadioLabels(row);
            }
          });
          showToast("Marked all students as Present", "info");
        });

        document.getElementById("btn-mark-all-absent")?.addEventListener("click", () => {
          workspace.querySelectorAll("tbody tr").forEach(row => {
            const radio = row.querySelector('input[value="ABSENT"]');
            if (radio) {
              radio.checked = true;
              updateRadioLabels(row);
            }
          });
          showToast("Marked all students as Absent", "info");
        });

        workspace.querySelectorAll('input[type="radio"]').forEach(radio => {
          radio.addEventListener("change", (e) => {
            const row = e.target.closest("tr");
            if (row) updateRadioLabels(row);
          });
        });

        // Submit Records Handler
        document.getElementById("btn-submit-attendance-records")?.addEventListener("click", async () => {
          const rows = workspace.querySelectorAll("tbody tr");
          const payload = [];

          rows.forEach(row => {
            const studentId = row.getAttribute("data-student-id");
            const checkedRadio = row.querySelector('input[type="radio"]:checked');
            if (studentId && checkedRadio) {
              payload.push({
                student_id: studentId,
                status: checkedRadio.value
              });
            }
          });

          if (payload.length === 0) {
            showToast("No student records to save", "error");
            return;
          }

          const btn = document.getElementById("btn-submit-attendance-records");
          if (btn) {
            btn.disabled = true;
            btn.innerHTML = `<span class="spinner" style="width: 14px; height: 14px; border-width: 2px;"></span> Saving...`;
          }

          try {
            const records = await api.post(`/api/v1/attendance/sessions/${session.id}/records`, payload);
            showToast(`Attendance recorded successfully for ${records.length} students!`, "success");
            // Reload from backend confirmation
            await loadSessionRoster(session.id);
          } catch (err) {
            console.error("Attendance submission error:", err);
            showToast(err.message || "Failed to record attendance", "error");
            if (btn) {
              btn.disabled = false;
              btn.innerHTML = `💾 Save Authoritative Records`;
            }
          }
        });
      }

    } catch (err) {
      console.error("Failed to load session roster:", err);
      workspace.innerHTML = `
        <div class="card" style="padding: 24px;">
          <div class="state-container" style="color: var(--error);">
            <div class="state-icon">⚠️</div>
            <div class="state-title">Unable to Load Attendance Session</div>
            <div class="state-desc">${escapeHtml(err.message)}</div>
            <button class="btn btn-outline" onclick="window.selectAttendanceSession('')" type="button" style="margin-top: 12px;">
              Back to Sessions
            </button>
          </div>
        </div>
      `;
    }
  };

  const updateRadioLabels = (row) => {
    row.querySelectorAll(".attendance-radio-lbl").forEach(lbl => {
      const inp = lbl.querySelector("input");
      lbl.classList.remove("selected-present", "selected-late", "selected-absent");
      if (inp && inp.checked) {
        if (inp.value === "PRESENT") lbl.classList.add("selected-present");
        if (inp.value === "LATE") lbl.classList.add("selected-late");
        if (inp.value === "ABSENT") lbl.classList.add("selected-absent");
      }
    });
  };

  // If a session ID was provided or we have stored sessions, open the first
  const stored = getStoredSessions();
  if (preselectedSessionId) {
    loadSessionRoster(preselectedSessionId);
  } else if (stored.length > 0) {
    loadSessionRoster(stored[0].id);
  } else {
    // Show empty active banner with quick creation prompt
    const workspace = document.getElementById("attendance-active-workspace");
    if (workspace) {
      workspace.innerHTML = `
        <div class="card" style="padding: 40px 20px; text-align: center;">
          <div class="state-icon" style="font-size: 40px; margin-bottom: 12px;">📝</div>
          <div style="font-size: 18px; font-weight: 700; color: var(--text);">No Active Lecture Session</div>
          <div style="font-size: 13px; color: var(--text-secondary); max-width: 460px; margin: 6px auto 16px auto;">
            Create an attendance session for your class to open the interactive roll-call roster and record live student attendance.
          </div>
          <button class="btn btn-primary" id="btn-create-first-session" type="button" style="min-height: 44px;">
            ➕ Start Attendance Session Now
          </button>
        </div>
      `;
      document.getElementById("btn-create-first-session")?.addEventListener("click", () => {
        openCreateSessionModal((newSession) => {
          loadSessionRoster(newSession.id);
        });
      });
    }
    renderAttendanceHistory();
  }
}

// Modal: Create Attendance Session
function openCreateSessionModal(onCreated) {
  const modalRoot = document.getElementById("attendance-modal-root") || document.getElementById("academic-modal-root");
  if (!modalRoot) return;

  const nowIso = new Date().toISOString().slice(0, 16);

  modalRoot.innerHTML = `
    <div class="modal-backdrop active" id="modal-session-backdrop">
      <div class="modal-dialog" style="max-width: 520px;" role="dialog" aria-modal="true" aria-labelledby="modal-session-title">
        <div class="modal-header">
          <h3 id="modal-session-title" style="margin: 0; font-size: 18px; font-weight: 800;">
            📝 Start New Lecture Attendance Session
          </h3>
          <button class="btn-icon" id="btn-close-session-modal" aria-label="Close" type="button">✕</button>
        </div>
        <form id="form-create-session" style="padding: 20px;">
          <div class="form-group" style="margin-bottom: 16px;">
            <label class="form-label" for="sess-subject">Subject / Course Name *</label>
            <input class="form-input" id="sess-subject" type="text" required placeholder="e.g. Cloud Computing (CS601)" value="Cloud Computing (CS601)">
          </div>

          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 16px;">
            <div class="form-group">
              <label class="form-label" for="sess-branch">Department / Branch *</label>
              <input class="form-input" id="sess-branch" type="text" required placeholder="e.g. Computer Science & Engineering" value="Computer Science & Engineering">
            </div>
            <div class="form-group">
              <label class="form-label" for="sess-batch">Batch Year *</label>
              <input class="form-input" id="sess-batch" type="number" required min="2018" max="2030" value="2022">
            </div>
          </div>

          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 20px;">
            <div class="form-group">
              <label class="form-label" for="sess-section">Section *</label>
              <input class="form-input" id="sess-section" type="text" required maxlength="5" value="A">
            </div>
            <div class="form-group">
              <label class="form-label" for="sess-date">Session Date & Time</label>
              <input class="form-input" id="sess-date" type="datetime-local" value="${nowIso}">
            </div>
          </div>

          <div style="display: flex; justify-content: flex-end; gap: 10px;">
            <button class="btn btn-secondary" id="btn-cancel-session" type="button" style="min-height: 44px;">
              Cancel
            </button>
            <button class="btn btn-primary" id="btn-submit-session" type="submit" style="min-height: 44px;">
              🚀 Launch Session & Open Roster
            </button>
          </div>
        </form>
      </div>
    </div>
  `;

  const closeModal = () => {
    modalRoot.innerHTML = "";
  };

  document.getElementById("btn-close-session-modal")?.addEventListener("click", closeModal);
  document.getElementById("btn-cancel-session")?.addEventListener("click", closeModal);

  document.getElementById("form-create-session")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const btn = document.getElementById("btn-submit-session");
    if (btn) {
      btn.disabled = true;
      btn.innerHTML = `<span class="spinner" style="width: 14px; height: 14px; border-width: 2px;"></span> Initializing...`;
    }

    const subject = document.getElementById("sess-subject")?.value.trim();
    const branch = document.getElementById("sess-branch")?.value.trim();
    const batchYear = parseInt(document.getElementById("sess-batch")?.value, 10);
    const section = document.getElementById("sess-section")?.value.trim().toUpperCase();
    const dateVal = document.getElementById("sess-date")?.value;

    try {
      const payload = {
        subject,
        branch,
        batch_year: batchYear,
        section,
        session_date: dateVal ? new Date(dateVal).toISOString() : new Date().toISOString()
      };

      const session = await api.post("/api/v1/attendance/sessions", payload);
      storeSession({
        id: session.id,
        subject: session.subject,
        branch: session.branch,
        batch_year: session.batch_year,
        section: session.section,
        session_date: session.session_date,
        is_recorded: false,
        records_count: 0
      });

      showToast("Lecture attendance session launched successfully!", "success");
      closeModal();
      if (onCreated) onCreated(session);
    } catch (err) {
      console.error("Failed to create attendance session:", err);
      showToast(err.message || "Failed to initialize session", "error");
      if (btn) {
        btn.disabled = false;
        btn.innerHTML = `🚀 Launch Session & Open Roster`;
      }
    }
  });
}

// Modal: Student Attendance Lookup Tool
function openStudentAttendanceLookupModal() {
  const modalRoot = document.getElementById("attendance-modal-root") || document.getElementById("academic-modal-root");
  if (!modalRoot) return;

  modalRoot.innerHTML = `
    <div class="modal-backdrop active" id="modal-lookup-backdrop">
      <div class="modal-dialog" style="max-width: 580px;" role="dialog" aria-modal="true" aria-labelledby="modal-lookup-title">
        <div class="modal-header">
          <h3 id="modal-lookup-title" style="margin: 0; font-size: 18px; font-weight: 800;">
            🔍 Inspect Student Attendance Profile
          </h3>
          <button class="btn-icon" id="btn-close-lookup-modal" aria-label="Close" type="button">✕</button>
        </div>
        <div style="padding: 20px;">
          <div class="form-group" style="margin-bottom: 16px;">
            <label class="form-label" for="lookup-student-select">Select Student or Enter Student ID *</label>
            <select class="form-input" id="lookup-student-select" style="margin-bottom: 8px;">
              <option value="">-- Choose from Cohort Roster --</option>
              ${DEMO_STUDENT_ROSTER.map(st => `
                <option value="${st.id}">${escapeHtml(st.name)} &bull; Roll: ${st.roll} (${escapeHtml(st.branch)})</option>
              `).join("")}
            </select>
            <input class="form-input" id="lookup-student-id" type="text" placeholder="Or paste UUID here (e.g. b84a4d69-d4a7-48e8-a9fa-987d7c38b0da)">
          </div>

          <button class="btn btn-primary" id="btn-fetch-student-att" type="button" style="width: 100%; min-height: 44px; margin-bottom: 16px;">
            Retrieve Live Attendance Record
          </button>

          <div id="lookup-result-container">
            <!-- Results populated here -->
          </div>
        </div>
      </div>
    </div>
  `;

  const closeModal = () => {
    modalRoot.innerHTML = "";
  };

  document.getElementById("btn-close-lookup-modal")?.addEventListener("click", closeModal);

  const selectEl = document.getElementById("lookup-student-select");
  const inputEl = document.getElementById("lookup-student-id");

  selectEl?.addEventListener("change", (e) => {
    if (e.target.value) {
      inputEl.value = e.target.value;
    }
  });

  document.getElementById("btn-fetch-student-att")?.addEventListener("click", async () => {
    const studentId = inputEl?.value.trim();
    if (!studentId) {
      showToast("Please select or enter a student ID", "error");
      return;
    }

    const resContainer = document.getElementById("lookup-result-container");
    if (!resContainer) return;

    resContainer.innerHTML = `<div class="state-container"><div class="spinner"></div></div>`;

    try {
      const summary = await api.get(`/api/v1/attendance/student/${studentId}`);
      const pct = summary.attendance_percentage || 0;
      const isShortage = pct < 75.0;

      resContainer.innerHTML = `
        <div class="card" style="padding: 16px; border-left: 4px solid ${isShortage ? 'var(--error)' : 'var(--success)'}; background: var(--surface-hover);">
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px;">
            <div>
              <div style="font-size: 11px; font-weight: 700; color: var(--text-muted); text-transform: uppercase;">
                Verified Attendance Summary
              </div>
              <div style="font-size: 13px; font-weight: 700; color: var(--text);">
                Student ID: ${escapeHtml(studentId.substring(0, 13))}...
              </div>
            </div>
            <div class="status-badge ${isShortage ? 'rejected' : 'approved'}" style="font-size: 12px; font-weight: 800;">
              ${pct}% ${isShortage ? '(Shortage Alert)' : '(Compliant)'}
            </div>
          </div>

          <!-- Metric Cards -->
          <div style="display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; margin-bottom: 12px; text-align: center;">
            <div style="background: var(--surface); padding: 8px; border-radius: var(--radius-sm); border: 1px solid var(--border);">
              <div style="font-size: 10px; color: var(--text-muted);">TOTAL</div>
              <div style="font-size: 18px; font-weight: 800; color: var(--text);">${summary.total_sessions}</div>
            </div>
            <div style="background: var(--surface); padding: 8px; border-radius: var(--radius-sm); border: 1px solid var(--border);">
              <div style="font-size: 10px; color: var(--success);">PRESENT</div>
              <div style="font-size: 18px; font-weight: 800; color: var(--success);">${summary.present_count}</div>
            </div>
            <div style="background: var(--surface); padding: 8px; border-radius: var(--radius-sm); border: 1px solid var(--border);">
              <div style="font-size: 10px; color: var(--warning);">LATE</div>
              <div style="font-size: 18px; font-weight: 800; color: var(--warning);">${summary.late_count}</div>
            </div>
            <div style="background: var(--surface); padding: 8px; border-radius: var(--radius-sm); border: 1px solid var(--border);">
              <div style="font-size: 10px; color: var(--error);">ABSENT</div>
              <div style="font-size: 18px; font-weight: 800; color: var(--error);">${summary.absent_count}</div>
            </div>
          </div>

          <!-- Progress Bar -->
          <div class="progress-bar-wrap" style="height: 10px; margin-bottom: 8px;">
            <div class="progress-bar-fill ${isShortage ? 'danger' : 'success'}" style="width: ${Math.min(100, Math.max(0, pct))}%;"></div>
          </div>
          <div style="font-size: 11px; color: var(--text-muted); text-align: right;">
            BPUT Statutory Minimum Requirement: 75.0%
          </div>
        </div>
      `;
    } catch (err) {
      console.error("Student lookup error:", err);
      resContainer.innerHTML = `
        <div class="card" style="padding: 16px; color: var(--error);">
          <div style="font-weight: 700; font-size: 13px;">Lookup Failed</div>
          <div style="font-size: 12px; margin-top: 4px;">${escapeHtml(err.message)}</div>
        </div>
      `;
    }
  });
}


/* --------------------------------------------------------------------------
   3. TEACHER — CLASS MANAGEMENT & TIMETABLE MODIFICATIONS
   -------------------------------------------------------------------------- */
export async function renderTeacherClassManagement(mainEl) {
  if (!mainEl) return;

  mainEl.innerHTML = `
    <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 12px; margin-bottom: 20px;">
      <div>
        <div style="font-size: 12px; font-weight: 700; color: var(--primary); text-transform: uppercase;">
          Class Scheduling & Cohort Operations
        </div>
        <h2 style="margin: 2px 0 0 0; font-size: 22px; font-weight: 800; color: var(--text);">
          🗓️ Class Management & Timetable Modifications
        </h2>
        <p style="margin: 2px 0 0 0; font-size: 13px; color: var(--text-secondary);">
          Notify cohorts of class cancellations, schedule switches, reschedules, and room or faculty changes.
        </p>
      </div>

      <div>
        <button class="btn btn-primary" id="btn-create-class-notice" type="button" style="min-height: 44px;">
          ➕ New Timetable Modification Notice
        </button>
      </div>
    </div>

    <!-- Filter Bar -->
    <div class="filter-tab-bar" id="notices-filter-bar">
      <button class="filter-tab active" data-filter="ALL" type="button">All Notices</button>
      <button class="filter-tab" data-filter="CANCELLED" type="button">Cancelled</button>
      <button class="filter-tab" data-filter="RESCHEDULED" type="button">Rescheduled</button>
      <button class="filter-tab" data-filter="ROOM_CHANGED" type="button">Room Changed</button>
      <button class="filter-tab" data-filter="SWITCHED" type="button">Switched</button>
      <button class="filter-tab" data-filter="POSTPONED" type="button">Postponed</button>
      <button class="filter-tab" data-filter="FACULTY_CHANGED" type="button">Faculty Changed</button>
    </div>

    <!-- Notices List Container -->
    <div id="class-notices-container" style="margin-top: 16px;">
      <div class="state-container"><div class="spinner"></div></div>
    </div>

    <!-- Modal Root Container -->
    <div id="academic-modal-root"></div>
  `;

  document.getElementById("btn-create-class-notice")?.addEventListener("click", () => {
    openCreateNoticeModal(() => loadNotices());
  });

  let cachedNotices = [];

  const loadNotices = async (filter = "ALL") => {
    const container = document.getElementById("class-notices-container");
    if (!container) return;

    container.innerHTML = `<div class="state-container"><div class="spinner"></div></div>`;

    try {
      cachedNotices = await api.get("/api/v1/class-notices");
      renderNoticesList(cachedNotices, filter);
      loadNoticeBoard(); // refresh global banner
    } catch (err) {
      container.innerHTML = `
        <div class="card">
          <div class="state-container" style="color: var(--error);">
            <div class="state-icon">⚠️</div>
            <div class="state-title">Unable to Load Class Notices</div>
            <div class="state-desc">${escapeHtml(err.message)}</div>
          </div>
        </div>
      `;
    }
  };

  const renderNoticesList = (list, filter) => {
    const container = document.getElementById("class-notices-container");
    if (!container) return;

    let displayList = list;
    if (filter !== "ALL") {
      displayList = list.filter(n => n.notice_type === filter);
    }

    if (displayList.length === 0) {
      container.innerHTML = `
        <div class="card">
          <div class="state-container" style="padding: 40px 20px;">
            <div class="state-icon">📢</div>
            <div class="state-title">No class notices found</div>
            <div class="state-desc">There are no notices matching category '${escapeHtml(filter)}'.</div>
          </div>
        </div>
      `;
      return;
    }

    container.innerHTML = `
      <div style="display: flex; flex-direction: column; gap: 12px;">
        ${displayList.map(n => `
          <div class="card" style="padding: 16px;">
            <div style="display: flex; justify-content: space-between; align-items: flex-start; flex-wrap: wrap; gap: 8px;">
              <div>
                <div style="font-size: 16px; font-weight: 800; color: var(--text);">${escapeHtml(n.subject)}</div>
                <div style="font-size: 12px; color: var(--text-secondary); margin-top: 2px;">
                  🎓 Target Cohort: <strong>${escapeHtml(n.target_branch)}</strong> &bull; Year ${n.target_year} (Sem ${n.target_semester}, Sec ${escapeHtml(n.target_section)})
                </div>
              </div>
              <div>
                ${formatNoticeBadge(n.notice_type)}
              </div>
            </div>

            <div style="font-size: 13px; color: var(--text); margin: 12px 0; background: var(--surface-hover); padding: 12px; border-radius: var(--radius-sm); border: 1px solid var(--border);">
              ${escapeHtml(n.details)}
            </div>

            <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 8px; font-size: 12px; color: var(--text-muted); border-top: 1px solid var(--border); padding-top: 10px;">
              <div style="display: flex; gap: 12px; flex-wrap: wrap;">
                <span>📅 Class Date: <strong>${formatDate(n.class_date)}</strong></span>
                <span>⏰ Period: <strong>${escapeHtml(n.period)}</strong></span>
              </div>
              <div>
                Published: ${timeAgo(n.created_at)}
              </div>
            </div>
          </div>
        `).join("")}
      </div>
    `;
  };

  // Attach filter tab listeners
  document.querySelectorAll("#notices-filter-bar .filter-tab").forEach(tab => {
    tab.addEventListener("click", (e) => {
      document.querySelectorAll("#notices-filter-bar .filter-tab").forEach(t => t.classList.remove("active"));
      e.target.classList.add("active");
      const filter = e.target.getAttribute("data-filter");
      renderNoticesList(cachedNotices, filter);
    });
  });

  loadNotices();
}

// Dedicated Teacher Class Notices List View (re-exports Class Management)
export async function renderTeacherClassNotices(mainEl) {
  renderTeacherClassManagement(mainEl);
}

// Modal: Create Class Notice / Timetable Modification
function openCreateNoticeModal(onCreated) {
  const modalRoot = document.getElementById("academic-modal-root");
  if (!modalRoot) return;

  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const tomorrowIso = tomorrow.toISOString().slice(0, 16);

  modalRoot.innerHTML = `
    <div class="modal-backdrop active" id="modal-notice-backdrop">
      <div class="modal-dialog" style="max-width: 600px;" role="dialog" aria-modal="true" aria-labelledby="modal-notice-title">
        <div class="modal-header">
          <h3 id="modal-notice-title" style="margin: 0; font-size: 18px; font-weight: 800;">
            📢 Publish Timetable Modification Notice
          </h3>
          <button class="btn-icon" id="btn-close-notice-modal" aria-label="Close" type="button">✕</button>
        </div>
        <form id="form-create-notice" style="padding: 20px;">
          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 16px;">
            <div class="form-group">
              <label class="form-label" for="not-type">Notice Adjustment Type *</label>
              <select class="form-input" id="not-type" required>
                <option value="RESCHEDULED">RESCHEDULED — Class Rescheduled</option>
                <option value="CANCELLED">CANCELLED — Class Cancelled</option>
                <option value="ROOM_CHANGED">ROOM_CHANGED — Classroom Swapped</option>
                <option value="SWITCHED">SWITCHED — Subject / Slot Swapped</option>
                <option value="POSTPONED">POSTPONED — Postponed to Future Date</option>
                <option value="FACULTY_CHANGED">FACULTY_CHANGED — Guest / Proxy Faculty</option>
              </select>
            </div>
            <div class="form-group">
              <label class="form-label" for="not-subject">Subject *</label>
              <input class="form-input" id="not-subject" type="text" required placeholder="e.g. Cloud Computing (CS601)" value="Cloud Computing (CS601)">
            </div>
          </div>

          <div style="display: grid; grid-template-columns: 2fr 1fr 1fr 1fr; gap: 10px; margin-bottom: 16px;">
            <div class="form-group">
              <label class="form-label" for="not-branch">Target Branch *</label>
              <input class="form-input" id="not-branch" type="text" required value="Computer Science & Engineering">
            </div>
            <div class="form-group">
              <label class="form-label" for="not-year">Year *</label>
              <input class="form-input" id="not-year" type="number" required min="2018" max="2030" value="2022">
            </div>
            <div class="form-group">
              <label class="form-label" for="not-sem">Sem *</label>
              <input class="form-input" id="not-sem" type="number" required min="1" max="8" value="6">
            </div>
            <div class="form-group">
              <label class="form-label" for="not-sec">Sec *</label>
              <input class="form-input" id="not-sec" type="text" required maxlength="5" value="A">
            </div>
          </div>

          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 16px;">
            <div class="form-group">
              <label class="form-label" for="not-date">Effective Date & Time *</label>
              <input class="form-input" id="not-date" type="datetime-local" required value="${tomorrowIso}">
            </div>
            <div class="form-group">
              <label class="form-label" for="not-period">Class Period *</label>
              <input class="form-input" id="not-period" type="text" required placeholder="e.g. 10:00 AM - 11:00 AM" value="10:00 AM - 11:00 AM">
            </div>
          </div>

          <div class="form-group" style="margin-bottom: 20px;">
            <label class="form-label" for="not-details">Modification Details & Instructions *</label>
            <textarea class="form-input" id="not-details" rows="3" required placeholder="State original room/slot and changed location, faculty, or make-up schedule.">Class shifted to Room 402 due to Department Seminar in Main Auditorium.</textarea>
          </div>

          <div style="display: flex; justify-content: flex-end; gap: 10px;">
            <button class="btn btn-secondary" id="btn-cancel-notice" type="button" style="min-height: 44px;">
              Cancel
            </button>
            <button class="btn btn-primary" id="btn-submit-notice" type="submit" style="min-height: 44px;">
              📢 Publish Notice Instantly
            </button>
          </div>
        </form>
      </div>
    </div>
  `;

  const closeModal = () => {
    modalRoot.innerHTML = "";
  };

  document.getElementById("btn-close-notice-modal")?.addEventListener("click", closeModal);
  document.getElementById("btn-cancel-notice")?.addEventListener("click", closeModal);

  document.getElementById("form-create-notice")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const btn = document.getElementById("btn-submit-notice");
    if (btn) {
      btn.disabled = true;
      btn.innerHTML = `<span class="spinner" style="width: 14px; height: 14px; border-width: 2px;"></span> Publishing...`;
    }

    const payload = {
      notice_type: document.getElementById("not-type")?.value,
      subject: document.getElementById("not-subject")?.value.trim(),
      target_branch: document.getElementById("not-branch")?.value.trim(),
      target_year: parseInt(document.getElementById("not-year")?.value, 10),
      target_semester: parseInt(document.getElementById("not-sem")?.value, 10),
      target_section: document.getElementById("not-sec")?.value.trim().toUpperCase(),
      class_date: new Date(document.getElementById("not-date")?.value).toISOString(),
      period: document.getElementById("not-period")?.value.trim(),
      details: document.getElementById("not-details")?.value.trim()
    };

    try {
      await api.post("/api/v1/class-notices", payload);
      showToast("Class modification notice published to students!", "success");
      closeModal();
      if (onCreated) onCreated();
    } catch (err) {
      console.error("Notice publishing error:", err);
      showToast(err.message || "Failed to publish notice", "error");
      if (btn) {
        btn.disabled = false;
        btn.innerHTML = `📢 Publish Notice Instantly`;
      }
    }
  });
}


/* --------------------------------------------------------------------------
   4. TEACHER — STUDY MATERIALS REPOSITORY
   -------------------------------------------------------------------------- */
export async function renderTeacherMaterials(mainEl) {
  if (!mainEl) return;

  mainEl.innerHTML = `
    <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 12px; margin-bottom: 20px;">
      <div>
        <div style="font-size: 12px; font-weight: 700; color: var(--primary); text-transform: uppercase;">
          Academic Content Distribution
        </div>
        <h2 style="margin: 2px 0 0 0; font-size: 22px; font-weight: 800; color: var(--text);">
          📚 Academic Study Materials
        </h2>
        <p style="margin: 2px 0 0 0; font-size: 13px; color: var(--text-secondary);">
          Upload lecture slides, question banks, and reference PDFs targeted to student cohorts.
        </p>
      </div>

      <div>
        <button class="btn btn-primary" id="btn-publish-material" type="button" style="min-height: 44px;">
          ➕ Publish Course Material
        </button>
      </div>
    </div>

    <!-- Materials Grid Container -->
    <div id="materials-list-container">
      <div class="state-container"><div class="spinner"></div></div>
    </div>

    <!-- Modal Root Container -->
    <div id="academic-modal-root"></div>
  `;

  document.getElementById("btn-publish-material")?.addEventListener("click", () => {
    openPublishMaterialModal(() => loadMaterials());
  });

  const loadMaterials = async () => {
    const container = document.getElementById("materials-list-container");
    if (!container) return;

    container.innerHTML = `<div class="state-container"><div class="spinner"></div></div>`;

    try {
      const materials = await api.get("/api/v1/materials");
      if (materials.length === 0) {
        container.innerHTML = `
          <div class="card">
            <div class="state-container" style="padding: 40px 20px;">
              <div class="state-icon">📚</div>
              <div class="state-title">No study materials published yet</div>
              <div class="state-desc">Click "Publish Course Material" to share documents with your students.</div>
            </div>
          </div>
        `;
        return;
      }

      container.innerHTML = `
        <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(320px, 1fr)); gap: 16px;">
          ${materials.map(m => {
            const targets = m.targets || [];
            return `
              <div class="card" style="padding: 16px; display: flex; flex-direction: column; justify-content: space-between;">
                <div>
                  <div style="display: flex; justify-content: space-between; align-items: flex-start; gap: 8px;">
                    <div style="font-size: 15px; font-weight: 800; color: var(--text);">${escapeHtml(m.title)}</div>
                    <span class="status-badge approved" style="font-size: 10px;">Active</span>
                  </div>

                  <div style="font-size: 12px; color: var(--text-secondary); margin: 8px 0;">
                    ${escapeHtml(m.description || 'No description provided.')}
                  </div>

                  <div style="font-size: 11px; color: var(--text-muted); margin-bottom: 12px; background: var(--surface-hover); padding: 8px; border-radius: var(--radius-sm); border: 1px solid var(--border);">
                    <div style="font-weight: 700; color: var(--text); margin-bottom: 2px;">Target Cohorts:</div>
                    ${targets.length > 0 ? targets.map(t => `
                      <div>🎓 ${escapeHtml(t.branch)} &bull; Year ${t.batch_year} (Sem ${t.semester}${t.section ? `, Sec ${t.section}` : ''}) &bull; ${escapeHtml(t.subject)}</div>
                    `).join("") : '<div>All Registered Cohorts</div>'}
                  </div>
                </div>

                <div style="display: flex; justify-content: space-between; align-items: center; border-top: 1px solid var(--border); padding-top: 10px; font-size: 11px; color: var(--text-muted);">
                  <span>📅 ${formatDate(m.created_at)}</span>
                  <a href="${escapeHtml(m.file_url)}" target="_blank" rel="noopener noreferrer" class="btn btn-sm btn-outline" style="text-decoration: none;">
                    📄 View ${escapeHtml(m.file_type || 'PDF')}
                  </a>
                </div>
              </div>
            `;
          }).join("")}
        </div>
      `;
    } catch (err) {
      container.innerHTML = `
        <div class="card">
          <div class="state-container" style="color: var(--error);">
            <div class="state-icon">⚠️</div>
            <div class="state-title">Unable to Load Materials</div>
            <div class="state-desc">${escapeHtml(err.message)}</div>
          </div>
        </div>
      `;
    }
  };

  loadMaterials();
}

// Modal: Publish Study Material
function openPublishMaterialModal(onCreated) {
  const modalRoot = document.getElementById("academic-modal-root");
  if (!modalRoot) return;

  modalRoot.innerHTML = `
    <div class="modal-backdrop active" id="modal-mat-backdrop">
      <div class="modal-dialog" style="max-width: 600px;" role="dialog" aria-modal="true" aria-labelledby="modal-mat-title">
        <div class="modal-header">
          <h3 id="modal-mat-title" style="margin: 0; font-size: 18px; font-weight: 800;">
            📚 Publish Course Study Material
          </h3>
          <button class="btn-icon" id="btn-close-mat-modal" aria-label="Close" type="button">✕</button>
        </div>
        <form id="form-publish-material" style="padding: 20px;">
          <div class="form-group" style="margin-bottom: 16px;">
            <label class="form-label" for="mat-title">Document Title *</label>
            <input class="form-input" id="mat-title" type="text" required placeholder="e.g. Module 2: Virtualization & Hypervisors" value="Module 2: Virtualization & Hypervisors">
          </div>

          <div class="form-group" style="margin-bottom: 16px;">
            <label class="form-label" for="mat-desc">Description / Syllabus Scope</label>
            <textarea class="form-input" id="mat-desc" rows="2" placeholder="Course notes covering hypervisor architectures, KVM, Xen, and container runtime isolation.">Lecture slides and lab setup guide for KVM and container runtime architectures.</textarea>
          </div>

          <div style="display: grid; grid-template-columns: 2fr 1fr; gap: 12px; margin-bottom: 16px;">
            <div class="form-group">
              <label class="form-label" for="mat-url">Document File URL / Path *</label>
              <input class="form-input" id="mat-url" type="text" required placeholder="/uploads/materials/cs601_module2.pdf" value="/uploads/materials/cs601_module2.pdf">
            </div>
            <div class="form-group">
              <label class="form-label" for="mat-type">File Type *</label>
              <select class="form-input" id="mat-type" required>
                <option value="application/pdf">PDF Document</option>
                <option value="application/vnd.ms-powerpoint">Presentation</option>
                <option value="application/msword">Word Document</option>
                <option value="application/zip">Source Archive (.zip)</option>
              </select>
            </div>
          </div>

          <div style="border: 1px solid var(--border); padding: 12px; border-radius: var(--radius-sm); margin-bottom: 20px; background: var(--surface-hover);">
            <div style="font-size: 12px; font-weight: 700; color: var(--text); margin-bottom: 8px;">
              Target Cohort Assignment (Student Access Control)
            </div>
            <div style="display: grid; grid-template-columns: 2fr 1fr; gap: 10px; margin-bottom: 10px;">
              <div>
                <label class="form-label" for="mat-target-branch" style="font-size: 11px;">Department / Branch *</label>
                <input class="form-input" id="mat-target-branch" type="text" required value="Computer Science & Engineering">
              </div>
              <div>
                <label class="form-label" for="mat-target-subject" style="font-size: 11px;">Subject *</label>
                <input class="form-input" id="mat-target-subject" type="text" required value="Cloud Computing">
              </div>
            </div>
            <div style="display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 10px;">
              <div>
                <label class="form-label" for="mat-target-batch" style="font-size: 11px;">Batch Year *</label>
                <input class="form-input" id="mat-target-batch" type="number" required value="2022">
              </div>
              <div>
                <label class="form-label" for="mat-target-sem" style="font-size: 11px;">Semester *</label>
                <input class="form-input" id="mat-target-sem" type="number" required min="1" max="8" value="6">
              </div>
              <div>
                <label class="form-label" for="mat-target-sec" style="font-size: 11px;">Section</label>
                <input class="form-input" id="mat-target-sec" type="text" value="A">
              </div>
            </div>
          </div>

          <div style="display: flex; justify-content: flex-end; gap: 10px;">
            <button class="btn btn-secondary" id="btn-cancel-mat" type="button" style="min-height: 44px;">
              Cancel
            </button>
            <button class="btn btn-primary" id="btn-submit-mat" type="submit" style="min-height: 44px;">
              🚀 Publish to Student Cohort
            </button>
          </div>
        </form>
      </div>
    </div>
  `;

  const closeModal = () => {
    modalRoot.innerHTML = "";
  };

  document.getElementById("btn-close-mat-modal")?.addEventListener("click", closeModal);
  document.getElementById("btn-cancel-mat")?.addEventListener("click", closeModal);

  document.getElementById("form-publish-material")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const btn = document.getElementById("btn-submit-mat");
    if (btn) {
      btn.disabled = true;
      btn.innerHTML = `<span class="spinner" style="width: 14px; height: 14px; border-width: 2px;"></span> Publishing...`;
    }

    const payload = {
      title: document.getElementById("mat-title")?.value.trim(),
      description: document.getElementById("mat-desc")?.value.trim(),
      file_url: document.getElementById("mat-url")?.value.trim(),
      file_type: document.getElementById("mat-type")?.value,
      targets: [
        {
          branch: document.getElementById("mat-target-branch")?.value.trim(),
          batch_year: parseInt(document.getElementById("mat-target-batch")?.value, 10),
          semester: parseInt(document.getElementById("mat-target-sem")?.value, 10),
          section: document.getElementById("mat-target-sec")?.value.trim().toUpperCase() || null,
          subject: document.getElementById("mat-target-subject")?.value.trim()
        }
      ]
    };

    try {
      await api.post("/api/v1/materials", payload);
      showToast("Study material published to cohort successfully!", "success");
      closeModal();
      if (onCreated) onCreated();
    } catch (err) {
      console.error("Material upload error:", err);
      showToast(err.message || "Failed to publish material", "error");
      if (btn) {
        btn.disabled = false;
        btn.innerHTML = `🚀 Publish to Student Cohort`;
      }
    }
  });
}


/* --------------------------------------------------------------------------
   5. TEACHER PROFILE & NOTIFICATIONS
   -------------------------------------------------------------------------- */
export async function renderTeacherProfile(mainEl, user) {
  if (!mainEl) return;

  mainEl.innerHTML = `
    <div style="margin-bottom: 20px;">
      <div style="font-size: 12px; font-weight: 700; color: var(--primary); text-transform: uppercase;">
        Institutional Identity & Verification
      </div>
      <h2 style="margin: 2px 0 0 0; font-size: 22px; font-weight: 800; color: var(--text);">
        👤 Academic Staff Profile
      </h2>
      <p style="margin: 2px 0 0 0; font-size: 13px; color: var(--text-secondary);">
        Authoritative credentials retrieved from the BPUT institutional directory.
      </p>
    </div>

    <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 16px;">
      <div class="card" style="padding: 20px;">
        <div class="card-header" style="padding: 0 0 12px 0;">
          <div class="card-title">Identity & Faculty Profile</div>
          <span class="status-badge approved">✓ Verified Faculty</span>
        </div>

        <div style="display: flex; align-items: center; gap: 16px; margin: 12px 0 16px 0;">
          <div class="account-avatar" style="width: 54px; height: 54px; font-size: 20px; font-weight: 800; background: var(--primary); color: #fff; border-radius: var(--radius-full); display: flex; align-items: center; justify-content: center;">
            ${(user.first_name || 'T')[0]}${(user.last_name || '')[0] || ''}
          </div>
          <div>
            <div style="font-size: 16px; font-weight: 800; color: var(--text);">${escapeHtml(user.first_name)} ${escapeHtml(user.last_name)}</div>
            <div style="font-size: 12px; color: var(--text-secondary); margin-top: 2px;">
              <span class="status-badge info">Associate Professor</span>
            </div>
          </div>
        </div>

        <div style="font-size: 13px; display: flex; flex-direction: column; gap: 12px; border-top: 1px solid var(--border); padding-top: 16px;">
          <div>
            <strong style="color: var(--text-muted); font-size: 11px; text-transform: uppercase;">Department</strong><br/>
            <span>Computer Science & Engineering</span>
          </div>
          <div>
            <strong style="color: var(--text-muted); font-size: 11px; text-transform: uppercase;">Institutional Email</strong><br/>
            <span>${escapeHtml(user.email)}</span>
          </div>
          <div>
            <strong style="color: var(--text-muted); font-size: 11px; text-transform: uppercase;">Official Contact Number</strong><br/>
            <span>${escapeHtml(user.phone_number || 'N/A')}</span>
          </div>
          <div>
            <strong style="color: var(--text-muted); font-size: 11px; text-transform: uppercase;">Role System Code</strong><br/>
            <span style="font-family: var(--font-family-mono); font-size: 12px;">${escapeHtml(user.role)}</span>
          </div>
          <div>
            <strong style="color: var(--text-muted); font-size: 11px; text-transform: uppercase;">Faculty Appointment Since</strong><br/>
            <span>${formatDate(user.created_at)}</span>
          </div>
        </div>
      </div>

      <div class="card" style="padding: 20px;">
        <div class="card-header" style="padding: 0 0 12px 0;">
          <div class="card-title">Academic Governance & System State</div>
          <span class="status-badge approved">● Compliant</span>
        </div>

        <div style="font-size: 13px; display: flex; flex-direction: column; gap: 12px; margin-top: 8px;">
          <div>
            <strong style="color: var(--text-muted); font-size: 11px; text-transform: uppercase;">Session Verification</strong><br/>
            <span>HS256 Authenticated Token Session</span>
          </div>
          <div>
            <strong style="color: var(--text-muted); font-size: 11px; text-transform: uppercase;">Roll-Call Authority</strong><br/>
            <span class="status-badge approved" style="font-size: 11px;">✓ Authoritative Attendance Marking Enabled</span>
          </div>
          <div>
            <strong style="color: var(--text-muted); font-size: 11px; text-transform: uppercase;">Classroom Notice Authority</strong><br/>
            <span class="status-badge approved" style="font-size: 11px;">✓ Timetable Adjustment Notice Broadcast Enabled</span>
          </div>
          <div>
            <strong style="color: var(--text-muted); font-size: 11px; text-transform: uppercase;">Course Content Authority</strong><br/>
            <span class="status-badge approved" style="font-size: 11px;">✓ Cohort-Targeted Study Material Publishing Enabled</span>
          </div>
          <div>
            <strong style="color: var(--text-muted); font-size: 11px; text-transform: uppercase;">Architecture Baseline</strong><br/>
            <span>BPUT Hackathon 2026 &bull; High-Cohesion Modular Monolith</span>
          </div>
        </div>
      </div>
    </div>
  `;
}

export async function renderTeacherNotifications(mainEl) {
  renderAcademicNotificationsView(mainEl, "Academic Notifications Center");
}


/* ==========================================================================
   ==========================================================================
   ROLE 2: LAB / WORKSHOP ASSISTANT EXPERIENCE
   ==========================================================================
   ========================================================================== */

/* --------------------------------------------------------------------------
   1. LAB DASHBOARD
   -------------------------------------------------------------------------- */
export async function renderLabDashboard(mainEl, user) {
  if (!mainEl) return;

  mainEl.innerHTML = `
    <!-- Top Greeting Banner -->
    <div style="display: flex; justify-content: space-between; align-items: flex-start; flex-wrap: wrap; gap: 16px; margin-bottom: 24px;">
      <div>
        <div style="font-size: 13px; font-weight: 700; color: var(--primary); text-transform: uppercase; letter-spacing: 0.5px;">
          Workshop & Laboratory Operations
        </div>
        <h2 style="margin: 4px 0 0 0; font-size: 24px; font-weight: 800; color: var(--text);">
          Welcome back, ${escapeHtml(user.first_name)} ${escapeHtml(user.last_name)} 🔬
        </h2>
        <p style="margin: 4px 0 0 0; font-size: 13px; color: var(--text-secondary);">
          Department of Mechanical Engineering &bull; Workshop Lathe & Machine Inventory
        </p>
      </div>

      <div style="display: flex; gap: 8px; flex-wrap: wrap;">
        <button class="btn btn-primary" id="btn-dash-new-req" type="button" style="min-height: 44px;">
          📦 New Requisition Indent
        </button>
        <button class="btn btn-secondary" id="btn-dash-new-eq" type="button" style="min-height: 44px;">
          ⚙️ Register Equipment
        </button>
      </div>
    </div>

    <!-- Quick Operational KPIs -->
    <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 16px; margin-bottom: 24px;">
      <div class="card" style="padding: 16px; border-left: 4px solid var(--primary);">
        <div style="font-size: 11px; font-weight: 700; color: var(--text-muted); text-transform: uppercase;">Total Equipment</div>
        <div id="lab-kpi-eq-total" style="font-size: 26px; font-weight: 800; color: var(--text); margin-top: 4px;">0</div>
        <div style="font-size: 11px; color: var(--text-secondary); margin-top: 2px;">Registered workshop machines</div>
      </div>

      <div class="card" style="padding: 16px; border-left: 4px solid var(--success);">
        <div style="font-size: 11px; font-weight: 700; color: var(--text-muted); text-transform: uppercase;">Functional Machines</div>
        <div id="lab-kpi-eq-functional" style="font-size: 26px; font-weight: 800; color: var(--success); margin-top: 4px;">0</div>
        <div style="font-size: 11px; color: var(--text-secondary); margin-top: 2px;">Ready for student lab sessions</div>
      </div>

      <div class="card" style="padding: 16px; border-left: 4px solid var(--warning);">
        <div style="font-size: 11px; font-weight: 700; color: var(--text-muted); text-transform: uppercase;">Needs Maintenance</div>
        <div id="lab-kpi-eq-attention" style="font-size: 26px; font-weight: 800; color: var(--warning); margin-top: 4px;">0</div>
        <div style="font-size: 11px; color: var(--text-secondary); margin-top: 2px;">Repairs or parts required</div>
      </div>

      <div class="card" style="padding: 16px; border-left: 4px solid var(--info);">
        <div style="font-size: 11px; font-weight: 700; color: var(--text-muted); text-transform: uppercase;">Active Requisitions</div>
        <div id="lab-kpi-req-active" style="font-size: 26px; font-weight: 800; color: var(--info); margin-top: 4px;">0</div>
        <div style="font-size: 11px; color: var(--text-secondary); margin-top: 2px;">Procurement indents in flight</div>
      </div>
    </div>

    <!-- Dual Column Workspace -->
    <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(320px, 1fr)); gap: 20px;">
      <!-- Left Column: Active Requisitions -->
      <div style="display: flex; flex-direction: column; gap: 20px;">
        <div class="card">
          <div class="card-header" style="display: flex; justify-content: space-between; align-items: center;">
            <div class="card-title">📦 Requisitions Lifecycle Telemetry</div>
            <a href="#requisitions" class="btn btn-sm btn-outline">View Indents</a>
          </div>
          <div id="lab-dash-req-container" style="padding: 16px;">
            <div class="state-container"><div class="spinner"></div></div>
          </div>
        </div>

        <!-- Equipment Requiring Maintenance -->
        <div class="card">
          <div class="card-header" style="display: flex; justify-content: space-between; align-items: center;">
            <div class="card-title">⚠️ Equipment Requiring Attention</div>
            <a href="#lab" class="btn btn-sm btn-outline">Inventory Roster</a>
          </div>
          <div id="lab-dash-attention-container" style="padding: 16px;">
            <div class="state-container"><div class="spinner"></div></div>
          </div>
        </div>
      </div>

      <!-- Right Column: Workshop Equipment Summary & Notices -->
      <div style="display: flex; flex-direction: column; gap: 20px;">
        <!-- Lab Equipment Summary -->
        <div class="card">
          <div class="card-header" style="display: flex; justify-content: space-between; align-items: center;">
            <div class="card-title">⚙️ Workshop Equipment Overview</div>
            <a href="#lab" class="btn btn-sm btn-outline">Manage</a>
          </div>
          <div id="lab-dash-eq-container" style="padding: 16px;">
            <div class="state-container"><div class="spinner"></div></div>
          </div>
        </div>

        <!-- Recent Notices -->
        <div class="card">
          <div class="card-header" style="display: flex; justify-content: space-between; align-items: center;">
            <div class="card-title">📢 Campus & Workshop Advisories</div>
            <a href="#class-notices" class="btn btn-sm btn-outline">Notices</a>
          </div>
          <div id="lab-dash-notices-container" style="padding: 16px;">
            <div class="state-container"><div class="spinner"></div></div>
          </div>
        </div>
      </div>
    </div>

    <!-- Modal Root Container -->
    <div id="academic-modal-root"></div>
  `;

  // Attach quick actions
  document.getElementById("btn-dash-new-req")?.addEventListener("click", () => {
    openCreateRequisitionModal(() => renderLabDashboard(mainEl, user));
  });
  document.getElementById("btn-dash-new-eq")?.addEventListener("click", () => {
    openRegisterEquipmentModal(() => renderLabDashboard(mainEl, user));
  });

  // Fetch Live Backend Data in Parallel
  try {
    const [equipmentRes, reqsRes, noticesRes] = await Promise.allSettled([
      api.get("/api/v1/lab/equipment"),
      api.get("/api/v1/lab/requisitions"),
      api.get("/api/v1/class-notices")
    ]);

    const equipment = equipmentRes.status === "fulfilled" ? (equipmentRes.value || []) : [];
    const requisitions = reqsRes.status === "fulfilled" ? (reqsRes.value || []) : [];
    const notices = noticesRes.status === "fulfilled" ? (noticesRes.value || []) : [];

    // Calculations
    const functionalCount = equipment.filter(e => e.working_status === "FUNCTIONAL").length;
    const attentionCount = equipment.filter(e => e.working_status === "NEEDS_REPAIR" || e.working_status === "NON_FUNCTIONAL").length;
    const activeReqsCount = requisitions.filter(r => r.status !== "COMPLETED" && r.status !== "REJECTED").length;

    // Set KPIs
    document.getElementById("lab-kpi-eq-total")?.replaceChildren(document.createTextNode(String(equipment.length)));
    document.getElementById("lab-kpi-eq-functional")?.replaceChildren(document.createTextNode(String(functionalCount)));
    document.getElementById("lab-kpi-eq-attention")?.replaceChildren(document.createTextNode(String(attentionCount)));
    document.getElementById("lab-kpi-req-active")?.replaceChildren(document.createTextNode(String(activeReqsCount)));

    // Render Requisitions Feed
    const reqsEl = document.getElementById("lab-dash-req-container");
    if (reqsEl) {
      if (requisitions.length === 0) {
        reqsEl.innerHTML = `
          <div class="state-container" style="padding: 24px 16px;">
            <div class="state-icon">📦</div>
            <div class="state-title" style="font-size: 13px;">No procurement requisitions lodged</div>
            <div class="state-desc" style="font-size: 11px;">Raise consumable indents or tool replacement requests.</div>
          </div>
        `;
      } else {
        reqsEl.innerHTML = `
          <div style="display: flex; flex-direction: column; gap: 8px;">
            ${requisitions.slice(0, 4).map(r => `
              <div class="card" style="padding: 12px; display: flex; justify-content: space-between; align-items: center; gap: 8px;">
                <div>
                  <div style="font-size: 13px; font-weight: 700; color: var(--text);">${escapeHtml(r.requisition_number)}</div>
                  <div style="font-size: 11px; color: var(--text-secondary); margin-top: 2px;">
                    📍 ${escapeHtml(r.lab_name)} &bull; ${r.items ? r.items.length : 0} line items
                  </div>
                  <div style="font-size: 10px; color: var(--text-muted); margin-top: 2px;">
                    📅 ${formatDate(r.created_at)}
                  </div>
                </div>
                <div>
                  ${formatRequisitionStatusBadge(r.status)}
                </div>
              </div>
            `).join("")}
          </div>
        `;
      }
    }

    // Render Attention Equipment
    const attentionEl = document.getElementById("lab-dash-attention-container");
    if (attentionEl) {
      const attentionList = equipment.filter(e => e.working_status === "NEEDS_REPAIR" || e.working_status === "NON_FUNCTIONAL");
      if (attentionList.length === 0) {
        attentionEl.innerHTML = `
          <div class="card" style="padding: 16px; background: var(--surface-hover); text-align: center;">
            <div style="color: var(--success); font-size: 20px; margin-bottom: 4px;">✓</div>
            <div style="font-size: 12px; font-weight: 700; color: var(--text);">All Machinery Functional</div>
            <div style="font-size: 11px; color: var(--text-secondary); margin-top: 2px;">Zero breakdown or urgent repair flags in inventory.</div>
          </div>
        `;
      } else {
        attentionEl.innerHTML = `
          <div style="display: flex; flex-direction: column; gap: 8px;">
            ${attentionList.map(e => `
              <div class="card" style="padding: 12px; border-left: 3px solid ${e.working_status === 'NON_FUNCTIONAL' ? 'var(--error)' : 'var(--warning)'};">
                <div style="display: flex; justify-content: space-between; align-items: flex-start; gap: 8px;">
                  <div style="font-size: 13px; font-weight: 700; color: var(--text);">${escapeHtml(e.name)}</div>
                  ${formatEquipmentStatusBadge(e.working_status)}
                </div>
                <div style="font-size: 11px; color: var(--text-secondary); margin: 4px 0;">
                  📍 ${escapeHtml(e.lab_name)} &bull; ID: <code>${escapeHtml(e.equipment_id)}</code>
                </div>
                <div style="font-size: 11px; color: var(--text-muted);">
                  Note: ${escapeHtml(e.maintenance_status || 'Maintenance required')}
                </div>
              </div>
            `).join("")}
          </div>
        `;
      }
    }

    // Render Equipment Summary
    const eqEl = document.getElementById("lab-dash-eq-container");
    if (eqEl) {
      if (equipment.length === 0) {
        eqEl.innerHTML = `
          <div class="state-container" style="padding: 24px 16px;">
            <div class="state-icon">⚙️</div>
            <div class="state-title" style="font-size: 13px;">No equipment registered</div>
            <div class="state-desc" style="font-size: 11px;">Register workshop tools to track operational readiness.</div>
          </div>
        `;
      } else {
        eqEl.innerHTML = `
          <div style="display: flex; flex-direction: column; gap: 8px;">
            ${equipment.slice(0, 3).map(e => `
              <div class="card" style="padding: 12px; display: flex; justify-content: space-between; align-items: center; gap: 8px;">
                <div>
                  <div style="font-size: 13px; font-weight: 700; color: var(--text);">${escapeHtml(e.name)}</div>
                  <div style="font-size: 11px; color: var(--text-secondary); margin-top: 2px;">
                    📍 ${escapeHtml(e.lab_name)} &bull; ${e.category}
                  </div>
                  <div style="font-size: 10px; color: var(--text-muted); margin-top: 2px;">
                    Available: <strong>${e.available_quantity}</strong> / ${e.total_quantity} units
                  </div>
                </div>
                <div>
                  ${formatEquipmentStatusBadge(e.working_status)}
                </div>
              </div>
            `).join("")}
          </div>
        `;
      }
    }

    // Render Notices
    const noticesEl = document.getElementById("lab-dash-notices-container");
    if (noticesEl) {
      if (notices.length === 0) {
        noticesEl.innerHTML = `<div class="card" style="padding: 14px; font-size: 12px; color: var(--text-muted);">No active campus notices.</div>`;
      } else {
        noticesEl.innerHTML = `
          <div style="display: flex; flex-direction: column; gap: 8px;">
            ${notices.slice(0, 3).map(n => `
              <div class="card" style="padding: 10px 12px;">
                <div style="font-size: 12px; font-weight: 700; color: var(--text);">${escapeHtml(n.subject)}</div>
                <div style="font-size: 11px; color: var(--text-secondary); margin: 2px 0;">${escapeHtml(n.details)}</div>
                <div style="font-size: 10px; color: var(--text-muted);">${formatDate(n.class_date)} &bull; ${escapeHtml(n.period)}</div>
              </div>
            `).join("")}
          </div>
        `;
      }
    }

  } catch (err) {
    console.error("Failed to load Lab dashboard:", err);
    showToast("Failed to load dashboard data: " + err.message, "error");
  }
}


/* --------------------------------------------------------------------------
   2. LAB EQUIPMENT INVENTORY ROSTER
   -------------------------------------------------------------------------- */
export async function renderLabEquipment(mainEl) {
  if (!mainEl) return;

  mainEl.innerHTML = `
    <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 12px; margin-bottom: 20px;">
      <div>
        <div style="font-size: 12px; font-weight: 700; color: var(--primary); text-transform: uppercase;">
          Workshop Inventory & Machine States
        </div>
        <h2 style="margin: 2px 0 0 0; font-size: 22px; font-weight: 800; color: var(--text);">
          🔬 Laboratory & Workshop Equipment
        </h2>
        <p style="margin: 2px 0 0 0; font-size: 13px; color: var(--text-secondary);">
          Register physical machinery, update operational working status, and record maintenance logs.
        </p>
      </div>

      <div>
        <button class="btn btn-primary" id="btn-register-equipment" type="button" style="min-height: 44px;">
          ➕ Register New Equipment
        </button>
      </div>
    </div>

    <!-- Filter & Search Controls -->
    <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 12px; margin-bottom: 16px;">
      <div class="filter-tab-bar" id="equipment-filter-bar">
        <button class="filter-tab active" data-filter="ALL" type="button">All Equipment</button>
        <button class="filter-tab" data-filter="FUNCTIONAL" type="button">Functional</button>
        <button class="filter-tab" data-filter="NEEDS_REPAIR" type="button">Needs Repair</button>
        <button class="filter-tab" data-filter="NON_FUNCTIONAL" type="button">Non-Functional</button>
      </div>

      <div style="min-width: 240px;">
        <input class="form-input" id="search-lab-name" type="text" placeholder="Filter by lab name..." style="height: 38px;">
      </div>
    </div>

    <!-- Equipment List Container -->
    <div id="equipment-list-container">
      <div class="state-container"><div class="spinner"></div></div>
    </div>

    <!-- Modal Root Container -->
    <div id="academic-modal-root"></div>
  `;

  document.getElementById("btn-register-equipment")?.addEventListener("click", () => {
    openRegisterEquipmentModal(() => loadEquipment());
  });

  let cachedEquipment = [];

  const loadEquipment = async (filter = "ALL") => {
    const container = document.getElementById("equipment-list-container");
    if (!container) return;

    container.innerHTML = `<div class="state-container"><div class="spinner"></div></div>`;

    const labFilter = document.getElementById("search-lab-name")?.value.trim();
    let query = "/api/v1/lab/equipment";
    if (labFilter) {
      query += `?lab_name=${encodeURIComponent(labFilter)}`;
    }

    try {
      cachedEquipment = await api.get(query);
      renderEquipmentList(cachedEquipment, filter);
    } catch (err) {
      container.innerHTML = `
        <div class="card">
          <div class="state-container" style="color: var(--error);">
            <div class="state-icon">⚠️</div>
            <div class="state-title">Unable to Load Equipment Roster</div>
            <div class="state-desc">${escapeHtml(err.message)}</div>
          </div>
        </div>
      `;
    }
  };

  const renderEquipmentList = (list, filter) => {
    const container = document.getElementById("equipment-list-container");
    if (!container) return;

    let displayList = list;
    if (filter !== "ALL") {
      displayList = list.filter(e => e.working_status === filter);
    }

    if (displayList.length === 0) {
      container.innerHTML = `
        <div class="card">
          <div class="state-container" style="padding: 40px 20px;">
            <div class="state-icon">🔬</div>
            <div class="state-title">No equipment found</div>
            <div class="state-desc">No machines match the selected filter criteria.</div>
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
              <th>Equipment ID</th>
              <th>Machine Name</th>
              <th>Category</th>
              <th>Lab Location</th>
              <th>Working Status</th>
              <th>Stock (Total / Avail / Damaged)</th>
              <th>Maintenance Remarks</th>
              <th style="text-align: right;">Action</th>
            </tr>
          </thead>
          <tbody>
            ${displayList.map(e => `
              <tr>
                <td><code style="font-weight: 700;">${escapeHtml(e.equipment_id)}</code></td>
                <td><strong>${escapeHtml(e.name)}</strong></td>
                <td><span style="font-size: 12px; color: var(--text-secondary);">${escapeHtml(e.category)}</span></td>
                <td>${escapeHtml(e.lab_name)}</td>
                <td>${formatEquipmentStatusBadge(e.working_status)}</td>
                <td>
                  <span style="font-weight: 700; color: var(--text);">${e.total_quantity}</span>
                  <span style="color: var(--text-muted);">/</span>
                  <span style="color: var(--success); font-weight: 700;">${e.available_quantity}</span>
                  <span style="color: var(--text-muted);">/</span>
                  <span style="color: var(--error); font-weight: 700;">${e.damaged_quantity}</span>
                </td>
                <td style="font-size: 12px; color: var(--text-secondary); max-width: 220px;">
                  ${escapeHtml(e.maintenance_status || 'Routine operation')}
                </td>
                <td style="text-align: right;">
                  <button class="btn btn-sm btn-outline" onclick="window.openEditEquipment('${escapeHtml(e.id)}')" type="button">
                    ✏️ Update
                  </button>
                </td>
              </tr>
            `).join("")}
          </tbody>
        </table>
      </div>
    `;
  };

  // Global helper for opening edit modal
  window.openEditEquipment = (id) => {
    const item = cachedEquipment.find(e => e.id === id);
    if (item) {
      openUpdateEquipmentModal(item, () => loadEquipment());
    }
  };

  // Search input handler
  document.getElementById("search-lab-name")?.addEventListener("input", () => {
    loadEquipment();
  });

  // Filter tabs handler
  document.querySelectorAll("#equipment-filter-bar .filter-tab").forEach(tab => {
    tab.addEventListener("click", (e) => {
      document.querySelectorAll("#equipment-filter-bar .filter-tab").forEach(t => t.classList.remove("active"));
      e.target.classList.add("active");
      const filter = e.target.getAttribute("data-filter");
      renderEquipmentList(cachedEquipment, filter);
    });
  });

  loadEquipment();
}

// Modal: Register Equipment
function openRegisterEquipmentModal(onCreated) {
  const modalRoot = document.getElementById("academic-modal-root");
  if (!modalRoot) return;

  modalRoot.innerHTML = `
    <div class="modal-backdrop active" id="modal-eq-backdrop">
      <div class="modal-dialog" style="max-width: 580px;" role="dialog" aria-modal="true" aria-labelledby="modal-eq-title">
        <div class="modal-header">
          <h3 id="modal-eq-title" style="margin: 0; font-size: 18px; font-weight: 800;">
            ⚙️ Register Workshop Equipment
          </h3>
          <button class="btn-icon" id="btn-close-eq-modal" aria-label="Close" type="button">✕</button>
        </div>
        <form id="form-register-equipment" style="padding: 20px;">
          <div style="display: grid; grid-template-columns: 1fr 2fr; gap: 12px; margin-bottom: 16px;">
            <div class="form-group">
              <label class="form-label" for="eq-id">Equipment Code ID *</label>
              <input class="form-input" id="eq-id" type="text" required placeholder="EQ-MECH-CNC-04" value="EQ-MECH-CNC-04">
            </div>
            <div class="form-group">
              <label class="form-label" for="eq-name">Machine / Tool Name *</label>
              <input class="form-input" id="eq-name" type="text" required placeholder="CNC Vertical Machining Center" value="CNC Vertical Machining Center">
            </div>
          </div>

          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 16px;">
            <div class="form-group">
              <label class="form-label" for="eq-category">Category *</label>
              <input class="form-input" id="eq-category" type="text" required placeholder="Machine Tools" value="Machine Tools">
            </div>
            <div class="form-group">
              <label class="form-label" for="eq-lab">Assigned Workshop / Lab *</label>
              <input class="form-input" id="eq-lab" type="text" required placeholder="Mechanical Workshop Lab 1" value="Mechanical Workshop Lab 1">
            </div>
          </div>

          <div style="display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 10px; margin-bottom: 16px;">
            <div class="form-group">
              <label class="form-label" for="eq-qty-total">Total Qty *</label>
              <input class="form-input" id="eq-qty-total" type="number" required min="1" value="2">
            </div>
            <div class="form-group">
              <label class="form-label" for="eq-qty-avail">Available *</label>
              <input class="form-input" id="eq-qty-avail" type="number" required min="0" value="2">
            </div>
            <div class="form-group">
              <label class="form-label" for="eq-qty-damaged">Damaged</label>
              <input class="form-input" id="eq-qty-damaged" type="number" required min="0" value="0">
            </div>
          </div>

          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 20px;">
            <div class="form-group">
              <label class="form-label" for="eq-status">Operational Status *</label>
              <select class="form-input" id="eq-status" required>
                <option value="FUNCTIONAL">FUNCTIONAL — Operational</option>
                <option value="NEEDS_REPAIR">NEEDS_REPAIR — Minor Fault</option>
                <option value="NON_FUNCTIONAL">NON_FUNCTIONAL — Out of Service</option>
              </select>
            </div>
            <div class="form-group">
              <label class="form-label" for="eq-maint">Maintenance Status Notes</label>
              <input class="form-input" id="eq-maint" type="text" placeholder="e.g. Preventative maintenance certified" value="Calibrated and ready for student machining">
            </div>
          </div>

          <div style="display: flex; justify-content: flex-end; gap: 10px;">
            <button class="btn btn-secondary" id="btn-cancel-eq" type="button" style="min-height: 44px;">
              Cancel
            </button>
            <button class="btn btn-primary" id="btn-submit-eq" type="submit" style="min-height: 44px;">
              💾 Register Equipment
            </button>
          </div>
        </form>
      </div>
    </div>
  `;

  const closeModal = () => {
    modalRoot.innerHTML = "";
  };

  document.getElementById("btn-close-eq-modal")?.addEventListener("click", closeModal);
  document.getElementById("btn-cancel-eq")?.addEventListener("click", closeModal);

  document.getElementById("form-register-equipment")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const btn = document.getElementById("btn-submit-eq");
    if (btn) {
      btn.disabled = true;
      btn.innerHTML = `<span class="spinner" style="width: 14px; height: 14px; border-width: 2px;"></span> Registering...`;
    }

    const payload = {
      equipment_id: document.getElementById("eq-id")?.value.trim(),
      name: document.getElementById("eq-name")?.value.trim(),
      category: document.getElementById("eq-category")?.value.trim(),
      lab_name: document.getElementById("eq-lab")?.value.trim(),
      total_quantity: parseInt(document.getElementById("eq-qty-total")?.value, 10),
      available_quantity: parseInt(document.getElementById("eq-qty-avail")?.value, 10),
      damaged_quantity: parseInt(document.getElementById("eq-qty-damaged")?.value, 10) || 0,
      working_status: document.getElementById("eq-status")?.value,
      maintenance_status: document.getElementById("eq-maint")?.value.trim() || null
    };

    try {
      await api.post("/api/v1/lab/equipment", payload);
      showToast("Equipment registered successfully in workshop inventory!", "success");
      closeModal();
      if (onCreated) onCreated();
    } catch (err) {
      console.error("Equipment registration error:", err);
      showToast(err.message || "Failed to register equipment", "error");
      if (btn) {
        btn.disabled = false;
        btn.innerHTML = `💾 Register Equipment`;
      }
    }
  });
}

// Modal: Update Equipment Status & Maintenance
function openUpdateEquipmentModal(item, onUpdated) {
  const modalRoot = document.getElementById("academic-modal-root");
  if (!modalRoot) return;

  modalRoot.innerHTML = `
    <div class="modal-backdrop active" id="modal-update-eq-backdrop">
      <div class="modal-dialog" style="max-width: 520px;" role="dialog" aria-modal="true" aria-labelledby="modal-update-eq-title">
        <div class="modal-header">
          <h3 id="modal-update-eq-title" style="margin: 0; font-size: 18px; font-weight: 800;">
            ✏️ Update ${escapeHtml(item.name)}
          </h3>
          <button class="btn-icon" id="btn-close-update-eq-modal" aria-label="Close" type="button">✕</button>
        </div>
        <form id="form-update-equipment" style="padding: 20px;">
          <div style="font-size: 12px; color: var(--text-muted); margin-bottom: 12px;">
            Code: <code>${escapeHtml(item.equipment_id)}</code> &bull; Location: <strong>${escapeHtml(item.lab_name)}</strong>
          </div>

          <div class="form-group" style="margin-bottom: 16px;">
            <label class="form-label" for="upd-eq-status">Working Status *</label>
            <select class="form-input" id="upd-eq-status" required>
              <option value="FUNCTIONAL" ${item.working_status === 'FUNCTIONAL' ? 'selected' : ''}>FUNCTIONAL — Operational</option>
              <option value="NEEDS_REPAIR" ${item.working_status === 'NEEDS_REPAIR' ? 'selected' : ''}>NEEDS_REPAIR — Minor Fault</option>
              <option value="NON_FUNCTIONAL" ${item.working_status === 'NON_FUNCTIONAL' ? 'selected' : ''}>NON_FUNCTIONAL — Out of Service</option>
            </select>
          </div>

          <div style="display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 10px; margin-bottom: 16px;">
            <div class="form-group">
              <label class="form-label" for="upd-eq-total">Total</label>
              <input class="form-input" id="upd-eq-total" type="number" min="1" value="${item.total_quantity}">
            </div>
            <div class="form-group">
              <label class="form-label" for="upd-eq-avail">Available</label>
              <input class="form-input" id="upd-eq-avail" type="number" min="0" value="${item.available_quantity}">
            </div>
            <div class="form-group">
              <label class="form-label" for="upd-eq-damaged">Damaged</label>
              <input class="form-input" id="upd-eq-damaged" type="number" min="0" value="${item.damaged_quantity}">
            </div>
          </div>

          <div class="form-group" style="margin-bottom: 20px;">
            <label class="form-label" for="upd-eq-maint">Maintenance Status Notes</label>
            <input class="form-input" id="upd-eq-maint" type="text" value="${escapeHtml(item.maintenance_status || '')}" placeholder="e.g. Scheduled for spindle inspection">
          </div>

          <div style="display: flex; justify-content: flex-end; gap: 10px;">
            <button class="btn btn-secondary" id="btn-cancel-upd-eq" type="button" style="min-height: 44px;">
              Cancel
            </button>
            <button class="btn btn-primary" id="btn-submit-upd-eq" type="submit" style="min-height: 44px;">
              💾 Save Updates
            </button>
          </div>
        </form>
      </div>
    </div>
  `;

  const closeModal = () => {
    modalRoot.innerHTML = "";
  };

  document.getElementById("btn-close-update-eq-modal")?.addEventListener("click", closeModal);
  document.getElementById("btn-cancel-upd-eq")?.addEventListener("click", closeModal);

  document.getElementById("form-update-equipment")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const btn = document.getElementById("btn-submit-upd-eq");
    if (btn) {
      btn.disabled = true;
      btn.innerHTML = `<span class="spinner" style="width: 14px; height: 14px; border-width: 2px;"></span> Saving...`;
    }

    const payload = {
      working_status: document.getElementById("upd-eq-status")?.value,
      total_quantity: parseInt(document.getElementById("upd-eq-total")?.value, 10),
      available_quantity: parseInt(document.getElementById("upd-eq-avail")?.value, 10),
      damaged_quantity: parseInt(document.getElementById("upd-eq-damaged")?.value, 10),
      maintenance_status: document.getElementById("upd-eq-maint")?.value.trim() || null
    };

    try {
      await api.patch(`/api/v1/lab/equipment/${item.id}`, payload);
      showToast("Equipment operational status updated!", "success");
      closeModal();
      if (onUpdated) onUpdated();
    } catch (err) {
      console.error("Equipment update error:", err);
      showToast(err.message || "Failed to update equipment", "error");
      if (btn) {
        btn.disabled = false;
        btn.innerHTML = `💾 Save Updates`;
      }
    }
  });
}


/* --------------------------------------------------------------------------
   3. LAB REQUISITION WORKFLOW (PRIMARY WORKFLOW)
   Lifecycle: DRAFT -> SUBMITTED -> UNDER_REVIEW -> APPROVED/REJECTED -> ORDERED -> COMPLETED
   -------------------------------------------------------------------------- */
export async function renderLabRequisitions(mainEl) {
  if (!mainEl) return;

  mainEl.innerHTML = `
    <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 12px; margin-bottom: 20px;">
      <div>
        <div style="font-size: 12px; font-weight: 700; color: var(--primary); text-transform: uppercase;">
          Workshop Procurement & Repairs Indents
        </div>
        <h2 style="margin: 2px 0 0 0; font-size: 22px; font-weight: 800; color: var(--text);">
          📦 Laboratory Requisitions
        </h2>
        <p style="margin: 2px 0 0 0; font-size: 13px; color: var(--text-secondary);">
          Manage tool and consumable procurement lifecycle: Draft → Submitted → Under Review → Approved → Ordered → Completed.
        </p>
      </div>

      <div>
        <button class="btn btn-primary" id="btn-create-requisition" type="button" style="min-height: 44px;">
          ➕ Create Requisition Indent
        </button>
      </div>
    </div>

    <!-- Filter Tabs -->
    <div class="filter-tab-bar" id="req-filter-bar">
      <button class="filter-tab active" data-filter="ALL" type="button">All Indents</button>
      <button class="filter-tab" data-filter="DRAFT" type="button">Drafts</button>
      <button class="filter-tab" data-filter="SUBMITTED" type="button">Submitted</button>
      <button class="filter-tab" data-filter="UNDER_REVIEW" type="button">Under Review</button>
      <button class="filter-tab" data-filter="APPROVED" type="button">Approved</button>
      <button class="filter-tab" data-filter="REJECTED" type="button">Rejected</button>
      <button class="filter-tab" data-filter="ORDERED" type="button">Ordered</button>
      <button class="filter-tab" data-filter="COMPLETED" type="button">Completed</button>
    </div>

    <!-- Requisitions List Container -->
    <div id="requisitions-list-container" style="margin-top: 16px;">
      <div class="state-container"><div class="spinner"></div></div>
    </div>

    <!-- Modal Root Container -->
    <div id="academic-modal-root"></div>
  `;

  document.getElementById("btn-create-requisition")?.addEventListener("click", () => {
    openCreateRequisitionModal(() => loadRequisitions());
  });

  let cachedRequisitions = [];

  const loadRequisitions = async (filter = "ALL") => {
    const container = document.getElementById("requisitions-list-container");
    if (!container) return;

    container.innerHTML = `<div class="state-container"><div class="spinner"></div></div>`;

    let url = "/api/v1/lab/requisitions";
    if (filter !== "ALL") {
      url += `?status_filter=${filter}`;
    }

    try {
      cachedRequisitions = await api.get(url);
      renderRequisitionsList(cachedRequisitions);
    } catch (err) {
      container.innerHTML = `
        <div class="card">
          <div class="state-container" style="color: var(--error);">
            <div class="state-icon">⚠️</div>
            <div class="state-title">Unable to Load Requisitions</div>
            <div class="state-desc">${escapeHtml(err.message)}</div>
          </div>
        </div>
      `;
    }
  };

  const renderRequisitionsList = (list) => {
    const container = document.getElementById("requisitions-list-container");
    if (!container) return;

    if (list.length === 0) {
      container.innerHTML = `
        <div class="card">
          <div class="state-container" style="padding: 40px 20px;">
            <div class="state-icon">📦</div>
            <div class="state-title">No requisitions found</div>
            <div class="state-desc">There are no requisitions matching this status filter.</div>
          </div>
        </div>
      `;
      return;
    }

    container.innerHTML = `
      <div style="display: flex; flex-direction: column; gap: 14px;">
        ${list.map(r => `
          <div class="card" style="padding: 18px;">
            <div style="display: flex; justify-content: space-between; align-items: flex-start; flex-wrap: wrap; gap: 10px;">
              <div>
                <div style="display: flex; align-items: center; gap: 10px;">
                  <span style="font-size: 16px; font-weight: 800; color: var(--text);">${escapeHtml(r.requisition_number)}</span>
                  ${formatRequisitionStatusBadge(r.status)}
                </div>
                <div style="font-size: 13px; color: var(--text-secondary); margin-top: 4px;">
                  📍 Workshop: <strong>${escapeHtml(r.lab_name)}</strong>
                </div>
              </div>

              <div style="display: flex; gap: 8px; flex-wrap: wrap;">
                <button class="btn btn-sm btn-primary" onclick="window.viewRequisitionDetails('${escapeHtml(r.id)}')" type="button">
                  🔍 View Details & Lifecycle
                </button>
                ${r.status === 'DRAFT' ? `
                  <button class="btn btn-sm btn-outline" onclick="window.openAddItemModal('${escapeHtml(r.id)}')" type="button">
                    ➕ Add Item
                  </button>
                  <button class="btn btn-sm btn-primary" onclick="window.submitRequisitionAction('${escapeHtml(r.id)}')" type="button">
                    🚀 Submit Indent
                  </button>
                ` : ''}
              </div>
            </div>

            <!-- Items summary preview -->
            <div style="margin: 12px 0; background: var(--surface-hover); padding: 10px 14px; border-radius: var(--radius-sm); border: 1px solid var(--border);">
              <div style="font-size: 11px; font-weight: 700; color: var(--text-muted); text-transform: uppercase; margin-bottom: 4px;">
                Line Items (${r.items ? r.items.length : 0})
              </div>
              ${r.items && r.items.length > 0 ? `
                <div style="display: flex; flex-direction: column; gap: 4px; font-size: 12px; color: var(--text);">
                  ${r.items.map(it => `
                    <div>&bull; <strong>${escapeHtml(it.item_name)}</strong> &mdash; ${it.quantity} ${escapeHtml(it.unit)} ${it.specifications ? `(${escapeHtml(it.specifications)})` : ''}</div>
                  `).join("")}
                </div>
              ` : `
                <div style="font-size: 12px; color: var(--text-muted);">No line items added to draft yet.</div>
              `}
            </div>

            ${r.status === 'REJECTED' && r.rejection_reason ? `
              <div style="margin-bottom: 12px; background: rgba(239, 68, 68, 0.1); border-left: 3px solid var(--error); padding: 8px 12px; font-size: 12px; color: var(--error);">
                <strong>Rejection Reason:</strong> ${escapeHtml(r.rejection_reason)}
              </div>
            ` : ''}

            <!-- Metadata footer -->
            <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 8px; font-size: 11px; color: var(--text-muted); border-top: 1px solid var(--border); padding-top: 10px;">
              <span>Created: <strong>${formatDate(r.created_at)}</strong> (${timeAgo(r.created_at)})</span>
              <span>Requisition Ref: <code>${escapeHtml(r.id.substring(0, 13))}...</code></span>
            </div>
          </div>
        `).join("")}
      </div>
    `;
  };

  // Attach filter handlers
  document.querySelectorAll("#req-filter-bar .filter-tab").forEach(tab => {
    tab.addEventListener("click", (e) => {
      document.querySelectorAll("#req-filter-bar .filter-tab").forEach(t => t.classList.remove("active"));
      e.target.classList.add("active");
      const filter = e.target.getAttribute("data-filter");
      loadRequisitions(filter);
    });
  });

  // Global window action bindings
  window.viewRequisitionDetails = (id) => {
    const req = cachedRequisitions.find(r => r.id === id);
    if (req) {
      openRequisitionDetailModal(req, () => loadRequisitions());
    }
  };

  window.openAddItemModal = (id) => {
    openAddRequisitionItemModal(id, () => loadRequisitions());
  };

  window.submitRequisitionAction = async (id) => {
    if (!confirm("Are you sure you want to submit this draft requisition for institutional review?")) return;
    try {
      await api.post(`/api/v1/lab/requisitions/${id}/submit`);
      showToast("Requisition submitted for review!", "success");
      loadRequisitions();
    } catch (err) {
      showToast(err.message || "Failed to submit requisition", "error");
    }
  };

  loadRequisitions();
}

// Modal: Create Draft Requisition Indent
function openCreateRequisitionModal(onCreated) {
  const modalRoot = document.getElementById("academic-modal-root");
  if (!modalRoot) return;

  modalRoot.innerHTML = `
    <div class="modal-backdrop active" id="modal-req-backdrop">
      <div class="modal-dialog" style="max-width: 580px;" role="dialog" aria-modal="true" aria-labelledby="modal-req-title">
        <div class="modal-header">
          <h3 id="modal-req-title" style="margin: 0; font-size: 18px; font-weight: 800;">
            📦 New Procurement / Repair Requisition Indent
          </h3>
          <button class="btn-icon" id="btn-close-req-modal" aria-label="Close" type="button">✕</button>
        </div>
        <form id="form-create-requisition" style="padding: 20px;">
          <div class="form-group" style="margin-bottom: 16px;">
            <label class="form-label" for="req-lab-name">Lab / Workshop Name *</label>
            <input class="form-input" id="req-lab-name" type="text" required placeholder="Mechanical Workshop Lab 1" value="Mechanical Workshop Lab 1">
          </div>

          <div style="border: 1px solid var(--border); padding: 14px; border-radius: var(--radius-sm); margin-bottom: 20px; background: var(--surface-hover);">
            <div style="font-size: 12px; font-weight: 700; color: var(--text); margin-bottom: 8px;">
              Initial Line Item (Optional &bull; Additional items can be added in Draft)
            </div>

            <div class="form-group" style="margin-bottom: 10px;">
              <label class="form-label" for="req-item-name" style="font-size: 11px;">Item Name</label>
              <input class="form-input" id="req-item-name" type="text" placeholder="e.g. High Speed Steel Lathe Cutters 12mm" value="High Speed Steel Lathe Cutters 12mm">
            </div>

            <div style="display: grid; grid-template-columns: 2fr 1fr 1fr; gap: 10px; margin-bottom: 10px;">
              <div>
                <label class="form-label" for="req-item-spec" style="font-size: 11px;">Specifications</label>
                <input class="form-input" id="req-item-spec" type="text" placeholder="Grade M2, DIN 4971" value="Grade M2, DIN 4971">
              </div>
              <div>
                <label class="form-label" for="req-item-qty" style="font-size: 11px;">Quantity</label>
                <input class="form-input" id="req-item-qty" type="number" min="1" value="25">
              </div>
              <div>
                <label class="form-label" for="req-item-unit" style="font-size: 11px;">Unit</label>
                <input class="form-input" id="req-item-unit" type="text" value="pieces">
              </div>
            </div>

            <div>
              <label class="form-label" for="req-item-just" style="font-size: 11px;">Justification</label>
              <input class="form-input" id="req-item-just" type="text" placeholder="Replenishment for 4th sem workshop practicals" value="Quarterly stock replenishment for student lathe machining.">
            </div>
          </div>

          <div style="display: flex; justify-content: flex-end; gap: 10px;">
            <button class="btn btn-secondary" id="btn-cancel-req" type="button" style="min-height: 44px;">
              Cancel
            </button>
            <button class="btn btn-primary" id="btn-submit-req" type="submit" style="min-height: 44px;">
              📝 Create Draft Indent
            </button>
          </div>
        </form>
      </div>
    </div>
  `;

  const closeModal = () => {
    modalRoot.innerHTML = "";
  };

  document.getElementById("btn-close-req-modal")?.addEventListener("click", closeModal);
  document.getElementById("btn-cancel-req")?.addEventListener("click", closeModal);

  document.getElementById("form-create-requisition")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const btn = document.getElementById("btn-submit-req");
    if (btn) {
      btn.disabled = true;
      btn.innerHTML = `<span class="spinner" style="width: 14px; height: 14px; border-width: 2px;"></span> Creating...`;
    }

    const labName = document.getElementById("req-lab-name")?.value.trim();
    const itemName = document.getElementById("req-item-name")?.value.trim();

    const payload = {
      lab_name: labName,
      items: []
    };

    if (itemName) {
      payload.items.push({
        item_name: itemName,
        specifications: document.getElementById("req-item-spec")?.value.trim() || null,
        quantity: parseInt(document.getElementById("req-item-qty")?.value, 10) || 1,
        unit: document.getElementById("req-item-unit")?.value.trim() || "units",
        justification: document.getElementById("req-item-just")?.value.trim() || null
      });
    }

    try {
      await api.post("/api/v1/lab/requisitions", payload);
      showToast("Draft requisition indent created successfully!", "success");
      closeModal();
      if (onCreated) onCreated();
    } catch (err) {
      console.error("Requisition creation error:", err);
      showToast(err.message || "Failed to create requisition", "error");
      if (btn) {
        btn.disabled = false;
        btn.innerHTML = `📝 Create Draft Indent`;
      }
    }
  });
}

// Modal: Add Item to Draft Requisition
function openAddRequisitionItemModal(requisitionId, onAdded) {
  const modalRoot = document.getElementById("academic-modal-root");
  if (!modalRoot) return;

  modalRoot.innerHTML = `
    <div class="modal-backdrop active" id="modal-item-backdrop">
      <div class="modal-dialog" style="max-width: 500px;" role="dialog" aria-modal="true" aria-labelledby="modal-item-title">
        <div class="modal-header">
          <h3 id="modal-item-title" style="margin: 0; font-size: 18px; font-weight: 800;">
            ➕ Add Line Item to Draft Indent
          </h3>
          <button class="btn-icon" id="btn-close-item-modal" aria-label="Close" type="button">✕</button>
        </div>
        <form id="form-add-item" style="padding: 20px;">
          <div class="form-group" style="margin-bottom: 14px;">
            <label class="form-label" for="add-it-name">Item Name *</label>
            <input class="form-input" id="add-it-name" type="text" required placeholder="e.g. Carbide Turning Inserts" value="Carbide Turning Inserts">
          </div>

          <div style="display: grid; grid-template-columns: 2fr 1fr 1fr; gap: 10px; margin-bottom: 14px;">
            <div>
              <label class="form-label" for="add-it-spec">Specifications</label>
              <input class="form-input" id="add-it-spec" type="text" placeholder="e.g. TNMG 160408" value="TNMG 160408">
            </div>
            <div>
              <label class="form-label" for="add-it-qty">Quantity *</label>
              <input class="form-input" id="add-it-qty" type="number" required min="1" value="10">
            </div>
            <div>
              <label class="form-label" for="add-it-unit">Unit *</label>
              <input class="form-input" id="add-it-unit" type="text" required value="pack">
            </div>
          </div>

          <div class="form-group" style="margin-bottom: 20px;">
            <label class="form-label" for="add-it-just">Procurement Justification</label>
            <input class="form-input" id="add-it-just" type="text" placeholder="Machining tool wear replacement" value="Required for student mechanical workshop turning experiments.">
          </div>

          <div style="display: flex; justify-content: flex-end; gap: 10px;">
            <button class="btn btn-secondary" id="btn-cancel-add-it" type="button" style="min-height: 44px;">
              Cancel
            </button>
            <button class="btn btn-primary" id="btn-submit-add-it" type="submit" style="min-height: 44px;">
              ➕ Add Line Item
            </button>
          </div>
        </form>
      </div>
    </div>
  `;

  const closeModal = () => {
    modalRoot.innerHTML = "";
  };

  document.getElementById("btn-close-item-modal")?.addEventListener("click", closeModal);
  document.getElementById("btn-cancel-add-it")?.addEventListener("click", closeModal);

  document.getElementById("form-add-item")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const btn = document.getElementById("btn-submit-add-it");
    if (btn) {
      btn.disabled = true;
      btn.innerHTML = `<span class="spinner" style="width: 14px; height: 14px; border-width: 2px;"></span> Adding...`;
    }

    const payload = {
      item_name: document.getElementById("add-it-name")?.value.trim(),
      specifications: document.getElementById("add-it-spec")?.value.trim() || null,
      quantity: parseInt(document.getElementById("add-it-qty")?.value, 10),
      unit: document.getElementById("add-it-unit")?.value.trim() || "units",
      justification: document.getElementById("add-it-just")?.value.trim() || null
    };

    try {
      await api.post(`/api/v1/lab/requisitions/${requisitionId}/items`, payload);
      showToast("Line item added to draft requisition!", "success");
      closeModal();
      if (onAdded) onAdded();
    } catch (err) {
      console.error("Add line item error:", err);
      showToast(err.message || "Failed to add item", "error");
      if (btn) {
        btn.disabled = false;
        btn.innerHTML = `➕ Add Line Item`;
      }
    }
  });
}

// Modal: Detailed Lifecycle Stepper & Progression Actions
function openRequisitionDetailModal(req, onUpdated) {
  const modalRoot = document.getElementById("academic-modal-root");
  if (!modalRoot) return;

  const steps = [
    { key: "DRAFT", label: "Draft" },
    { key: "SUBMITTED", label: "Submitted" },
    { key: "UNDER_REVIEW", label: "Review" },
    { key: "APPROVED", label: "Approved" },
    { key: "ORDERED", label: "Ordered" },
    { key: "COMPLETED", label: "Completed" }
  ];

  const currentStatus = req.status;
  const isRejected = currentStatus === "REJECTED";

  // Map step index for progress
  let activeIndex = 0;
  if (currentStatus === "DRAFT") activeIndex = 0;
  else if (currentStatus === "SUBMITTED") activeIndex = 1;
  else if (currentStatus === "UNDER_REVIEW") activeIndex = 2;
  else if (currentStatus === "APPROVED") activeIndex = 3;
  else if (currentStatus === "REJECTED") activeIndex = 3;
  else if (currentStatus === "ORDERED") activeIndex = 4;
  else if (currentStatus === "COMPLETED") activeIndex = 5;

  modalRoot.innerHTML = `
    <div class="modal-backdrop active" id="modal-req-detail-backdrop">
      <div class="modal-dialog" style="max-width: 680px;" role="dialog" aria-modal="true" aria-labelledby="modal-req-detail-title">
        <div class="modal-header">
          <div>
            <div style="font-size: 11px; font-weight: 700; color: var(--text-muted); text-transform: uppercase;">Requisition Indent Lifecycle</div>
            <h3 id="modal-req-detail-title" style="margin: 2px 0 0 0; font-size: 18px; font-weight: 800;">
              ${escapeHtml(req.requisition_number)} &bull; ${escapeHtml(req.lab_name)}
            </h3>
          </div>
          <button class="btn-icon" id="btn-close-detail-modal" aria-label="Close" type="button">✕</button>
        </div>

        <div style="padding: 20px;">
          <!-- Visual Lifecycle Stepper -->
          <div class="lifecycle-stepper" style="margin-bottom: 24px;">
            <div class="stepper-line"></div>
            ${steps.map((st, idx) => {
              const isDone = !isRejected && idx < activeIndex;
              const isCurrent = !isRejected && idx === activeIndex;
              const isStepRejected = isRejected && st.key === "APPROVED";

              let stepClass = "";
              if (isDone) stepClass = "completed";
              if (isCurrent) stepClass = "active";
              if (isStepRejected) stepClass = "rejected";

              return `
                <div class="step-item ${stepClass}">
                  <div class="step-number" style="${isStepRejected ? 'background: var(--error); border-color: var(--error); color: #fff;' : ''}">
                    ${isStepRejected ? '✕' : (isDone ? '✓' : idx + 1)}
                  </div>
                  <div class="step-label" style="${isStepRejected ? 'color: var(--error); font-weight: 700;' : ''}">
                    ${isStepRejected ? 'Rejected' : st.label}
                  </div>
                </div>
              `;
            }).join("")}
          </div>

          <!-- Status Alert & Rejection Info -->
          <div style="margin-bottom: 16px; display: flex; justify-content: space-between; align-items: center; background: var(--surface-hover); padding: 12px 16px; border-radius: var(--radius-sm); border: 1px solid var(--border);">
            <div>
              <div style="font-size: 11px; color: var(--text-muted); text-transform: uppercase;">Current Operational State</div>
              <div style="font-size: 15px; font-weight: 800; color: var(--text); margin-top: 2px;">
                ${formatRequisitionStatusBadge(req.status)}
              </div>
            </div>
            <div style="text-align: right; font-size: 11px; color: var(--text-muted);">
              Lodged: ${formatDate(req.created_at)}
            </div>
          </div>

          ${isRejected ? `
            <div style="margin-bottom: 16px; background: rgba(239, 68, 68, 0.08); border-left: 4px solid var(--error); padding: 12px; border-radius: var(--radius-sm);">
              <div style="font-size: 12px; font-weight: 700; color: var(--error);">Decision: Requisition Disapproved</div>
              <div style="font-size: 13px; color: var(--text); margin-top: 4px;">
                <strong>Reason:</strong> ${escapeHtml(req.rejection_reason || 'Requisition does not comply with current workshop procurement budget.')}
              </div>
            </div>
          ` : ''}

          <!-- Line Items Table -->
          <div style="margin-bottom: 20px;">
            <div style="font-size: 12px; font-weight: 700; color: var(--text); margin-bottom: 8px;">
              Procurement Line Items (${req.items ? req.items.length : 0})
            </div>
            <div class="table-container">
              <table class="data-table">
                <thead>
                  <tr>
                    <th>Item Name</th>
                    <th>Specifications</th>
                    <th>Qty</th>
                    <th>Unit</th>
                    <th>Justification</th>
                  </tr>
                </thead>
                <tbody>
                  ${req.items && req.items.length > 0 ? req.items.map(it => `
                    <tr>
                      <td><strong>${escapeHtml(it.item_name)}</strong></td>
                      <td style="font-size: 12px; color: var(--text-secondary);">${escapeHtml(it.specifications || 'N/A')}</td>
                      <td><strong>${it.quantity}</strong></td>
                      <td>${escapeHtml(it.unit)}</td>
                      <td style="font-size: 12px; color: var(--text-muted);">${escapeHtml(it.justification || 'N/A')}</td>
                    </tr>
                  `).join("") : `
                    <tr><td colspan="5" style="text-align: center; color: var(--text-muted); padding: 16px;">No line items attached</td></tr>
                  `}
                </tbody>
              </table>
            </div>
          </div>

          <!-- Permitted Lifecycle Progression Actions -->
          <div style="border-top: 1px solid var(--border); padding-top: 16px; display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 8px;">
            <div style="font-size: 11px; color: var(--text-muted);">
              Available state transitions are controlled strictly by backend RBAC.
            </div>

            <div style="display: flex; gap: 8px; flex-wrap: wrap;">
              ${req.status === 'DRAFT' ? `
                <button class="btn btn-outline" id="btn-modal-add-item" type="button">
                  ➕ Add Item
                </button>
                <button class="btn btn-primary" id="btn-modal-submit" type="button">
                  🚀 Submit Indent
                </button>
              ` : ''}

              ${req.status === 'SUBMITTED' || req.status === 'UNDER_REVIEW' ? `
                <button class="btn btn-danger" id="btn-modal-reject" type="button">
                  ✕ Reject
                </button>
                <button class="btn btn-primary" id="btn-modal-approve" type="button">
                  ✓ Approve Indent
                </button>
              ` : ''}

              ${req.status === 'APPROVED' ? `
                <button class="btn btn-primary" id="btn-modal-order" type="button">
                  📦 Mark as Ordered
                </button>
              ` : ''}

              ${req.status === 'ORDERED' ? `
                <button class="btn btn-primary" id="btn-modal-complete" type="button">
                  ✓ Mark as Received & Completed
                </button>
              ` : ''}

              <button class="btn btn-secondary" id="btn-modal-close" type="button">
                Close
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  `;

  const closeModal = () => {
    modalRoot.innerHTML = "";
  };

  document.getElementById("btn-close-detail-modal")?.addEventListener("click", closeModal);
  document.getElementById("btn-modal-close")?.addEventListener("click", closeModal);

  // Transition: Submit Draft
  document.getElementById("btn-modal-submit")?.addEventListener("click", async () => {
    try {
      await api.post(`/api/v1/lab/requisitions/${req.id}/submit`);
      showToast("Requisition submitted for institutional review!", "success");
      closeModal();
      if (onUpdated) onUpdated();
    } catch (err) {
      showToast(err.message || "Failed to submit requisition", "error");
    }
  });

  // Add Item button
  document.getElementById("btn-modal-add-item")?.addEventListener("click", () => {
    closeModal();
    openAddRequisitionItemModal(req.id, onUpdated);
  });

  // Transition: Review (Approve)
  document.getElementById("btn-modal-approve")?.addEventListener("click", async () => {
    try {
      await api.post(`/api/v1/lab/requisitions/${req.id}/review`, {
        status: "APPROVED"
      });
      showToast("Requisition approved for procurement!", "success");
      closeModal();
      if (onUpdated) onUpdated();
    } catch (err) {
      showToast(err.message || "Failed to approve requisition", "error");
    }
  });

  // Transition: Review (Reject)
  document.getElementById("btn-modal-reject")?.addEventListener("click", async () => {
    const reason = prompt("Enter formal justification/reason for requisition rejection:");
    if (!reason || reason.trim() === "") {
      showToast("Rejection reason is required by backend validation", "warning");
      return;
    }
    try {
      await api.post(`/api/v1/lab/requisitions/${req.id}/review`, {
        status: "REJECTED",
        rejection_reason: reason.trim()
      });
      showToast("Requisition marked as Rejected with reason recorded", "info");
      closeModal();
      if (onUpdated) onUpdated();
    } catch (err) {
      showToast(err.message || "Failed to reject requisition", "error");
    }
  });

  // Transition: Move to Ordered
  document.getElementById("btn-modal-order")?.addEventListener("click", async () => {
    try {
      await api.post(`/api/v1/lab/requisitions/${req.id}/order`);
      showToast("Requisition moved to ORDERED status!", "success");
      closeModal();
      if (onUpdated) onUpdated();
    } catch (err) {
      showToast(err.message || "Failed to order requisition", "error");
    }
  });

  // Transition: Move to Completed
  document.getElementById("btn-modal-complete")?.addEventListener("click", async () => {
    try {
      await api.post(`/api/v1/lab/requisitions/${req.id}/complete`);
      showToast("Requisition received and COMPLETED!", "success");
      closeModal();
      if (onUpdated) onUpdated();
    } catch (err) {
      showToast(err.message || "Failed to complete requisition", "error");
    }
  });
}


/* --------------------------------------------------------------------------
   4. LAB NOTICES, PROFILE & NOTIFICATIONS
   -------------------------------------------------------------------------- */
export async function renderLabNotices(mainEl) {
  if (!mainEl) return;

  mainEl.innerHTML = `
    <div style="margin-bottom: 20px;">
      <div style="font-size: 12px; font-weight: 700; color: var(--primary); text-transform: uppercase;">
        Campus & Workshop Advisories
      </div>
      <h2 style="margin: 2px 0 0 0; font-size: 22px; font-weight: 800; color: var(--text);">
        📢 Institutional & Faculty Notices
      </h2>
      <p style="margin: 2px 0 0 0; font-size: 13px; color: var(--text-secondary);">
        Timetable modifications, lab access advisories, and campus schedules.
      </p>
    </div>

    <div id="lab-notices-container">
      <div class="state-container"><div class="spinner"></div></div>
    </div>
  `;

  try {
    const notices = await api.get("/api/v1/class-notices");
    const container = document.getElementById("lab-notices-container");
    if (!container) return;

    if (notices.length === 0) {
      container.innerHTML = `
        <div class="card">
          <div class="state-container" style="padding: 40px 20px;">
            <div class="state-icon">📢</div>
            <div class="state-title">No notices found</div>
            <div class="state-desc">There are no timetable or workshop notices at this time.</div>
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
                <div style="font-size: 15px; font-weight: 800; color: var(--text);">${escapeHtml(n.subject)}</div>
                <div style="font-size: 12px; color: var(--text-secondary); margin-top: 2px;">
                  Target: <strong>${escapeHtml(n.target_branch)}</strong> &bull; Year ${n.target_year} (Sec ${escapeHtml(n.target_section)})
                </div>
              </div>
              ${formatNoticeBadge(n.notice_type)}
            </div>
            <div style="font-size: 13px; color: var(--text); margin: 10px 0; background: var(--surface-hover); padding: 10px; border-radius: var(--radius-sm); border: 1px solid var(--border);">
              ${escapeHtml(n.details)}
            </div>
            <div style="font-size: 11px; color: var(--text-muted); display: flex; justify-content: space-between;">
              <span>📅 ${formatDate(n.class_date)} &bull; ${escapeHtml(n.period)}</span>
              <span>Published: ${timeAgo(n.created_at)}</span>
            </div>
          </div>
        `).join("")}
      </div>
    `;
  } catch (err) {
    document.getElementById("lab-notices-container")?.replaceChildren(
      document.createTextNode(`Unable to load notices: ${err.message}`)
    );
  }
}

export async function renderLabProfile(mainEl, user) {
  if (!mainEl) return;

  mainEl.innerHTML = `
    <div style="margin-bottom: 20px;">
      <div style="font-size: 12px; font-weight: 700; color: var(--primary); text-transform: uppercase;">
        Institutional Directory
      </div>
      <h2 style="margin: 2px 0 0 0; font-size: 22px; font-weight: 800; color: var(--text);">
        👤 Lab Assistant Profile
      </h2>
      <p style="margin: 2px 0 0 0; font-size: 13px; color: var(--text-secondary);">
        Authoritative staff profile from BPUT campus registry.
      </p>
    </div>

    <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 16px;">
      <div class="card" style="padding: 20px;">
        <div class="card-header" style="padding: 0 0 12px 0;">
          <div class="card-title">Staff Identity</div>
          <span class="status-badge approved">✓ Active Staff</span>
        </div>

        <div style="display: flex; align-items: center; gap: 16px; margin: 12px 0 16px 0;">
          <div class="account-avatar" style="width: 54px; height: 54px; font-size: 20px; font-weight: 800; background: var(--primary); color: #fff; border-radius: var(--radius-full); display: flex; align-items: center; justify-content: center;">
            ${(user.first_name || 'L')[0]}${(user.last_name || '')[0] || ''}
          </div>
          <div>
            <div style="font-size: 16px; font-weight: 800; color: var(--text);">${escapeHtml(user.first_name)} ${escapeHtml(user.last_name)}</div>
            <div style="font-size: 12px; color: var(--text-secondary); margin-top: 2px;">
              <span class="status-badge info">Workshop Lathe Assistant</span>
            </div>
          </div>
        </div>

        <div style="font-size: 13px; display: flex; flex-direction: column; gap: 12px; border-top: 1px solid var(--border); padding-top: 16px;">
          <div>
            <strong style="color: var(--text-muted); font-size: 11px; text-transform: uppercase;">Department</strong><br/>
            <span>Mechanical Engineering</span>
          </div>
          <div>
            <strong style="color: var(--text-muted); font-size: 11px; text-transform: uppercase;">Assigned Workshop ID</strong><br/>
            <span style="font-family: var(--font-family-mono);">LAB-MECH-LATHE-01</span>
          </div>
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
        </div>
      </div>

      <div class="card" style="padding: 20px;">
        <div class="card-header" style="padding: 0 0 12px 0;">
          <div class="card-title">Laboratory Governance & Security</div>
          <span class="status-badge approved">● Operational</span>
        </div>

        <div style="font-size: 13px; display: flex; flex-direction: column; gap: 12px; margin-top: 8px;">
          <div>
            <strong style="color: var(--text-muted); font-size: 11px; text-transform: uppercase;">Authentication Mode</strong><br/>
            <span>HS256 Cryptographic Bearer Token Session</span>
          </div>
          <div>
            <strong style="color: var(--text-muted); font-size: 11px; text-transform: uppercase;">Machinery Registry Permissions</strong><br/>
            <span class="status-badge approved" style="font-size: 11px;">✓ Equipment Registration & Status Updates Enabled</span>
          </div>
          <div>
            <strong style="color: var(--text-muted); font-size: 11px; text-transform: uppercase;">Procurement Requisitions Authority</strong><br/>
            <span class="status-badge approved" style="font-size: 11px;">✓ Indent Creation, Item Staging & State Progression Enabled</span>
          </div>
          <div>
            <strong style="color: var(--text-muted); font-size: 11px; text-transform: uppercase;">Architecture Baseline</strong><br/>
            <span>Vanilla PWA Shell &bull; Low-Bandwidth Campus Resilience</span>
          </div>
        </div>
      </div>
    </div>
  `;
}

export async function renderLabNotifications(mainEl) {
  renderAcademicNotificationsView(mainEl, "Laboratory & Workshop Notification Center");
}


/* --------------------------------------------------------------------------
   SHARED NOTIFICATIONS VIEW
   -------------------------------------------------------------------------- */
async function renderAcademicNotificationsView(mainEl, title) {
  if (!mainEl) return;

  mainEl.innerHTML = `
    <div style="margin-bottom: 20px;">
      <div style="font-size: 12px; font-weight: 700; color: var(--primary); text-transform: uppercase;">
        Transactional Alerts
      </div>
      <h2 style="margin: 2px 0 0 0; font-size: 22px; font-weight: 800; color: var(--text);">
        🔔 ${escapeHtml(title)}
      </h2>
      <p style="margin: 2px 0 0 0; font-size: 13px; color: var(--text-secondary);">
        Authoritative institutional updates, approval alerts, and schedule changes.
      </p>
    </div>

    <div id="academic-notifs-container">
      <div class="state-container"><div class="spinner"></div></div>
    </div>
  `;

  try {
    const data = await api.get("/api/v1/notifications");
    const container = document.getElementById("academic-notifs-container");
    if (!container) return;

    const notifs = data.notifications || [];

    if (notifs.length === 0) {
      container.innerHTML = `
        <div class="card">
          <div class="state-container" style="padding: 40px 20px;">
            <div class="state-icon">🔔</div>
            <div class="state-title">No notifications</div>
            <div class="state-desc">You are all caught up with your campus alerts.</div>
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
                  <button class="btn btn-sm btn-outline" onclick="window.markAcademicNotifRead('${escapeHtml(n.id)}')" type="button">
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
    document.getElementById("academic-notifs-container")?.replaceChildren(
      document.createTextNode(`Unable to load notifications: ${err.message}`)
    );
  }
}

window.markAcademicNotifRead = async function(id) {
  try {
    await api.patch(`/api/v1/notifications/${id}/read`);
    showToast("Notification marked as read", "success");
    const main = document.getElementById("app-main-content");
    if (main) {
      const hash = window.location.hash;
      if (hash === "#notifications") {
        renderAcademicNotificationsView(main, "Institutional Notification Center");
      }
    }
  } catch (err) {
    showToast(err.message || "Failed to mark read", "error");
  }
};
