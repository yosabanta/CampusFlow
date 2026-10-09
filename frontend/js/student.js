/**
 * CampusFlow MVP — Complete Student Experience Engine
 * Phase 8: Dashboard, Complaints, Help-a-Friend OTP, Gate Passes with One-Time QR,
 * Documents, Attendance, Class Notices, Study Materials, and Profile.
 */

import { api } from "./api.js";
import { store } from "./state.js";
import { showToast } from "./ui.js";
import { escapeHtml, formatDate, formatDateTime, timeAgo, getGreeting } from "./utils.js";

/* ==========================================================================
   LIVE OTP AUTHENTICATION DEMO STATE & RENDER ENGINE
   ========================================================================== */
function getStoredLiveOtpState() {
  try {
    const raw = sessionStorage.getItem("cf_live_otp_demo");
    if (raw) return JSON.parse(raw);
  } catch (e) {}
  return {
    stage: "waiting_input",
    studentId: "",
    studentMobile: "",
    generatedOtp: "",
    timestamp: "",
    isVerified: false,
    ticketNumber: ""
  };
}

let liveOtpDemoState = getStoredLiveOtpState();

export function updateLiveOtpDemoState(partial) {
  liveOtpDemoState = { ...liveOtpDemoState, ...partial };
  try {
    sessionStorage.setItem("cf_live_otp_demo", JSON.stringify(liveOtpDemoState));
  } catch (e) {}
  const panels = document.querySelectorAll(".live-otp-demo-panel-content");
  panels.forEach(p => {
    const isDashboard = p.getAttribute("data-is-dashboard") === "true";
    p.innerHTML = getLiveOtpDemoContent(liveOtpDemoState, isDashboard);
  });
}

export function getLiveOtpDemoContent(state, isDashboard = false) {
  const STAGES = [
    { key: "waiting_input", num: 1, label: "Waiting for mobile number" },
    { key: "otp_generated", num: 2, label: "OTP generated" },
    { key: "otp_entered", num: 3, label: "OTP entered" },
    { key: "otp_verified", num: 4, label: "OTP verified" },
    { key: "request_authorized", num: 5, label: "Request authorized" }
  ];

  const stageOrder = ["waiting_input", "otp_generated", "otp_entered", "otp_verified", "request_authorized"];
  const currentIdx = stageOrder.indexOf(state.stage);

  // Semantic Status Badge mapped to exact stage colors
  let statusBadge = "";
  if (state.stage === "request_authorized") {
    statusBadge = `<span class="status-badge" style="background: var(--color-lime-spark); color: var(--color-graphite); border: 1px solid #9FE814; font-weight: 800; padding: 4px 10px; box-shadow: 0 0 10px rgba(182, 255, 46, 0.45);">⚡ Request Authorized (${escapeHtml(state.ticketNumber || 'CMP-PROXY')})</span>`;
  } else if (state.isVerified || state.stage === "otp_verified") {
    statusBadge = `<span class="status-badge" style="background: var(--color-champagne); color: var(--color-emerald-ink); border: 1px solid var(--color-emerald-ink); font-weight: 800; padding: 4px 10px;">✓ OTP Verified</span>`;
  } else if (state.stage === "otp_entered") {
    statusBadge = `<span class="status-badge" style="background: rgba(106, 0, 244, 0.14); color: var(--color-ultra-violet); border: 1px solid var(--color-ultra-violet); font-weight: 800; padding: 4px 10px;">⟳ OTP Entered (Validating...)</span>`;
  } else if (state.stage === "otp_generated") {
    statusBadge = `<span class="status-badge" style="background: rgba(0, 87, 255, 0.12); color: var(--color-signal-blue); border: 1px solid var(--color-signal-blue); font-weight: 800; padding: 4px 10px;">✓ OTP Generated</span>`;
  } else {
    statusBadge = `<span class="status-badge neutral" style="background: rgba(35, 38, 47, 0.08); color: var(--color-graphite); border: 1px solid var(--border); font-weight: 700; padding: 4px 10px;">Waiting for mobile number</span>`;
  }

  // Stepper pill indicators mapped to exact stage palette:
  // 1: Waiting -> neutral Graphite/Porcelain
  // 2: OTP Generated -> Signal Blue #0057FF
  // 3: OTP Entered -> Ultra Violet #6A00F4
  // 4: OTP Verified -> Emerald Ink #064E3B (with Champagne)
  // 5: Request Authorized -> Lime Spark #B6FF2E
  const stepperHtml = STAGES.map((s, idx) => {
    let style = "background: var(--surface-hover); color: var(--text-muted); border: 1px solid var(--border);";
    let icon = s.num;

    if (idx < currentIdx || (idx <= 3 && state.isVerified)) {
      icon = "✓";
      style = "background: var(--color-champagne); color: var(--color-emerald-ink); border: 1px solid rgba(6, 78, 59, 0.35); font-weight: 700;";
    } else if (idx === currentIdx) {
      if (s.key === "waiting_input") {
        style = "background: var(--color-graphite); color: var(--color-porcelain); border: 1px solid var(--color-graphite); font-weight: 700;";
      } else if (s.key === "otp_generated") {
        style = "background: var(--color-signal-blue); color: #FFFFFF; border: 1px solid var(--color-signal-blue); font-weight: 700; box-shadow: 0 0 10px rgba(0, 87, 255, 0.4);";
      } else if (s.key === "otp_entered") {
        style = "background: var(--color-ultra-violet); color: #FFFFFF; border: 1px solid var(--color-ultra-violet); font-weight: 700; box-shadow: 0 0 10px rgba(106, 0, 244, 0.4);";
      } else if (s.key === "otp_verified") {
        style = "background: var(--color-emerald-ink); color: #FFFFFF; border: 1px solid var(--color-emerald-ink); font-weight: 700; box-shadow: 0 0 10px rgba(6, 78, 59, 0.4);";
      } else if (s.key === "request_authorized") {
        style = "background: var(--color-lime-spark); color: var(--color-graphite); border: 1px solid var(--color-lime-spark); font-weight: 800; box-shadow: 0 0 12px rgba(182, 255, 46, 0.6);";
      }
    }

    return `
      <div style="display: flex; align-items: center; gap: 5px; padding: 4px 10px; border-radius: 9999px; font-size: 11px; white-space: nowrap; ${style}">
        <span style="font-weight: 800; font-size: 10px;">${icon}</span>
        <span>${escapeHtml(s.label)}</span>
      </div>
    `;
  }).join('<span style="color: var(--border); font-size: 11px;">&rarr;</span>');

  // Dynamic OTP Display Box styling depending on stage
  let otpBoxStyle = "background: var(--surface); border: 1px solid var(--border);";
  let otpTextColor = "var(--text-muted)";
  if (state.stage === "request_authorized") {
    otpBoxStyle = "background: linear-gradient(135deg, var(--color-champagne) 0%, rgba(182, 255, 46, 0.25) 100%); border: 2px solid var(--color-emerald-ink); box-shadow: 0 0 12px rgba(182, 255, 46, 0.4);";
    otpTextColor = "var(--color-emerald-ink)";
  } else if (state.isVerified || state.stage === "otp_verified") {
    otpBoxStyle = "background: var(--color-champagne); border: 2px solid var(--color-emerald-ink); box-shadow: 0 0 10px rgba(6, 78, 59, 0.25);";
    otpTextColor = "var(--color-emerald-ink)";
  } else if (state.stage === "otp_entered") {
    otpBoxStyle = "background: rgba(106, 0, 244, 0.04); border: 2px solid var(--color-ultra-violet); box-shadow: 0 0 10px rgba(106, 0, 244, 0.2);";
    otpTextColor = "var(--color-ultra-violet)";
  } else if (state.stage === "otp_generated") {
    otpBoxStyle = "background: rgba(0, 87, 255, 0.04); border: 2px solid var(--color-signal-blue); box-shadow: 0 0 10px rgba(0, 87, 255, 0.25);";
    otpTextColor = "var(--color-signal-blue)";
  }

  return `
    <div style="display: flex; justify-content: space-between; align-items: flex-start; gap: 12px; flex-wrap: wrap;">
      <div>
        <div style="display: flex; align-items: center; gap: 8px;">
          <h3 style="font-size: 15px; font-weight: 800; color: var(--text); letter-spacing: -0.01em; margin: 0; display: flex; align-items: center; gap: 6px;">
            <span>🛡️</span> TWILIO VERIFY SMS TELEMETRY
          </h3>
          <span style="font-size: 10px; font-weight: 800; padding: 2px 8px; border-radius: 9999px; background: var(--color-butter-yellow); color: var(--color-graphite); border: 1px solid #E8DB5B; text-transform: uppercase;">
            Live Telemetry
          </span>
        </div>
        <p style="font-size: 12px; color: var(--text-secondary); margin: 3px 0 0 0;">
          Real-time Twilio Verify SMS two-factor authorization engine for proxy operations.
        </p>
      </div>
      ${isDashboard ? `
        <a href="#help-a-friend" class="btn btn-sm btn-primary" style="font-size: 12px; height: 32px;">
          Open Request on Behalf &rarr;
        </a>
      ` : ''}
    </div>

    <!-- Visual status indicators (5 stages) -->
    <div style="margin: 12px 0 14px 0; padding: 10px 0; border-top: 1px solid var(--border); border-bottom: 1px solid var(--border);">
      <div style="font-size: 11px; font-weight: 700; color: var(--text-muted); text-transform: uppercase; margin-bottom: 6px;">
        Authentication Pipeline:
      </div>
      <div style="display: flex; align-items: center; gap: 6px; overflow-x: auto; padding-bottom: 2px;">
        ${stepperHtml}
      </div>
    </div>

    <!-- Data Display Grid -->
    <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 16px; align-items: center;">
      <!-- Twilio Verify SMS Highlight Box -->
      <div style="${otpBoxStyle} border-radius: var(--radius-md); padding: 14px 18px; text-align: center; transition: all var(--transition-normal);">
        <div style="font-size: 11px; font-weight: 700; text-transform: uppercase; color: var(--text-muted); letter-spacing: 0.05em;">
          SMS Verification:
        </div>
        <div style="font-family: var(--font-family-mono); font-size: 1.8rem; font-weight: 800; letter-spacing: 0.12em; color: ${otpTextColor}; margin: 8px 0;">
          ${state.isVerified || state.stage === 'request_authorized' ? 'VERIFIED ✓' : (state.stage === 'otp_generated' || state.stage === 'otp_entered' ? 'SMS SENT ✉' : '— — — —')}
        </div>
        <div style="font-size: 11px; font-weight: 600; color: var(--text-secondary);">
          Twilio Verify v2 &bull; Carrier SMS Dispatch
        </div>
      </div>

      <!-- Metadata & Verification Status Details -->
      <div style="font-size: 13px; line-height: 1.8;">
        <div style="display: flex; justify-content: space-between; border-bottom: 1px dashed var(--border); padding-bottom: 4px; margin-bottom: 4px;">
          <span style="color: var(--text-muted);">Student ID:</span>
          <strong style="font-family: var(--font-family-mono); color: var(--text);">${escapeHtml(state.studentId || '—')}</strong>
        </div>
        <div style="display: flex; justify-content: space-between; border-bottom: 1px dashed var(--border); padding-bottom: 4px; margin-bottom: 4px;">
          <span style="color: var(--text-muted);">Student Mobile:</span>
          <strong style="font-family: var(--font-family-mono); color: var(--text);">${escapeHtml(state.studentMobile || 'Waiting for mobile number')}</strong>
        </div>
        <div style="display: flex; justify-content: space-between; border-bottom: 1px dashed var(--border); padding-bottom: 4px; margin-bottom: 4px;">
          <span style="color: var(--text-muted);">Status:</span>
          <span>${statusBadge}</span>
        </div>
        <div style="display: flex; justify-content: space-between; border-bottom: 1px dashed var(--border); padding-bottom: 4px; margin-bottom: 4px;">
          <span style="color: var(--text-muted);">Dispatched:</span>
          <strong style="font-family: var(--font-family-mono); color: var(--text);">${escapeHtml(state.timestamp || '—')}</strong>
        </div>
        <div style="display: flex; justify-content: space-between; align-items: center; margin-top: 6px;">
          <span style="color: var(--text-muted);">Verification Status:</span>
          ${state.isVerified ? `
            <span style="display: inline-block; padding: 3px 12px; background: var(--color-champagne); color: var(--color-emerald-ink); border: 1px solid var(--color-emerald-ink); border-radius: 9999px; font-weight: 800; font-size: 12px;">
              [ OTP Verified ✓ ]
            </span>
          ` : `
            <span style="display: inline-block; padding: 3px 12px; background: rgba(35, 38, 47, 0.08); color: var(--text-muted); border: 1px solid var(--border); border-radius: 9999px; font-weight: 600; font-size: 12px;">
              [ Pending Verification ]
            </span>
          `}
        </div>
      </div>
    </div>
  `;
}

/* ==========================================================================
   1. STUDENT DASHBOARD
   ========================================================================== */
export async function renderStudentDashboard(mainEl, user) {
  if (!mainEl) return;

  const accType = (user?.student_profile?.accommodation_type || "").trim().toUpperCase();
  const isHosteler = accType === "HOSTELER";

  // Initial loading layout with rich 60/20/10/10 palette harmony
  mainEl.innerHTML = `
    <!-- Hero Banner (Graphite #23262F & Night Violet #1E1033 with Signal Blue accent) -->
    <div class="card card-graphite" style="background: linear-gradient(135deg, var(--color-graphite) 0%, var(--color-night-violet) 100%); border-left: 5px solid var(--color-signal-blue); box-shadow: var(--shadow-md);">
      <div style="display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 12px;">
        <div>
          <h2 style="font-size: 1.35rem; color: #FFFFFF;">${escapeHtml(getGreeting(user.first_name))} 👋</h2>
          <p style="margin: 4px 0 0 0; font-size: 13px; color: #CBD2DE;">
            Student &bull; <strong style="color: #FFFFFF;">${escapeHtml(user.student_profile?.department || 'Engineering')}</strong> &bull; 
            Sem ${user.student_profile?.semester || 6}, Sec ${user.student_profile?.section || 'A'}
          </p>
        </div>
        <div style="display: flex; gap: 8px;">
          ${isHosteler ? `<a href="#gatepasses" class="btn btn-sm btn-primary" id="btn-hero-gatepass">+ Apply Gate Pass</a>` : ''}
          <a href="#complaints" class="btn btn-sm btn-secondary">+ New Complaint</a>
        </div>
      </div>
    </div>

    <!-- Quick Operational Actions -->
    <div style="margin-top: 24px;">
      <h3 style="font-size: 14px; font-weight: 700; color: var(--text); margin-bottom: 10px;">⚡ Quick Actions</h3>
      <div class="quick-actions-grid">
        <a href="#complaints" class="quick-action-card" id="qa-complaint">
          <div class="quick-action-icon accent-apricot">🛠️</div>
          <div>
            <div class="quick-action-title">Lodge Complaint</div>
            <div class="quick-action-desc">Report hostel, room or lab issue</div>
          </div>
        </a>
        ${isHosteler ? `
        <a href="#gatepasses" class="quick-action-card" id="qa-gatepass">
          <div class="quick-action-icon accent-blue">🎫</div>
          <div>
            <div class="quick-action-title">Apply Gate Pass</div>
            <div class="quick-action-desc">Local outing & leave requests</div>
          </div>
        </a>
        ` : ''}
        <a href="#help-a-friend" class="quick-action-card" id="qa-help-friend">
          <div class="quick-action-icon accent-lime">🤝</div>
          <div>
            <div class="quick-action-title">Request on Behalf</div>
            <div class="quick-action-desc">Emergency proxy with SMS OTP</div>
          </div>
        </a>
        <a href="#documents" class="quick-action-card" id="qa-documents">
          <div class="quick-action-icon accent-champagne">📄</div>
          <div>
            <div class="quick-action-title">Request Document</div>
            <div class="quick-action-desc">Bonafide & clearance certificates</div>
          </div>
        </a>
      </div>
    </div>

    <!-- Live OTP Authentication Demo Section (Integrated into Student Dashboard) -->
    <div class="card" id="dashboard-live-otp-demo" style="margin-top: 24px; border: 1px solid var(--border); border-top: 4px solid var(--color-ultra-violet); background: var(--surface); box-shadow: var(--shadow-sm);">
      <div class="live-otp-demo-panel-content" data-is-dashboard="true">
        ${getLiveOtpDemoContent(liveOtpDemoState, true)}
      </div>
    </div>

    <!-- Telemetry Cards Grid (Diverse Card Palette) -->
    <div id="student-telemetry-grid" style="display: grid; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); gap: 16px; margin-top: 24px;">
      <!-- Attendance Summary: Champagne + Emerald Ink -->
      <div class="card card-champagne" style="padding: 16px; border-left: 4px solid var(--color-emerald-ink);">
        <div style="font-size: 11px; font-weight: 700; color: var(--color-emerald-ink); text-transform: uppercase;">Attendance Summary</div>
        <div id="stat-attendance" style="font-size: 1.75rem; font-weight: 800; color: var(--color-emerald-ink); margin: 6px 0;">—</div>
        <div id="stat-attendance-sub" style="font-size: 11px; color: var(--text-secondary);">Loading lecture summary...</div>
      </div>
      <!-- Active Complaints: Soft Apricot + Graphite -->
      <div class="card card-apricot" style="padding: 16px; border-left: 4px solid var(--color-graphite);">
        <div style="font-size: 11px; font-weight: 700; color: var(--color-graphite); text-transform: uppercase;">Active Complaints</div>
        <div id="stat-complaints" style="font-size: 1.75rem; font-weight: 800; color: var(--color-graphite); margin: 6px 0;">—</div>
        <div id="stat-complaints-sub" style="font-size: 11px; color: var(--text-secondary);">Loading tickets...</div>
      </div>
      ${isHosteler ? `
      <!-- Gate Pass Status: Porcelain + Ultra Violet -->
      <div class="card card-porcelain" style="padding: 16px; border-left: 4px solid var(--color-ultra-violet);">
        <div style="font-size: 11px; font-weight: 700; color: var(--color-ultra-violet); text-transform: uppercase;">Gate Pass Status</div>
        <div id="stat-gatepass" style="font-size: 1.25rem; font-weight: 700; color: var(--color-ultra-violet); margin: 8px 0;">—</div>
        <div id="stat-gatepass-sub" style="font-size: 11px; color: var(--text-secondary);">Checking active passes...</div>
      </div>
      ` : ''}
      <!-- Unread Notifications: Surface + Dragonfruit -->
      <div class="card" style="padding: 16px; border-left: 4px solid var(--color-dragonfruit);">
        <div style="font-size: 11px; font-weight: 700; color: var(--color-dragonfruit); text-transform: uppercase;">Unread Notifications</div>
        <div id="stat-notifications" style="font-size: 1.75rem; font-weight: 800; color: var(--color-dragonfruit); margin: 6px 0;">—</div>
        <div id="stat-notifications-sub" style="font-size: 11px; color: var(--text-secondary);">Checking unread updates...</div>
      </div>
    </div>

    <!-- Live Content Dashboard Sections -->
    <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(320px, 1fr)); gap: 20px; margin-top: 24px;">
      ${isHosteler ? `
      <!-- Active Gate Pass Card -->
      <div class="card" id="dashboard-active-gatepass-card">
        <div class="card-header">
          <div class="card-title">🎫 Active Gate Pass</div>
          <a href="#gatepasses" style="font-size: 12px;">View All &rarr;</a>
        </div>
        <div id="dashboard-gatepass-content">
          <div class="state-container" style="padding: 24px;"><div class="spinner"></div></div>
        </div>
      </div>
      ` : ''}

      <!-- Recent Complaints Card -->
      <div class="card" id="dashboard-recent-complaints-card">
        <div class="card-header">
          <div class="card-title">🛠️ Recent Complaints</div>
          <a href="#complaints" style="font-size: 12px;">View All &rarr;</a>
        </div>
        <div id="dashboard-complaints-content">
          <div class="state-container" style="padding: 24px;"><div class="spinner"></div></div>
        </div>
      </div>
    </div>
  `;

  // Fetch real data in parallel from authoritative backend APIs
  loadStudentDashboardData();
}

async function loadStudentDashboardData() {
  // 1. Attendance
  try {
    const att = await api.get("/api/v1/attendance/my-attendance");
    const attPctEl = document.getElementById("stat-attendance");
    const attSubEl = document.getElementById("stat-attendance-sub");
    if (attPctEl) {
      attPctEl.textContent = `${att.attendance_percentage}%`;
      attPctEl.style.color = att.attendance_percentage >= 75 ? "var(--success)" : "var(--error)";
    }
    if (attSubEl) {
      attSubEl.textContent = `${att.present_count} Present, ${att.late_count} Late, ${att.absent_count} Absent (${att.total_sessions} Sessions)`;
    }
  } catch (err) {
    document.getElementById("stat-attendance")?.replaceChildren(document.createTextNode("N/A"));
    document.getElementById("stat-attendance-sub")?.replaceChildren(document.createTextNode("Attendance records unavailable"));
  }

  // 2. Complaints
  try {
    const complaints = await api.get("/api/v1/complaints");
    const activeComplaints = complaints.filter(c => ["OPEN", "ASSIGNED", "IN_PROGRESS", "REOPENED"].includes(c.status));
    const compCountEl = document.getElementById("stat-complaints");
    const compSubEl = document.getElementById("stat-complaints-sub");
    if (compCountEl) compCountEl.textContent = String(activeComplaints.length);
    if (compSubEl) compSubEl.textContent = `${complaints.length} Total tickets lodged`;

    renderDashboardComplaintsSnippet(complaints.slice(0, 3));
  } catch (err) {
    document.getElementById("stat-complaints")?.replaceChildren(document.createTextNode("—"));
    document.getElementById("stat-complaints-sub")?.replaceChildren(document.createTextNode("Failed to load complaints"));
  }

  // 3. Gate Passes (Hostel residents only)
  const currentUser = store.getState().user;
  const isHosteler = (currentUser?.student_profile?.accommodation_type || "").trim().toUpperCase() === "HOSTELER";

  if (isHosteler) {
    try {
      const passes = await api.get("/api/v1/gatepasses");
      const activePass = passes.find(p => ["PENDING", "APPROVED"].includes(p.status));
      const passStatEl = document.getElementById("stat-gatepass");
      const passSubEl = document.getElementById("stat-gatepass-sub");

      if (passStatEl) {
        if (activePass) {
          passStatEl.innerHTML = formatStatusBadge(activePass.status);
        } else {
          passStatEl.textContent = "No Active Pass";
        }
      }
      if (passSubEl) {
        passSubEl.textContent = activePass ? `To: ${activePass.destination}` : "You can apply for local outing or leave";
      }

      renderDashboardGatePassSnippet(activePass);
    } catch (err) {
      document.getElementById("stat-gatepass")?.replaceChildren(document.createTextNode("—"));
      document.getElementById("stat-gatepass-sub")?.replaceChildren(document.createTextNode("Failed to load gate pass"));
    }
  }

  // 4. Notifications
  try {
    const notifs = await api.get("/api/v1/notifications");
    const unreadEl = document.getElementById("stat-notifications");
    const unreadSubEl = document.getElementById("stat-notifications-sub");
    if (unreadEl) unreadEl.textContent = String(notifs.unread_count || 0);
    if (unreadSubEl) unreadSubEl.textContent = `${notifs.notifications?.length || 0} Total in-app notifications`;
  } catch {
    document.getElementById("stat-notifications")?.replaceChildren(document.createTextNode("—"));
  }
}

function renderDashboardGatePassSnippet(pass) {
  const container = document.getElementById("dashboard-gatepass-content");
  if (!container) return;

  if (!pass) {
    container.innerHTML = `
      <div class="state-container" style="padding: 24px;">
        <div style="font-size: 1.75rem;">🎫</div>
        <div class="state-title" style="font-size: 14px;">No Active Gate Pass</div>
        <div class="state-desc" style="font-size: 12px;">Planning to leave campus? Submit an outing pass for warden review.</div>
        <a href="#gatepasses" class="btn btn-sm btn-primary" style="margin-top: 10px;">Apply for Gate Pass</a>
      </div>
    `;
    return;
  }

  const isApproved = pass.status === "APPROVED";
  const hasQr = pass.qr_token && pass.qr_token.qr_data_uri;

  container.innerHTML = `
    <div style="display: flex; flex-direction: column; gap: 12px;">
      <div style="display: flex; justify-content: space-between; align-items: center;">
        <span style="font-family: var(--font-family-mono); font-size: 12px; font-weight: 700;">${escapeHtml(pass.pass_number)}</span>
        ${formatStatusBadge(pass.status)}
      </div>

      <div style="font-size: 13px;">
        <div><strong>Destination:</strong> ${escapeHtml(pass.destination)}</div>
        <div><strong>Out Time:</strong> ${formatDateTime(pass.out_time)}</div>
        <div><strong>Expected Return:</strong> ${formatDateTime(pass.expected_in_time)}</div>
      </div>

      ${isApproved && hasQr ? `
        <div style="text-align: center; margin: 8px 0; background: var(--surface-hover); padding: 12px; border-radius: var(--radius-md);">
          <img src="${pass.qr_token.qr_data_uri}" alt="One-time Gate Pass QR" style="width: 140px; height: 140px; margin: 0 auto; display: block; border-radius: var(--radius-sm); border: 2px solid var(--border);" />
          <div style="font-size: 11px; font-weight: 600; color: var(--primary); margin-top: 6px;">
            One-Time QR Token &bull; Scan at Security Gate
          </div>
        </div>
      ` : pass.status === 'PENDING' ? `
        <div class="status-badge pending" style="width: 100%; justify-content: center; padding: 8px;">
          ◷ Waiting for Warden Review & Decision
        </div>
      ` : ''}

      <div style="display: flex; justify-content: flex-end;">
        <a href="#gatepasses" class="btn btn-sm btn-outline">View Gate Pass Details</a>
      </div>
    </div>
  `;
}

function renderDashboardComplaintsSnippet(complaints) {
  const container = document.getElementById("dashboard-complaints-content");
  if (!container) return;

  if (!complaints || complaints.length === 0) {
    container.innerHTML = `
      <div class="state-container" style="padding: 24px;">
        <div style="font-size: 1.75rem;">✓</div>
        <div class="state-title" style="font-size: 14px;">No Complaints Logged</div>
        <div class="state-desc" style="font-size: 12px;">Everything running smoothly. Need maintenance assistance?</div>
        <a href="#complaints" class="btn btn-sm btn-secondary" style="margin-top: 10px;">Lodge a Complaint</a>
      </div>
    `;
    return;
  }

  container.innerHTML = `
    <div style="display: flex; flex-direction: column; gap: 8px;">
      ${complaints.map(c => `
        <div style="padding: 10px; background: var(--surface-hover); border-radius: var(--radius-md); border: 1px solid var(--border-subtle); display: flex; justify-content: space-between; align-items: center;">
          <div>
            <div style="font-size: 13px; font-weight: 600; color: var(--text);">${escapeHtml(c.title)}</div>
            <div style="font-size: 11px; color: var(--text-muted);">
              ${escapeHtml(c.ticket_number)} &bull; ${escapeHtml(c.location_details)}
            </div>
          </div>
          <div>${formatStatusBadge(c.status)}</div>
        </div>
      `).join("")}
    </div>
  `;
}


/* ==========================================================================
   2. STUDENT COMPLAINTS MANAGEMENT
   ========================================================================== */
export async function renderStudentComplaints(mainEl) {
  if (!mainEl) return;

  mainEl.innerHTML = `
    <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 12px; margin-bottom: 20px;">
      <div>
        <h2>🛠️ Maintenance & Campus Complaints</h2>
        <p style="margin: 2px 0 0 0; font-size: 13px; color: var(--text-secondary);">
          Report facility issues with SLA-backed tracking and direct staff assignment.
        </p>
      </div>
      <button id="btn-open-complaint-modal" class="btn btn-secondary" type="button">
        + Lodge New Complaint
      </button>
    </div>

    <!-- Filter Tabs -->
    <div class="filter-tabs" id="complaints-filter-tabs">
      <button class="filter-tab active" data-filter="ALL" type="button">All Tickets</button>
      <button class="filter-tab" data-filter="ACTIVE" type="button">Active / In Progress</button>
      <button class="filter-tab" data-filter="RESOLVED" type="button">Resolved / Closed</button>
    </div>

    <!-- Complaints List Container -->
    <div id="complaints-list-container" style="margin-top: 16px;">
      <div class="state-container"><div class="spinner"></div></div>
    </div>

    <!-- Modal Container for New Complaint -->
    <div id="complaint-modal-root"></div>
  `;

  document.getElementById("btn-open-complaint-modal")?.addEventListener("click", () => openNewComplaintModal());

  loadComplaintsList("ALL");

  document.querySelectorAll("#complaints-filter-tabs .filter-tab").forEach(tab => {
    tab.addEventListener("click", () => {
      document.querySelectorAll("#complaints-filter-tabs .filter-tab").forEach(t => t.classList.remove("active"));
      tab.classList.add("active");
      loadComplaintsList(tab.getAttribute("data-filter"));
    });
  });
}

let cachedComplaints = [];

async function loadComplaintsList(filter = "ALL") {
  const container = document.getElementById("complaints-list-container");
  if (!container) return;

  try {
    cachedComplaints = await api.get("/api/v1/complaints");
    let displayList = cachedComplaints;

    if (filter === "ACTIVE") {
      displayList = cachedComplaints.filter(c => ["OPEN", "ASSIGNED", "IN_PROGRESS", "REOPENED"].includes(c.status));
    } else if (filter === "RESOLVED") {
      displayList = cachedComplaints.filter(c => ["RESOLVED", "COMPLETED"].includes(c.status));
    }

    if (displayList.length === 0) {
      container.innerHTML = `
        <div class="card">
          <div class="state-container" style="padding: 40px 20px;">
            <div class="state-icon">📋</div>
            <div class="state-title">No complaints found</div>
            <div class="state-desc">You do not have any complaints in this category.</div>
            <button class="btn btn-primary" onclick="document.getElementById('btn-open-complaint-modal').click()" type="button" style="margin-top: 12px;">
              Lodge a Complaint
            </button>
          </div>
        </div>
      `;
      return;
    }

    container.innerHTML = `
      <div style="display: flex; flex-direction: column; gap: 12px;">
        ${displayList.map(c => {
          let cardClass = "card-status-normal";
          if (c.priority === 'URGENT') {
            cardClass = "card-status-urgent";
          } else if (c.status === 'RESOLVED' || c.status === 'COMPLETED') {
            cardClass = "card-status-resolved";
          } else if (c.status === 'PENDING' || c.status === 'OPEN' || c.status === 'ASSIGNED') {
            cardClass = "card-status-pending";
          }
          return `
          <div class="card ${cardClass}" style="padding: 16px; transition: transform var(--transition-fast);">
            <div style="display: flex; justify-content: space-between; align-items: flex-start; gap: 12px; flex-wrap: wrap;">
              <div>
                <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 4px;">
                  <span style="font-family: var(--font-family-mono); font-weight: 700; font-size: 12px; color: var(--color-signal-blue);">
                    ${escapeHtml(c.ticket_number)}
                  </span>
                  <span class="status-badge info" style="font-size: 10px;">${escapeHtml(c.category_id || 'GENERAL')}</span>
                  ${c.priority === 'URGENT' ? '<span class="status-badge special" style="font-size: 10px;">⚡ URGENT</span>' : ''}
                </div>
                <h4 style="font-size: 15px; font-weight: 700; color: var(--text);">${escapeHtml(c.title)}</h4>
                <p style="font-size: 13px; color: var(--text-secondary); margin: 4px 0 8px 0;">${escapeHtml(c.description)}</p>
                <div style="font-size: 11px; color: var(--text-muted); display: flex; gap: 12px; flex-wrap: wrap;">
                  <span>📍 ${escapeHtml(c.location_type)}: ${escapeHtml(c.location_details)}</span>
                  <span>📅 Lodged: ${formatDate(c.created_at)}</span>
                  ${c.sla_deadline ? `<span>⏰ SLA Target: ${formatDate(c.sla_deadline)}</span>` : ''}
                </div>
              </div>
              <div style="display: flex; flex-direction: column; align-items: flex-end; gap: 8px;">
                ${formatStatusBadge(c.status)}
                ${(c.status === 'RESOLVED' || c.status === 'COMPLETED') ? `
                  ${c.rating ? `
                    <div style="font-size: 12px; color: var(--color-butter-yellow); filter: drop-shadow(0 0 1px rgba(0,0,0,0.5));">
                      ${'★'.repeat(c.rating)}${'☆'.repeat(5 - c.rating)} (${c.rating}/5)
                    </div>
                  ` : `
                    <button class="btn btn-sm btn-attention" onclick="window.rateComplaintPrompt('${escapeHtml(c.id)}', '${escapeHtml(c.ticket_number)}')" type="button">
                      Rate Resolution
                    </button>
                  `}
                ` : ''}
              </div>
            </div>
          </div>
        `;}).join("")}
      </div>
    `;
  } catch (err) {
    container.innerHTML = `
      <div class="card">
        <div class="state-container" style="color: var(--error);">
          <div class="state-icon">⚠️</div>
          <div class="state-title">Unable to Load Complaints</div>
          <div class="state-desc">${escapeHtml(err.message)}</div>
          <button class="btn btn-outline" onclick="location.reload()" type="button" style="margin-top: 12px;">Retry</button>
        </div>
      </div>
    `;
  }
}

function openNewComplaintModal() {
  const root = document.getElementById("complaint-modal-root");
  if (!root) return;

  root.innerHTML = `
    <div class="modal-backdrop" id="complaint-modal" role="dialog" aria-modal="true" aria-labelledby="modal-comp-title">
      <div class="modal-dialog">
        <div class="modal-header">
          <div class="modal-title" id="modal-comp-title">🛠️ Lodge Maintenance Complaint</div>
          <button type="button" class="btn btn-sm btn-outline" id="btn-close-comp-modal" aria-label="Close dialog">✕</button>
        </div>
        <form id="form-new-complaint">
          <div class="modal-body">
            <div id="modal-complaint-alert" class="form-alert error"></div>

            <div class="form-group">
              <label class="form-label" for="comp-title">Complaint Title *</label>
              <input type="text" id="comp-title" class="form-input" placeholder="e.g. Geyser not working in 3rd floor bathroom" required minlength="3" maxlength="150" />
            </div>

            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px;">
              <div class="form-group">
                <label class="form-label" for="comp-category">Category *</label>
                <select id="comp-category" class="form-select" required>
                  <option value="ELECTRICAL">Electrical & Power</option>
                  <option value="PLUMBING">Plumbing & Water</option>
                  <option value="CARPENTRY">Carpentry & Furniture</option>
                  <option value="INTERNET">Internet & Wi-Fi</option>
                  <option value="CLEANLINESS">Sanitation & Hygiene</option>
                  <option value="ACADEMIC">Classroom & Lab</option>
                  <option value="OTHER">Other Issue</option>
                </select>
              </div>

              <div class="form-group">
                <label class="form-label" for="comp-priority">Priority</label>
                <select id="comp-priority" class="form-select">
                  <option value="NORMAL">Normal</option>
                  <option value="URGENT">Urgent / Emergency</option>
                </select>
              </div>
            </div>

            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px;">
              <div class="form-group">
                <label class="form-label" for="comp-location-type">Location Type *</label>
                <select id="comp-location-type" class="form-select" required>
                  <option value="HOSTEL">Hostel Residence</option>
                  <option value="DEPARTMENT">Academic Department</option>
                  <option value="LAB">Laboratory / Workshop</option>
                  <option value="CAMPUS">General Campus</option>
                </select>
              </div>

              <div class="form-group">
                <label class="form-label" for="comp-location-details">Exact Location *</label>
                <input type="text" id="comp-location-details" class="form-input" placeholder="e.g. Hostel B, Room 304" required maxlength="120" />
              </div>
            </div>

            <div class="form-group">
              <label class="form-label" for="comp-desc">Detailed Description *</label>
              <textarea id="comp-desc" class="form-textarea" rows="3" placeholder="Describe the issue clearly for the maintenance technician..." required minlength="5"></textarea>
            </div>
          </div>
          <div class="modal-footer">
            <button type="button" class="btn btn-outline" id="btn-cancel-comp">Cancel</button>
            <button type="submit" class="btn btn-primary" id="btn-submit-comp">Submit Complaint</button>
          </div>
        </form>
      </div>
    </div>
  `;

  const closeModal = () => root.replaceChildren();
  document.getElementById("btn-close-comp-modal")?.addEventListener("click", closeModal);
  document.getElementById("btn-cancel-comp")?.addEventListener("click", closeModal);

  document.getElementById("form-new-complaint")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const alertEl = document.getElementById("modal-complaint-alert");
    const submitBtn = document.getElementById("btn-submit-comp");
    if (alertEl) alertEl.classList.remove("visible");

    submitBtn.disabled = true;
    submitBtn.textContent = "Submitting...";

    try {
      const payload = {
        title: document.getElementById("comp-title").value.trim(),
        category_id: document.getElementById("comp-category").value,
        priority: document.getElementById("comp-priority").value,
        location_type: document.getElementById("comp-location-type").value,
        location_details: document.getElementById("comp-location-details").value.trim(),
        description: document.getElementById("comp-desc").value.trim()
      };

      const res = await api.post("/api/v1/complaints", payload);
      closeModal();
      showToast(`Complaint lodged successfully! Ticket #${res.ticket_number}`, "success");
      loadComplaintsList("ALL");
    } catch (err) {
      if (alertEl) {
        alertEl.textContent = err.message || "Failed to submit complaint.";
        alertEl.classList.add("visible");
      }
      submitBtn.disabled = false;
      submitBtn.textContent = "Submit Complaint";
    }
  });
}

// Global rating prompt attached to window for direct click handler
window.rateComplaintPrompt = function(complaintId, ticketNumber) {
  const root = document.getElementById("complaint-modal-root");
  if (!root) return;

  root.innerHTML = `
    <div class="modal-backdrop" role="dialog" aria-modal="true">
      <div class="modal-dialog" style="max-width: 420px; text-align: center;">
        <div class="modal-header">
          <div class="modal-title">⭐ Rate Resolution: ${escapeHtml(ticketNumber)}</div>
          <button type="button" class="btn btn-sm btn-outline" id="btn-close-rate">✕</button>
        </div>
        <div class="modal-body" style="padding: 24px;">
          <p style="font-size: 13px; color: var(--text-secondary); margin-bottom: 16px;">
            How satisfied are you with the speed and quality of this maintenance resolution?
          </p>
          <div class="star-rating" id="star-rating-wrap">
            <button type="button" class="star-btn" data-val="1">★</button>
            <button type="button" class="star-btn" data-val="2">★</button>
            <button type="button" class="star-btn" data-val="3">★</button>
            <button type="button" class="star-btn" data-val="4">★</button>
            <button type="button" class="star-btn active" data-val="5">★</button>
          </div>
          <div id="rating-selected-val" style="font-size: 14px; font-weight: 700; margin-top: 8px; color: #F59E0B;">
            5 / 5 Stars &mdash; Excellent
          </div>
        </div>
        <div class="modal-footer" style="justify-content: center;">
          <button type="button" class="btn btn-primary" id="btn-submit-rating">Submit Rating & Close Ticket</button>
        </div>
      </div>
    </div>
  `;

  let selectedRating = 5;
  const ratingWrap = document.getElementById("star-rating-wrap");
  const ratingText = document.getElementById("rating-selected-val");

  const ratingLabels = {
    1: "1 / 5 Stars — Unsatisfactory",
    2: "2 / 5 Stars — Needs Improvement",
    3: "3 / 5 Stars — Satisfactory",
    4: "4 / 5 Stars — Good",
    5: "5 / 5 Stars — Excellent"
  };

  ratingWrap?.querySelectorAll(".star-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      selectedRating = parseInt(btn.getAttribute("data-val"), 10);
      ratingWrap.querySelectorAll(".star-btn").forEach(b => {
        const val = parseInt(b.getAttribute("data-val"), 10);
        b.classList.toggle("active", val <= selectedRating);
      });
      if (ratingText) ratingText.textContent = ratingLabels[selectedRating];
    });
  });

  const closeModal = () => root.replaceChildren();
  document.getElementById("btn-close-rate")?.addEventListener("click", closeModal);

  document.getElementById("btn-submit-rating")?.addEventListener("click", async () => {
    try {
      await api.post(`/api/v1/complaints/${complaintId}/rate`, { rating: selectedRating });
      closeModal();
      showToast("Thank you for your rating! Feedback recorded.", "success");
      loadComplaintsList("ALL");
    } catch (err) {
      showToast(err.message || "Failed to submit rating.", "error");
    }
  });
};


/* ==========================================================================
   3. REQUEST ON BEHALF / HELP A FRIEND (3-STEP WIZARD WITH LIVE OTP DEMO)
   ========================================================================== */
export function renderStudentHelpAFriend(mainEl) {
  if (!mainEl) return;

  mainEl.innerHTML = `
    <div style="max-width: 680px; margin: 0 auto;">
      <div style="margin-bottom: 20px;">
        <h2>🤝 Request on Behalf (Help-a-Friend)</h2>
        <p style="font-size: 13px; color: var(--text-secondary); margin-top: 4px;">
          Lodge an emergency complaint or facility request on behalf of a peer who has a basic feature phone or lacks smartphone connectivity.
        </p>
      </div>

      <!-- Stepper Progress Navigation -->
      <div class="stepper-nav" id="help-stepper">
        <div class="step-item active" id="step-node-1">
          <div class="step-number">1</div>
          <div class="step-label">Beneficiary</div>
        </div>
        <div class="step-item" id="step-node-2">
          <div class="step-number">2</div>
          <div class="step-label">SMS OTP</div>
        </div>
        <div class="step-item" id="step-node-3">
          <div class="step-number">3</div>
          <div class="step-label">Complaint</div>
        </div>
        <div class="step-item" id="step-node-4">
          <div class="step-number">✓</div>
          <div class="step-label">Confirmation</div>
        </div>
      </div>

      <!-- Dynamic Step Card Container -->
      <div class="card" id="help-step-content" style="padding: 28px;"></div>

      <!-- Live OTP Authentication Demo Section (Integrated into Flow) -->
      <div class="card" id="flow-live-otp-demo" style="margin-top: 24px; border: 1px solid var(--border); border-top: 4px solid var(--color-ultra-violet); background: var(--surface); box-shadow: var(--shadow-sm);">
        <div class="live-otp-demo-panel-content" data-is-dashboard="false">
          ${getLiveOtpDemoContent(liveOtpDemoState, false)}
        </div>
      </div>
    </div>
  `;

  // Initialize Step 1
  renderHelpStep1();
}

let helpFriendState = {
  beneficiaryRoll: "",
  studentMobile: "",
  maskedPhone: "",
  demoOtp: "",
  otpVerificationId: null,
  complaintResult: null
};

function updateHelpStepper(activeStep) {
  for (let i = 1; i <= 4; i++) {
    const node = document.getElementById(`step-node-${i}`);
    if (!node) continue;
    node.classList.remove("active", "completed");
    if (i < activeStep) node.classList.add("completed");
    else if (i === activeStep) node.classList.add("active");
  }
}

function renderHelpStep1() {
  updateHelpStepper(1);
  const container = document.getElementById("help-step-content");
  if (!container) return;

  container.innerHTML = `
    <h3 style="font-size: 16px; margin-bottom: 6px;">Step 1: Student Verification</h3>
    <p style="font-size: 13px; color: var(--text-secondary); margin-bottom: 20px;">
      Enter the student ID and registered mobile number of the person you are assisting. A secure 6-digit SMS verification code will be dispatched to their phone via Twilio Verify.
    </p>

    <div id="help-step1-alert" class="form-alert error"></div>

    <form id="form-help-step1">
      <div class="form-group">
        <label class="form-label" for="beneficiary-roll">
          Student ID *
          <span class="form-label-desc">College Roll No., University Reg. No., or Email</span>
        </label>
        <input 
          type="text" 
          id="beneficiary-roll" 
          class="form-input" 
          placeholder="e.g. 33, 2501289157, or roll/reg no." 
          value="${escapeHtml(helpFriendState.beneficiaryRoll || '')}" 
          required 
        />
      </div>

      <div class="form-group">
        <label class="form-label" for="beneficiary-mobile">
          Student Mobile Number *
          <span class="form-label-desc">Enter the mobile number of the student who wants to submit the request</span>
        </label>
        <input 
          type="tel" 
          id="beneficiary-mobile" 
          class="form-input" 
          placeholder="e.g. 9876543210" 
          value="${escapeHtml(helpFriendState.studentMobile || '')}" 
          required 
        />
      </div>

      <div style="background: var(--surface-hover); padding: 12px; border-radius: var(--radius-md); font-size: 12px; color: var(--text-secondary); margin-bottom: 20px;">
        🔒 <strong>Security Policy:</strong> The SMS OTP code is time-limited (valid for 10 minutes), single-use only, and dispatched securely via Twilio Verify to protect user privacy.
      </div>

      <div style="display: flex; justify-content: flex-end;">
        <button type="submit" id="btn-help-step1" class="btn btn-secondary" style="height: 40px;">
          <span>Send Twilio SMS OTP &rarr;</span>
        </button>
      </div>
    </form>
  `;

  document.getElementById("form-help-step1")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const rollInput = document.getElementById("beneficiary-roll").value.trim();
    const mobileInput = document.getElementById("beneficiary-mobile").value.trim();
    const alertEl = document.getElementById("help-step1-alert");
    const btn = document.getElementById("btn-help-step1");
    if (alertEl) alertEl.classList.remove("visible");

    btn.disabled = true;
    btn.textContent = "Dispatching Twilio SMS...";

    try {
      const res = await api.post("/api/v1/help-a-friend/initiate", {
        beneficiary_roll_number: rollInput,
        student_mobile_number: mobileInput
      });

      helpFriendState.beneficiaryRoll = res.beneficiary_roll_number;
      helpFriendState.studentMobile = mobileInput;
      helpFriendState.maskedPhone = res.masked_phone;
      helpFriendState.demoOtp = res.demo_otp || null;

      // Update Live OTP Demo State with Twilio Verify status
      updateLiveOtpDemoState({
        stage: "otp_generated",
        studentId: res.beneficiary_roll_number,
        studentMobile: mobileInput,
        generatedOtp: res.demo_otp ? "DEMO FALLBACK" : "SMS SENT",
        timestamp: res.generated_at || new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
        isVerified: false
      });

      showToast(`Verification SMS dispatched via Twilio to ${res.masked_phone || mobileInput}`, "info");
      renderHelpStep2();
    } catch (err) {
      if (alertEl) {
        alertEl.textContent = err.message || "Failed to initiate request on behalf.";
        alertEl.classList.add("visible");
      }
      btn.disabled = false;
      btn.textContent = "Send Twilio SMS OTP →";
    }
  });
}

function renderHelpStep2() {
  updateHelpStepper(2);
  const container = document.getElementById("help-step-content");
  if (!container) return;

  container.innerHTML = `
    <h3 style="font-size: 16px; margin-bottom: 6px;">Step 2: Verify 6-Digit SMS OTP</h3>
    <p style="font-size: 13px; color: var(--text-secondary); margin-bottom: 16px;">
      A verification code has been dispatched via Twilio SMS to <strong>${escapeHtml(helpFriendState.studentMobile || helpFriendState.maskedPhone)}</strong> (Student ID: ${escapeHtml(helpFriendState.beneficiaryRoll)}). Ask your peer for the 6-digit verification code received on their mobile phone.
    </p>

    ${helpFriendState.demoOtp ? `
      <div style="background: var(--surface-hover); border-left: 4px solid var(--warning); padding: 8px 12px; margin-bottom: 16px; border-radius: var(--radius-sm); font-size: 12px; color: var(--text);">
        ⚠️ <strong>${escapeHtml(helpFriendState.demoOtp)}</strong> (Demo Mode Fallback explicitly enabled on server)
      </div>
    ` : ''}

    <div id="help-step2-alert" class="form-alert error"></div>

    <form id="form-help-step2">
      <div class="form-group" style="max-width: 320px; margin: 0 auto 20px auto; text-align: center;">
        <label class="form-label" for="otp-code" style="justify-content: center; margin-bottom: 8px;">
          Enter 6-Digit SMS OTP Code *
        </label>
        <input 
          type="text" 
          id="otp-code" 
          class="form-input text-center" 
          maxlength="6" 
          pattern="[0-9]{6}" 
          inputmode="numeric" 
          placeholder="• • • • • •" 
          style="font-size: 1.5rem; letter-spacing: 0.3em; font-family: var(--font-family-mono);" 
          required 
          autofocus 
        />
        <div style="font-size: 11px; color: var(--text-muted); margin-top: 6px;">
          Valid for 10 minutes &bull; Dispatched via Twilio Verify Service
        </div>
      </div>

      <div style="display: flex; justify-content: space-between; align-items: center;">
        <button type="button" class="btn btn-outline" id="btn-back-step1">&larr; Change Details</button>
        <button type="submit" id="btn-help-step2" class="btn btn-success" style="height: 40px;">
          <span>Verify SMS Code &rarr;</span>
        </button>
      </div>
    </form>
  `;

  // Status indicator updates when student enters/types OTP
  const otpInput = document.getElementById("otp-code");
  otpInput?.addEventListener("input", (e) => {
    if (e.target.value.length > 0 && !liveOtpDemoState.isVerified) {
      updateLiveOtpDemoState({ stage: "otp_entered" });
    }
  });

  document.getElementById("btn-back-step1")?.addEventListener("click", () => renderHelpStep1());

  document.getElementById("form-help-step2")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const otpCode = document.getElementById("otp-code").value.trim();
    const alertEl = document.getElementById("help-step2-alert");
    const btn = document.getElementById("btn-help-step2");
    if (alertEl) alertEl.classList.remove("visible");

    btn.disabled = true;
    btn.textContent = "Verifying with Twilio...";

    try {
      const res = await api.post("/api/v1/help-a-friend/verify-otp", {
        beneficiary_roll_number: helpFriendState.beneficiaryRoll,
        otp_code: otpCode
      });

      helpFriendState.otpVerificationId = res.otp_verification_id;

      // Update Live OTP Demo State to Verified
      updateLiveOtpDemoState({
        stage: "otp_verified",
        isVerified: true
      });

      showToast("OTP verified successfully! Request on Behalf authorized.", "success");
      renderHelpStep3();
    } catch (err) {
      if (alertEl) {
        alertEl.textContent = err.message || "Invalid or expired OTP code.";
        alertEl.classList.add("visible");
      }
      btn.disabled = false;
      btn.textContent = "Verify SMS Code →";
    }
  });
}

function renderHelpStep3() {
  updateHelpStepper(3);
  const container = document.getElementById("help-step-content");
  if (!container) return;

  container.innerHTML = `
    <h3 style="font-size: 16px; margin-bottom: 6px;">Step 3: Lodge Complaint on Behalf of Peer</h3>
    <p style="font-size: 13px; color: var(--text-secondary); margin-bottom: 16px;">
      Verified authorization active for beneficiary: <strong>${escapeHtml(helpFriendState.beneficiaryRoll)}</strong> (${escapeHtml(helpFriendState.studentMobile)}). Enter the issue details below.
    </p>

    <div id="help-step3-alert" class="form-alert error"></div>

    <form id="form-help-step3">
      <div class="form-group">
        <label class="form-label" for="proxy-comp-title">Complaint Title *</label>
        <input type="text" id="proxy-comp-title" class="form-input" placeholder="e.g. Fan burning smell in Hostel B Room 108" required minlength="3" maxlength="150" />
      </div>

      <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px;">
        <div class="form-group">
          <label class="form-label" for="proxy-comp-category">Category *</label>
          <select id="proxy-comp-category" class="form-select" required>
            <option value="ELECTRICAL">Electrical & Power</option>
            <option value="PLUMBING">Plumbing & Water</option>
            <option value="CARPENTRY">Carpentry & Furniture</option>
            <option value="INTERNET">Internet & Wi-Fi</option>
            <option value="CLEANLINESS">Sanitation & Hygiene</option>
            <option value="ACADEMIC">Classroom & Lab</option>
            <option value="OTHER">Other Issue</option>
          </select>
        </div>

        <div class="form-group">
          <label class="form-label" for="proxy-comp-priority">Priority</label>
          <select id="proxy-comp-priority" class="form-select">
            <option value="NORMAL">Normal</option>
            <option value="URGENT">Urgent / Emergency</option>
          </select>
        </div>
      </div>

      <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px;">
        <div class="form-group">
          <label class="form-label" for="proxy-comp-loc-type">Location Type *</label>
          <select id="proxy-comp-loc-type" class="form-select" required>
            <option value="HOSTEL">Hostel Residence</option>
            <option value="DEPARTMENT">Academic Department</option>
            <option value="CAMPUS">General Campus</option>
          </select>
        </div>

        <div class="form-group">
          <label class="form-label" for="proxy-comp-loc-details">Exact Location *</label>
          <input type="text" id="proxy-comp-loc-details" class="form-input" placeholder="e.g. Hostel Block B, Room 108" required maxlength="120" />
        </div>
      </div>

      <div class="form-group">
        <label class="form-label" for="proxy-comp-desc">Detailed Description *</label>
        <textarea id="proxy-comp-desc" class="form-textarea" rows="3" placeholder="Describe the problem accurately..." required minlength="5"></textarea>
      </div>

      <div style="display: flex; justify-content: flex-end;">
        <button type="submit" id="btn-help-step3" class="btn btn-primary" style="height: 40px;">
          <span>Submit Peer Complaint &rarr;</span>
        </button>
      </div>
    </form>
  `;

  document.getElementById("form-help-step3")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const alertEl = document.getElementById("help-step3-alert");
    const btn = document.getElementById("btn-help-step3");
    if (alertEl) alertEl.classList.remove("visible");

    btn.disabled = true;
    btn.textContent = "Filing Proxy Ticket...";

    try {
      const complaintPayload = {
        title: document.getElementById("proxy-comp-title").value.trim(),
        category_id: document.getElementById("proxy-comp-category").value,
        priority: document.getElementById("proxy-comp-priority").value,
        location_type: document.getElementById("proxy-comp-loc-type").value,
        location_details: document.getElementById("proxy-comp-loc-details").value.trim(),
        description: document.getElementById("proxy-comp-desc").value.trim()
      };

      const result = await api.post("/api/v1/help-a-friend/submit", {
        otp_verification_id: helpFriendState.otpVerificationId,
        complaint: complaintPayload
      });

      helpFriendState.complaintResult = result;

      // Update Live OTP Demo State to Request Authorized
      updateLiveOtpDemoState({
        stage: "request_authorized",
        ticketNumber: result.ticket_number
      });

      showToast(`Proxy complaint lodged! Ticket #${result.ticket_number}`, "success");
      renderHelpStep4();
    } catch (err) {
      if (alertEl) {
        alertEl.textContent = err.message || "Failed to submit proxy complaint.";
        alertEl.classList.add("visible");
      }
      btn.disabled = false;
      btn.textContent = "Submit Peer Complaint →";
    }
  });
}

function renderHelpStep4() {
  updateHelpStepper(4);
  const container = document.getElementById("help-step-content");
  if (!container) return;

  const res = helpFriendState.complaintResult;

  container.innerHTML = `
    <div class="state-container" style="padding: 20px 0;">
      <div class="state-icon" style="color: var(--success); font-size: 3rem;">✓</div>
      <h3 style="font-size: 1.25rem; font-weight: 700; color: var(--text);">
        Emergency Proxy Complaint Successfully Lodged!
      </h3>
      <p style="font-size: 13px; color: var(--text-secondary); max-width: 480px;">
        The maintenance request has been recorded on behalf of beneficiary <strong>${escapeHtml(helpFriendState.beneficiaryRoll)}</strong> (${escapeHtml(helpFriendState.studentMobile)}). An automated confirmation SMS notification has been triggered for their phone.
      </p>

      <div style="background: var(--surface-hover); border: 1px solid var(--border); border-radius: var(--radius-md); padding: 16px; margin: 16px 0; width: 100%; max-width: 440px; text-align: left; font-size: 13px;">
        <div style="display: flex; justify-content: space-between; margin-bottom: 6px;">
          <span style="color: var(--text-muted);">Ticket Number:</span>
          <strong style="font-family: var(--font-family-mono); color: var(--primary);">${escapeHtml(res?.ticket_number || 'CMP-PROXY')}</strong>
        </div>
        <div style="display: flex; justify-content: space-between; margin-bottom: 6px;">
          <span style="color: var(--text-muted);">Beneficiary Roll:</span>
          <strong>${escapeHtml(helpFriendState.beneficiaryRoll)}</strong>
        </div>
        <div style="display: flex; justify-content: space-between; margin-bottom: 6px;">
          <span style="color: var(--text-muted);">Status:</span>
          <span class="status-badge pending">${escapeHtml(res?.status || 'OPEN')}</span>
        </div>
        <div style="display: flex; justify-content: space-between;">
          <span style="color: var(--text-muted);">Audit Trail:</span>
          <span>Logged with OTP ID</span>
        </div>
      </div>

      <div style="display: flex; gap: 12px; margin-top: 12px;">
        <a href="#complaints" class="btn btn-primary">View Complaints Ledger</a>
        <button type="button" class="btn btn-outline" id="btn-another-help">File Another Request</button>
      </div>
    </div>
  `;

  document.getElementById("btn-another-help")?.addEventListener("click", () => {
    helpFriendState = { beneficiaryRoll: "", studentMobile: "", maskedPhone: "", demoOtp: "", otpVerificationId: null, complaintResult: null };
    updateLiveOtpDemoState({
      stage: "waiting_input",
      studentId: "",
      studentMobile: "",
      generatedOtp: "",
      timestamp: "",
      isVerified: false,
      ticketNumber: ""
    });
    renderHelpStep1();
  });
}


/* ==========================================================================
   4. GATE PASS & ONE-TIME QR SYSTEM
   ========================================================================== */
export async function renderStudentGatePasses(mainEl) {
  if (!mainEl) return;

  const currentUser = store.getState().user;
  const accType = (currentUser?.student_profile?.accommodation_type || "").trim().toUpperCase();
  const isHosteler = accType === "HOSTELER";

  if (!isHosteler) {
    mainEl.innerHTML = `
      <div style="margin-bottom: 20px;">
        <h2>🎫 Gate Pass & One-Time QR System</h2>
        <p style="margin: 2px 0 0 0; font-size: 13px; color: var(--text-secondary);">
          Request campus leaves, track warden decisions, and display single-use QR passes at security gates.
        </p>
      </div>

      <div class="card" style="text-align: center; padding: 48px 24px; border-left: 4px solid var(--color-signal-blue);">
        <div style="font-size: 3rem; margin-bottom: 16px;">🏠</div>
        <h3 style="font-size: 1.25rem; font-weight: 700; color: var(--text); margin-bottom: 8px;">
          Gate Pass is Available Only to Hostel Residents
        </h3>
        <p style="max-width: 540px; margin: 0 auto 20px auto; color: var(--text-secondary); font-size: 14px; line-height: 1.5;">
          Your current registered student accommodation is <strong>Day Scholar</strong>. Institutional gate passes and overnight outings are reserved exclusively for students residing in campus hostels.
        </p>
        <div style="display: flex; gap: 12px; justify-content: center;">
          <a href="#dashboard" class="btn btn-secondary">Return to Dashboard</a>
          <a href="#complaints" class="btn btn-outline">Lodge a General Request</a>
        </div>
      </div>
    `;
    return;
  }

  mainEl.innerHTML = `
    <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 12px; margin-bottom: 20px;">
      <div>
        <h2>🎫 Gate Pass & One-Time QR System</h2>
        <p style="margin: 2px 0 0 0; font-size: 13px; color: var(--text-secondary);">
          Request campus leaves, track warden decisions, and display single-use QR passes at security gates.
        </p>
      </div>
      <button id="btn-open-gatepass-modal" class="btn btn-primary" type="button">
        + Apply for Gate Pass
      </button>
    </div>

    <!-- Filter Tabs -->
    <div class="filter-tabs" id="gp-filter-tabs">
      <button class="filter-tab active" data-filter="ALL" type="button">All Passes</button>
      <button class="filter-tab" data-filter="ACTIVE" type="button">Active / Approved</button>
      <button class="filter-tab" data-filter="HISTORY" type="button">Completed / Expired</button>
    </div>

    <!-- Active Gate Pass Highlight Container -->
    <div id="active-gp-highlight" style="margin-top: 16px;"></div>

    <!-- All Gate Passes Ledger -->
    <div id="gatepasses-list-container" style="margin-top: 16px;">
      <div class="state-container"><div class="spinner"></div></div>
    </div>

    <!-- Modal Container for Apply Gate Pass -->
    <div id="gatepass-modal-root"></div>
  `;

  document.getElementById("btn-open-gatepass-modal")?.addEventListener("click", () => openApplyGatePassModal());

  loadGatePassesList("ALL");

  document.querySelectorAll("#gp-filter-tabs .filter-tab").forEach(tab => {
    tab.addEventListener("click", () => {
      document.querySelectorAll("#gp-filter-tabs .filter-tab").forEach(t => t.classList.remove("active"));
      tab.classList.add("active");
      loadGatePassesList(tab.getAttribute("data-filter"));
    });
  });
}

async function loadGatePassesList(filter = "ALL") {
  const container = document.getElementById("gatepasses-list-container");
  const highlightEl = document.getElementById("active-gp-highlight");
  if (!container) return;

  try {
    const passes = await api.get("/api/v1/gatepasses");
    let displayList = passes;

    if (filter === "ACTIVE") {
      displayList = passes.filter(p => ["PENDING", "APPROVED", "CHECKED_OUT"].includes(p.status));
    } else if (filter === "HISTORY") {
      displayList = passes.filter(p => ["COMPLETED", "REJECTED", "OVERDUE"].includes(p.status));
    }

    // Check for approved active pass with QR
    const approvedPass = passes.find(p => p.status === "APPROVED" && p.qr_token && p.qr_token.qr_data_uri);
    if (approvedPass && highlightEl) {
      highlightEl.innerHTML = `
        <div class="qr-pass-card" style="margin-bottom: 24px;">
          <div style="font-size: 11px; font-weight: 700; color: var(--primary); text-transform: uppercase; letter-spacing: 0.05em;">
            Active Verified One-Time QR Pass
          </div>
          <div style="font-size: 1.15rem; font-weight: 800; color: var(--text);">
            ${escapeHtml(approvedPass.pass_number)}
          </div>
          <img src="${approvedPass.qr_token.qr_data_uri}" alt="Gate Pass One-Time QR Code" class="qr-code-img" />
          <div class="qr-instructions-banner">
            📱 Present this QR to the Security Guard at the campus perimeter gate. Single-use only.
          </div>
          <div style="font-size: 12px; color: var(--text-secondary); width: 100%; text-align: left; background: var(--surface-hover); padding: 8px 12px; border-radius: var(--radius-sm);">
            <div><strong>Destination:</strong> ${escapeHtml(approvedPass.destination)}</div>
            <div><strong>Out Window:</strong> ${formatDateTime(approvedPass.out_time)}</div>
            <div><strong>Must Return By:</strong> ${formatDateTime(approvedPass.expected_in_time)}</div>
          </div>
        </div>
      `;
    } else if (highlightEl) {
      highlightEl.innerHTML = "";
    }

    if (displayList.length === 0) {
      container.innerHTML = `
        <div class="card">
          <div class="state-container" style="padding: 40px 20px;">
            <div class="state-icon">🎫</div>
            <div class="state-title">No gate passes found</div>
            <div class="state-desc">You do not have any gate passes in this filter view.</div>
            <button class="btn btn-primary" onclick="document.getElementById('btn-open-gatepass-modal').click()" type="button" style="margin-top: 12px;">
              Apply for Gate Pass
            </button>
          </div>
        </div>
      `;
      return;
    }

    container.innerHTML = `
      <div style="display: flex; flex-direction: column; gap: 12px;">
        ${displayList.map(gp => {
          const isApproved = gp.status === 'APPROVED';
          const isRejected = gp.status === 'REJECTED';
          const isUsed = ['CHECKED_OUT', 'COMPLETED', 'OVERDUE'].includes(gp.status);
          let gpCardClass = "card-status-normal";
          if (isApproved) gpCardClass = "card-status-resolved";
          else if (isRejected) gpCardClass = "card-status-urgent";
          else if (gp.status === 'PENDING') gpCardClass = "card-status-pending";

          return `
            <div class="card ${gpCardClass}" style="padding: 16px;">
              <div style="display: flex; justify-content: space-between; align-items: flex-start; gap: 12px; flex-wrap: wrap;">
                <div>
                  <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 4px;">
                    <span style="font-family: var(--font-family-mono); font-weight: 700; font-size: 12px; color: var(--primary);">
                      ${escapeHtml(gp.pass_number)}
                    </span>
                    <span class="status-badge info" style="font-size: 10px;">${escapeHtml(gp.pass_type)}</span>
                  </div>
                  <h4 style="font-size: 15px; font-weight: 700; color: var(--text);">
                    Destination: ${escapeHtml(gp.destination)}
                  </h4>
                  <p style="font-size: 13px; color: var(--text-secondary); margin: 4px 0 8px 0;">
                    <strong>Purpose:</strong> ${escapeHtml(gp.purpose)}
                  </p>
                  <div style="font-size: 11px; color: var(--text-muted); display: flex; gap: 16px; flex-wrap: wrap;">
                    <span>📤 Out: ${formatDateTime(gp.out_time)}</span>
                    <span>📥 Expected Return: ${formatDateTime(gp.expected_in_time)}</span>
                    ${gp.actual_out_time ? `<span>Gate Out: ${formatDateTime(gp.actual_out_time)}</span>` : ''}
                    ${gp.actual_in_time ? `<span>Gate Return: ${formatDateTime(gp.actual_in_time)}</span>` : ''}
                  </div>
                  ${isRejected && gp.rejection_reason ? `
                    <div style="margin-top: 8px; font-size: 12px; background: var(--error-bg); color: var(--error-text); padding: 6px 10px; border-radius: var(--radius-sm); border: 1px solid var(--error-border);">
                      <strong>Rejection Reason:</strong> ${escapeHtml(gp.rejection_reason)}
                    </div>
                  ` : ''}
                </div>
                <div style="display: flex; flex-direction: column; align-items: flex-end; gap: 8px;">
                  ${formatStatusBadge(gp.status)}
                  ${isApproved && gp.qr_token && gp.qr_token.qr_data_uri ? `
                    <button class="btn btn-sm btn-live" onclick="window.viewQrModal('${escapeHtml(gp.pass_number)}', '${gp.qr_token.qr_data_uri}')" type="button">
                      📱 Show QR Pass
                    </button>
                  ` : isUsed ? `
                    <span style="font-size: 11px; color: var(--text-muted); font-weight: 600;">✓ QR already consumed</span>
                  ` : gp.status === 'PENDING' ? `
                    <span style="font-size: 11px; color: var(--warning-text);">◷ Awaiting Warden</span>
                  ` : ''}
                </div>
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
          <div class="state-title">Unable to Load Gate Passes</div>
          <div class="state-desc">${escapeHtml(err.message)}</div>
        </div>
      </div>
    `;
  }
}

window.viewQrModal = function(passNumber, qrDataUri) {
  const root = document.getElementById("gatepass-modal-root");
  if (!root) return;

  root.innerHTML = `
    <div class="modal-backdrop" role="dialog" aria-modal="true">
      <div class="modal-dialog" style="max-width: 400px; text-align: center;">
        <div class="modal-header">
          <div class="modal-title">🎫 ${escapeHtml(passNumber)}</div>
          <button type="button" class="btn btn-sm btn-outline" id="btn-close-qr-view">✕</button>
        </div>
        <div class="modal-body" style="padding: 24px;">
          <img src="${qrDataUri}" alt="Gate Pass One-Time QR" style="width: 220px; height: 220px; margin: 0 auto 16px auto; display: block; border-radius: var(--radius-md); border: 3px solid var(--border);" />
          <div class="qr-instructions-banner">
            Show this QR code to the Security Guard at the campus gate. One-time single use only.
          </div>
        </div>
        <div class="modal-footer" style="justify-content: center;">
          <button type="button" class="btn btn-primary" id="btn-done-qr">Done</button>
        </div>
      </div>
    </div>
  `;

  const closeModal = () => root.replaceChildren();
  document.getElementById("btn-close-qr-view")?.addEventListener("click", closeModal);
  document.getElementById("btn-done-qr")?.addEventListener("click", closeModal);
};

function openApplyGatePassModal() {
  const root = document.getElementById("gatepass-modal-root");
  if (!root) return;

  const now = new Date();
  const laterToday = new Date(now.getTime() + 4 * 60 * 60 * 1000); // 4 hours later

  // Format datetime-local string
  const formatInputDateTime = (d) => {
    const pad = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  };

  root.innerHTML = `
    <div class="modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="modal-gp-title">
      <div class="modal-dialog">
        <div class="modal-header">
          <div class="modal-title" id="modal-gp-title">🎫 Apply for Gate Pass</div>
          <button type="button" class="btn btn-sm btn-outline" id="btn-close-gp-modal" aria-label="Close dialog">✕</button>
        </div>
        <form id="form-new-gatepass">
          <div class="modal-body">
            <div id="modal-gp-alert" class="form-alert error"></div>

            <div class="form-group">
              <label class="form-label" for="gp-type">Outing Type *</label>
              <select id="gp-type" class="form-select" required>
                <option value="DAY_OUTING">Day Outing (City / Market / Medical)</option>
                <option value="HOME_LEAVE">Home Leave / Vacation</option>
              </select>
            </div>

            <div class="form-group">
              <label class="form-label" for="gp-destination">Destination *</label>
              <input type="text" id="gp-destination" class="form-input" placeholder="e.g. Master Canteen Market, Bhubaneswar" required minlength="2" maxlength="150" />
            </div>

            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px;">
              <div class="form-group">
                <label class="form-label" for="gp-out-time">Expected Out Time *</label>
                <input type="datetime-local" id="gp-out-time" class="form-input" value="${formatInputDateTime(now)}" required />
              </div>

              <div class="form-group">
                <label class="form-label" for="gp-in-time">Expected Return Time *</label>
                <input type="datetime-local" id="gp-in-time" class="form-input" value="${formatInputDateTime(laterToday)}" required />
              </div>
            </div>

            <div class="form-group">
              <label class="form-label" for="gp-purpose">Purpose / Justification *</label>
              <textarea id="gp-purpose" class="form-textarea" rows="2" placeholder="State the reason for campus outing..." required minlength="3" maxlength="255"></textarea>
            </div>
          </div>
          <div class="modal-footer">
            <button type="button" class="btn btn-outline" id="btn-cancel-gp">Cancel</button>
            <button type="submit" class="btn btn-primary" id="btn-submit-gp">Submit Application</button>
          </div>
        </form>
      </div>
    </div>
  `;

  const closeModal = () => root.replaceChildren();
  document.getElementById("btn-close-gp-modal")?.addEventListener("click", closeModal);
  document.getElementById("btn-cancel-gp")?.addEventListener("click", closeModal);

  document.getElementById("form-new-gatepass")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const alertEl = document.getElementById("modal-gp-alert");
    const submitBtn = document.getElementById("btn-submit-gp");
    if (alertEl) alertEl.classList.remove("visible");

    submitBtn.disabled = true;
    submitBtn.textContent = "Submitting...";

    try {
      const payload = {
        pass_type: document.getElementById("gp-type").value,
        destination: document.getElementById("gp-destination").value.trim(),
        out_time: new Date(document.getElementById("gp-out-time").value).toISOString(),
        expected_in_time: new Date(document.getElementById("gp-in-time").value).toISOString(),
        purpose: document.getElementById("gp-purpose").value.trim(),
        pin_code: "1234"
      };

      const res = await api.post("/api/v1/gatepasses", payload);
      closeModal();
      showToast(`Gate pass submitted successfully! Pass #${res.pass_number}`, "success");
      loadGatePassesList("ALL");
    } catch (err) {
      if (alertEl) {
        alertEl.textContent = err.message || "Failed to submit gate pass application.";
        alertEl.classList.add("visible");
      }
      submitBtn.disabled = false;
      submitBtn.textContent = "Submit Application";
    }
  });
}


/* ==========================================================================
   5. DOCUMENT & CERTIFICATE REQUESTS
   ========================================================================== */
export async function renderStudentDocuments(mainEl) {
  if (!mainEl) return;

  mainEl.innerHTML = `
    <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 12px; margin-bottom: 20px;">
      <div>
        <h2>📄 Digital Document & Certificate Requests</h2>
        <p style="margin: 2px 0 0 0; font-size: 13px; color: var(--text-secondary);">
          Request official bonafide certificates, fee estimates, and hostel dues clearances with cryptographic SHA-256 verification.
        </p>
      </div>
      <button id="btn-open-doc-modal" class="btn btn-secondary" type="button">
        + Request Document
      </button>
    </div>

    <!-- Document Requests List -->
    <div id="documents-list-container" style="margin-top: 16px;">
      <div class="state-container"><div class="spinner"></div></div>
    </div>

    <!-- Modal Container for Request Document -->
    <div id="doc-modal-root"></div>
  `;

  document.getElementById("btn-open-doc-modal")?.addEventListener("click", () => openRequestDocumentModal());

  loadDocumentsList();
}

async function loadDocumentsList() {
  const container = document.getElementById("documents-list-container");
  if (!container) return;

  try {
    const docs = await api.get("/api/v1/documents");

    if (docs.length === 0) {
      container.innerHTML = `
        <div class="card">
          <div class="state-container" style="padding: 40px 20px;">
            <div class="state-icon">📄</div>
            <div class="state-title">No Document Requests Yet</div>
            <div class="state-desc">You have not requested any institutional certificates.</div>
            <button class="btn btn-primary" onclick="document.getElementById('btn-open-doc-modal').click()" type="button" style="margin-top: 12px;">
              Request Certificate
            </button>
          </div>
        </div>
      `;
      return;
    }

    container.innerHTML = `
      <div style="display: flex; flex-direction: column; gap: 12px;">
        ${docs.map(doc => {
          const isCompleted = doc.status === 'COMPLETED' && doc.document_url;
          const isRejected = doc.status === 'REJECTED';

          return `
            <div class="card card-document" style="padding: 16px;">
              <div style="display: flex; justify-content: space-between; align-items: flex-start; gap: 12px; flex-wrap: wrap;">
                <div>
                  <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 4px;">
                    <span style="font-family: var(--font-family-mono); font-weight: 700; font-size: 12px; color: var(--color-ultra-violet);">
                      ${escapeHtml(doc.request_number)}
                    </span>
                    <span class="status-badge info" style="font-size: 10px;">${escapeHtml(doc.document_type)}</span>
                  </div>
                  <h4 style="font-size: 15px; font-weight: 700; color: var(--text);">
                    ${formatDocTypeName(doc.document_type)}
                  </h4>
                  <p style="font-size: 13px; color: var(--text-secondary); margin: 4px 0 8px 0;">
                    <strong>Purpose:</strong> ${escapeHtml(doc.purpose)}
                  </p>
                  <div style="font-size: 11px; color: var(--text-muted); display: flex; gap: 16px; flex-wrap: wrap;">
                    <span>📅 Requested: ${formatDate(doc.created_at)}</span>
                    ${doc.verification_hash ? `<span>🔐 SHA-256 Hash: <code>${escapeHtml(doc.verification_hash.slice(0, 16))}...</code></span>` : ''}
                  </div>
                  ${isRejected && doc.rejection_reason ? `
                    <div style="margin-top: 8px; font-size: 12px; background: var(--error-bg); color: var(--error-text); padding: 6px 10px; border-radius: var(--radius-sm); border: 1px solid var(--error-border);">
                      <strong>Rejection Reason:</strong> ${escapeHtml(doc.rejection_reason)}
                    </div>
                  ` : ''}
                </div>
                <div style="display: flex; flex-direction: column; align-items: flex-end; gap: 8px;">
                  ${formatStatusBadge(doc.status)}
                  ${isCompleted ? `
                    <button class="btn btn-sm btn-success" onclick="window.downloadDoc('${escapeHtml(doc.id)}')" type="button">
                      📥 Download PDF
                    </button>
                  ` : ''}
                </div>
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
          <div class="state-title">Unable to Load Documents</div>
          <div class="state-desc">${escapeHtml(err.message)}</div>
        </div>
      </div>
    `;
  }
}

function formatDocTypeName(type) {
  switch (type) {
    case "BONAFIDE": return "Bonafide Student Certificate";
    case "HOSTEL_RESIDENCE": return "Hostel Residence Certificate";
    case "FEE_ESTIMATE": return "Institutional Fee Estimate Certificate";
    default: return type || "Document";
  }
}

window.downloadDoc = function(docId) {
  const token = store.getState().token;
  const url = `${api.baseUrl}/api/v1/documents/${docId}/download`;

  // Fetch with Authorization header and trigger blob download
  fetch(url, {
    headers: { "Authorization": `Bearer ${token}` }
  }).then(response => {
    if (!response.ok) throw new Error("Failed to download document.");
    return response.blob();
  }).then(blob => {
    const downloadUrl = window.URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = downloadUrl;
    a.download = `certificate_${docId}.pdf`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    window.URL.revokeObjectURL(downloadUrl);
    showToast("Certificate PDF downloaded successfully!", "success");
  }).catch(err => {
    showToast(err.message || "Failed to download certificate.", "error");
  });
};

function openRequestDocumentModal() {
  const root = document.getElementById("doc-modal-root");
  if (!root) return;

  root.innerHTML = `
    <div class="modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="modal-doc-title">
      <div class="modal-dialog">
        <div class="modal-header">
          <div class="modal-title" id="modal-doc-title">📄 Request Institutional Certificate</div>
          <button type="button" class="btn btn-sm btn-outline" id="btn-close-doc-modal" aria-label="Close dialog">✕</button>
        </div>
        <form id="form-new-doc">
          <div class="modal-body">
            <div id="modal-doc-alert" class="form-alert error"></div>

            <div class="form-group">
              <label class="form-label" for="doc-type">Certificate Type *</label>
              <select id="doc-type" class="form-select" required>
                <option value="BONAFIDE">Bonafide Student Certificate</option>
                <option value="HOSTEL_RESIDENCE">Hostel Residence Certificate</option>
                <option value="FEE_ESTIMATE">Institutional Fee Estimate (Loan/Scholarship)</option>
              </select>
            </div>

            <div class="form-group">
              <label class="form-label" for="doc-purpose">Purpose of Certificate *</label>
              <textarea id="doc-purpose" class="form-textarea" rows="3" placeholder="e.g. Passport renewal, State scholarship application, Education loan verification..." required minlength="3" maxlength="255"></textarea>
            </div>

            <div style="background: var(--surface-hover); padding: 12px; border-radius: var(--radius-md); font-size: 12px; color: var(--text-secondary);">
              ℹ️ <strong>Automated Eligibility Validation:</strong> The backend validates academic standing and hostel dues clearance. Approved certificates generate a cryptographically verifiable PDF.
            </div>
          </div>
          <div class="modal-footer">
            <button type="button" class="btn btn-outline" id="btn-cancel-doc">Cancel</button>
            <button type="submit" class="btn btn-primary" id="btn-submit-doc">Submit Request</button>
          </div>
        </form>
      </div>
    </div>
  `;

  const closeModal = () => root.replaceChildren();
  document.getElementById("btn-close-doc-modal")?.addEventListener("click", closeModal);
  document.getElementById("btn-cancel-doc")?.addEventListener("click", closeModal);

  document.getElementById("form-new-doc")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const alertEl = document.getElementById("modal-doc-alert");
    const submitBtn = document.getElementById("btn-submit-doc");
    if (alertEl) alertEl.classList.remove("visible");

    submitBtn.disabled = true;
    submitBtn.textContent = "Processing Eligibility...";

    try {
      const payload = {
        document_type: document.getElementById("doc-type").value,
        purpose: document.getElementById("doc-purpose").value.trim()
      };

      const res = await api.post("/api/v1/documents", payload);
      closeModal();
      showToast(`Document requested successfully! Request #${res.request_number}`, "success");
      loadDocumentsList();
    } catch (err) {
      if (alertEl) {
        alertEl.textContent = err.message || "Failed to submit document request.";
        alertEl.classList.add("visible");
      }
      submitBtn.disabled = false;
      submitBtn.textContent = "Submit Request";
    }
  });
}


/* ==========================================================================
   6. ATTENDANCE SUMMARY & SESSIONS
   ========================================================================== */
export async function renderStudentAttendance(mainEl) {
  if (!mainEl) return;

  mainEl.innerHTML = `
    <div style="margin-bottom: 20px;">
      <h2>📝 Lecture Attendance Tracking</h2>
      <p style="margin: 2px 0 0 0; font-size: 13px; color: var(--text-secondary);">
        Real-time lecture presence monitoring and shortage warning indicators.
      </p>
    </div>

    <!-- Attendance Overview Card -->
    <div id="attendance-summary-container">
      <div class="state-container"><div class="spinner"></div></div>
    </div>

    <!-- Session Records Table -->
    <div style="margin-top: 24px;">
      <h3 style="font-size: 15px; font-weight: 700; margin-bottom: 12px; color: var(--text);">Session-by-Session Records</h3>
      <div id="attendance-records-container">
        <div class="state-container"><div class="spinner"></div></div>
      </div>
    </div>
  `;

  try {
    const summary = await api.get("/api/v1/attendance/my-attendance");
    const sumContainer = document.getElementById("attendance-summary-container");
    const recContainer = document.getElementById("attendance-records-container");

    const pct = summary.attendance_percentage;
    const isShortage = pct < 75;

    if (sumContainer) {
      sumContainer.innerHTML = `
        <div class="card" style="padding: 24px;">
          <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 16px;">
            <div>
              <div style="font-size: 12px; font-weight: 700; color: var(--text-muted); text-transform: uppercase;">
                Cumulative Lecture Attendance
              </div>
              <div style="font-size: 2.5rem; font-weight: 800; color: ${pct >= 75 ? 'var(--success)' : 'var(--error)'}; margin: 4px 0;">
                ${pct}%
              </div>
              <div style="font-size: 13px; color: var(--text-secondary);">
                ${isShortage 
                  ? `<span class="status-badge rejected">⚠️ Shortage Warning (&lt; 75% Threshold)</span>` 
                  : `<span class="status-badge approved">✓ Exam Eligible (&ge; 75% Criteria Met)</span>`
                }
              </div>
            </div>

            <!-- Stats Mini-Grid -->
            <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; min-width: 280px;">
              <div style="background: var(--surface-hover); padding: 12px; border-radius: var(--radius-md); text-align: center;">
                <div style="font-size: 11px; color: var(--text-muted);">PRESENT</div>
                <div style="font-size: 1.25rem; font-weight: 700; color: var(--success);">${summary.present_count}</div>
              </div>
              <div style="background: var(--surface-hover); padding: 12px; border-radius: var(--radius-md); text-align: center;">
                <div style="font-size: 11px; color: var(--text-muted);">LATE</div>
                <div style="font-size: 1.25rem; font-weight: 700; color: var(--warning);">${summary.late_count}</div>
              </div>
              <div style="background: var(--surface-hover); padding: 12px; border-radius: var(--radius-md); text-align: center;">
                <div style="font-size: 11px; color: var(--text-muted);">ABSENT</div>
                <div style="font-size: 1.25rem; font-weight: 700; color: var(--error);">${summary.absent_count}</div>
              </div>
            </div>
          </div>

          <!-- Visual Progress Bar -->
          <div style="margin-top: 20px;">
            <div class="progress-bar-wrap">
              <div class="progress-bar-fill ${pct >= 75 ? 'success' : 'danger'}" style="width: ${Math.min(100, Math.max(0, pct))}%;"></div>
            </div>
            <div style="display: flex; justify-content: space-between; font-size: 11px; color: var(--text-muted); margin-top: 4px;">
              <span>0%</span>
              <span style="font-weight: 700; color: ${pct >= 75 ? 'var(--success)' : 'var(--error)'};">Minimum Required: 75%</span>
              <span>100%</span>
            </div>
          </div>
        </div>
      `;
    }

    if (recContainer) {
      if (!summary.records || summary.records.length === 0) {
        recContainer.innerHTML = `
          <div class="card">
            <div class="state-container" style="padding: 30px;">
              <div class="state-desc">No attendance records logged yet.</div>
            </div>
          </div>
        `;
        return;
      }

      recContainer.innerHTML = `
        <div class="table-responsive-container">
          <table class="data-table">
            <thead>
              <tr>
                <th>Session ID</th>
                <th>Status</th>
                <th>Recorded Timestamp</th>
              </tr>
            </thead>
            <tbody>
              ${summary.records.map(r => `
                <tr>
                  <td style="font-family: var(--font-family-mono); font-size: 12px;">${escapeHtml(r.session_id)}</td>
                  <td>${formatAttendanceBadge(r.status)}</td>
                  <td>${formatDateTime(r.created_at)}</td>
                </tr>
              `).join("")}
            </tbody>
          </table>
        </div>
      `;
    }
  } catch (err) {
    mainEl.innerHTML = `
      <div class="card">
        <div class="state-container" style="color: var(--error);">
          <div class="state-icon">⚠️</div>
          <div class="state-title">Unable to Load Attendance</div>
          <div class="state-desc">${escapeHtml(err.message)}</div>
        </div>
      </div>
    `;
  }
}

function formatAttendanceBadge(status) {
  switch (status) {
    case "PRESENT": return '<span class="status-badge approved">✓ Present</span>';
    case "LATE": return '<span class="status-badge warning">◷ Late</span>';
    case "ABSENT": return '<span class="status-badge rejected">✕ Absent</span>';
    default: return `<span class="status-badge info">${escapeHtml(status)}</span>`;
  }
}


/* ==========================================================================
   7. STUDY MATERIALS (ACADEMIC COHORT)
   ========================================================================== */
export async function renderStudentMaterials(mainEl) {
  if (!mainEl) return;

  mainEl.innerHTML = `
    <div style="margin-bottom: 20px;">
      <h2>📚 Academic Study Materials</h2>
      <p style="margin: 2px 0 0 0; font-size: 13px; color: var(--text-secondary);">
        Course syllabi, lecture notes, and reference materials targeted to your branch and semester.
      </p>
    </div>

    <div id="materials-list-container" style="margin-top: 16px;">
      <div class="state-container"><div class="spinner"></div></div>
    </div>
  `;

  try {
    const materials = await api.get("/api/v1/materials");
    const container = document.getElementById("materials-list-container");
    if (!container) return;

    if (materials.length === 0) {
      container.innerHTML = `
        <div class="card">
          <div class="state-container" style="padding: 40px 20px;">
            <div class="state-icon">📚</div>
            <div class="state-title">No Study Materials Published</div>
            <div class="state-desc">Your department faculty have not uploaded study materials for this cohort yet.</div>
          </div>
        </div>
      `;
      return;
    }

    container.innerHTML = `
      <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: 16px;">
        ${materials.map(m => `
          <div class="card" style="padding: 18px; display: flex; flex-direction: column; justify-content: space-between;">
            <div>
              <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 8px;">
                <span class="status-badge info" style="font-size: 11px;">📄 ${escapeHtml(m.file_type || 'PDF')}</span>
                <span style="font-size: 11px; color: var(--text-muted);">${formatDate(m.created_at)}</span>
              </div>
              <h4 style="font-size: 15px; font-weight: 700; color: var(--text);">${escapeHtml(m.title)}</h4>
              <p style="font-size: 13px; color: var(--text-secondary); margin: 6px 0 12px 0;">
                ${escapeHtml(m.description || 'Lecture resource and course reference notes.')}
              </p>
            </div>
            <div style="border-top: 1px solid var(--border-subtle); padding-top: 12px; display: flex; justify-content: space-between; align-items: center;">
              <span style="font-size: 11px; color: var(--text-muted);">Target: CSE Sem 6</span>
              <a href="${api.baseUrl}${m.file_url.startsWith('/') ? '' : '/'}${m.file_url}" target="_blank" rel="noopener noreferrer" class="btn btn-sm btn-outline">
                Open Resource &rarr;
              </a>
            </div>
          </div>
        `).join("")}
      </div>
    `;
  } catch (err) {
    document.getElementById("materials-list-container")?.replaceChildren(
      document.createTextNode(`Unable to load study materials: ${err.message}`)
    );
  }
}


/* ==========================================================================
   8. CLASS NOTICES & CIRCULARS (COHORT FILTERED)
   ========================================================================== */
export async function renderStudentNotices(mainEl) {
  if (!mainEl) return;

  mainEl.innerHTML = `
    <div style="margin-bottom: 20px;">
      <h2>📢 Class Notices & Timetable Circulars</h2>
      <p style="margin: 2px 0 0 0; font-size: 13px; color: var(--text-secondary);">
        Academic timetable adjustments, cancellations, and room switches targeted to your cohort.
      </p>
    </div>

    <div id="full-notices-container" style="margin-top: 16px;">
      <div class="state-container"><div class="spinner"></div></div>
    </div>
  `;

  try {
    const notices = await api.get("/api/v1/class-notices");
    const container = document.getElementById("full-notices-container");
    if (!container) return;

    if (notices.length === 0) {
      container.innerHTML = `
        <div class="card">
          <div class="state-container" style="padding: 40px 20px;">
            <div class="state-icon">📢</div>
            <div class="state-title">No Active Class Notices</div>
            <div class="state-desc">There are no schedule modifications or cancellations for your cohort today.</div>
          </div>
        </div>
      `;
      return;
    }

    container.innerHTML = `
      <div style="display: flex; flex-direction: column; gap: 12px;">
        ${notices.map(n => `
          <div class="card" style="padding: 18px; border-left: 4px solid var(--primary);">
            <div style="display: flex; justify-content: space-between; align-items: flex-start; gap: 12px; flex-wrap: wrap;">
              <div>
                <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 6px;">
                  ${formatNoticeBadge(n.notice_type)}
                  <span style="font-size: 12px; color: var(--text-muted);">${formatDate(n.class_date)} &bull; ${escapeHtml(n.period)}</span>
                </div>
                <h4 style="font-size: 16px; font-weight: 700; color: var(--text);">${escapeHtml(n.subject)}</h4>
                <p style="font-size: 13px; color: var(--text-secondary); margin: 6px 0 8px 0;">${escapeHtml(n.details)}</p>
                <div style="font-size: 11px; color: var(--text-muted);">
                  Cohort: ${escapeHtml(n.target_branch)} (Semester ${n.target_semester}, Section ${escapeHtml(n.target_section)})
                </div>
              </div>
            </div>
          </div>
        `).join("")}
      </div>
    `;
  } catch (err) {
    document.getElementById("full-notices-container")?.replaceChildren(
      document.createTextNode(`Unable to load class notices: ${err.message}`)
    );
  }
}

function formatNoticeBadge(type) {
  switch (type) {
    case "CANCELLED": return '<span class="status-badge rejected">✕ Cancelled</span>';
    case "RESCHEDULED": return '<span class="status-badge pending">◷ Rescheduled</span>';
    case "ROOM_CHANGED": return '<span class="status-badge warning">⇄ Room Changed</span>';
    case "SWITCHED": return '<span class="status-badge info">⇄ Switched</span>';
    case "POSTPONED": return '<span class="status-badge pending">◷ Postponed</span>';
    default: return `<span class="status-badge info">ℹ ${escapeHtml(type || 'Notice')}</span>`;
  }
}


/* ==========================================================================
   9. STUDENT PROFILE
   ========================================================================== */
export function renderStudentProfile(mainEl, user) {
  if (!mainEl || !user) return;

  const sp = user.student_profile || {};

  mainEl.innerHTML = `
    <div style="max-width: 720px; margin: 0 auto;">
      <div style="margin-bottom: 20px;">
        <h2>👤 Student Identity & Academic Profile</h2>
        <p style="font-size: 13px; color: var(--text-secondary); margin-top: 4px;">
          Official institutional identity, hostel residency record, and dues clearance verification.
        </p>
      </div>

      <div class="card" style="padding: 24px;">
        <div style="display: flex; align-items: center; gap: 16px; padding-bottom: 20px; border-bottom: 1px solid var(--border-subtle);">
          <div style="width: 56px; height: 56px; border-radius: var(--radius-full); background: var(--primary); color: #FFFFFF; font-size: 1.5rem; font-weight: 700; display: flex; align-items: center; justify-content: center;">
            ${escapeHtml((user.first_name || 'S')[0])}${escapeHtml((user.last_name || '')[0])}
          </div>
          <div>
            <div style="font-size: 1.25rem; font-weight: 800; color: var(--text);">
              ${escapeHtml(user.first_name)} ${escapeHtml(user.last_name)}
            </div>
            <div style="font-size: 13px; color: var(--text-muted); display: flex; align-items: center; gap: 8px; margin-top: 2px;">
              <span>Roll No: <strong>${escapeHtml(sp.college_roll_number || sp.roll_number || '2201042')}</strong></span>
              <span>&bull;</span>
              <span>Uni Reg: <strong>${escapeHtml(sp.university_reg_number || '—')}</strong></span>
              <span>&bull;</span>
              <span class="status-badge approved">Active Account</span>
            </div>
          </div>
        </div>

        <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); gap: 16px; margin-top: 20px; font-size: 13px;">
          <div>
            <div style="font-size: 11px; font-weight: 700; color: var(--text-muted); text-transform: uppercase;">College Roll Number</div>
            <div style="font-weight: 600; margin-top: 2px;"><code style="font-size: 13px;">${escapeHtml(sp.college_roll_number || sp.roll_number || '—')}</code></div>
          </div>
          <div>
            <div style="font-size: 11px; font-weight: 700; color: var(--text-muted); text-transform: uppercase;">University Registration Number</div>
            <div style="font-weight: 600; margin-top: 2px;"><code style="font-size: 13px;">${escapeHtml(sp.university_reg_number || 'Pending Verification')}</code></div>
          </div>
          <div>
            <div style="font-size: 11px; font-weight: 700; color: var(--text-muted); text-transform: uppercase;">Accommodation Category</div>
            <div style="margin-top: 4px;">
              <span class="status-badge ${sp.accommodation_type === 'HOSTELER' || sp.accommodation_type === 'Hosteler' ? 'info' : 'approved'}">
                ${sp.accommodation_type === 'HOSTELER' || sp.accommodation_type === 'Hosteler' ? '🏢 Hosteler' : '🏡 Day Scholar'}
              </span>
            </div>
          </div>
          <div>
            <div style="font-size: 11px; font-weight: 700; color: var(--text-muted); text-transform: uppercase;">Hostel Residency Details</div>
            <div style="font-weight: 600; margin-top: 2px;">
              ${(sp.accommodation_type === 'HOSTELER' || sp.accommodation_type === 'Hosteler' || sp.room_number)
                ? `${escapeHtml(sp.hostel_name || 'Campus Hostel')}${sp.hostel_block ? ` • ${escapeHtml(sp.hostel_block)}` : ''} • Room ${escapeHtml(sp.room_number || 'Assigned')}`
                : '<span style="color: var(--text-muted);">Day Scholar (Non-Resident)</span>'
              }
            </div>
          </div>
          <div>
            <div style="font-size: 11px; font-weight: 700; color: var(--text-muted); text-transform: uppercase;">Department / Branch</div>
            <div style="font-weight: 600; margin-top: 2px;">${escapeHtml(sp.department || 'Computer Science & Engineering')}</div>
          </div>
          <div>
            <div style="font-size: 11px; font-weight: 700; color: var(--text-muted); text-transform: uppercase;">Batch / Semester</div>
            <div style="font-weight: 600; margin-top: 2px;">Batch ${sp.batch_year || 2026} &bull; Semester ${sp.semester || 1} (${sp.section || 'A'})</div>
          </div>
          <div>
            <div style="font-size: 11px; font-weight: 700; color: var(--text-muted); text-transform: uppercase;">Institutional Email</div>
            <div style="font-weight: 600; margin-top: 2px;">${escapeHtml(user.email)}</div>
          </div>
          <div>
            <div style="font-size: 11px; font-weight: 700; color: var(--text-muted); text-transform: uppercase;">Primary Mobile Number</div>
            <div style="font-weight: 600; margin-top: 2px;">${escapeHtml(user.phone_number)}</div>
          </div>
          <div>
            <div style="font-size: 11px; font-weight: 700; color: var(--text-muted); text-transform: uppercase;">Dues Clearance Status</div>
            <div style="margin-top: 4px;">
              ${sp.dues_cleared !== false 
                ? '<span class="status-badge approved">✓ Dues Cleared (Eligible for Certificates)</span>' 
                : '<span class="status-badge rejected">✕ Dues Pending</span>'
              }
            </div>
          </div>
        </div>
      </div>
    </div>
  `;
}


/* ==========================================================================
   10. STUDENT IN-APP NOTIFICATIONS (FULL VIEW)
   ========================================================================== */
export async function renderStudentNotifications(mainEl) {
  if (!mainEl) return;

  mainEl.innerHTML = `
    <div style="margin-bottom: 20px;">
      <h2>🔔 Notification Center</h2>
      <p style="margin: 2px 0 0 0; font-size: 13px; color: var(--text-secondary);">
        Transactional operational updates, gate pass decisions, and complaint status changes.
      </p>
    </div>

    <div id="full-notifications-container" style="margin-top: 16px;">
      <div class="state-container"><div class="spinner"></div></div>
    </div>
  `;

  try {
    const data = await api.get("/api/v1/notifications");
    const container = document.getElementById("full-notifications-container");
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
          <div class="card" style="padding: 16px; ${!n.is_read ? 'background: var(--primary-subtle); border-left: 4px solid var(--primary);' : ''}">
            <div style="display: flex; justify-content: space-between; align-items: flex-start; gap: 12px;">
              <div>
                <div style="font-size: 14px; font-weight: 700; color: var(--text);">${escapeHtml(n.title)}</div>
                <div style="font-size: 13px; color: var(--text-secondary); margin: 4px 0;">${escapeHtml(n.message)}</div>
                <div style="font-size: 11px; color: var(--text-muted);">${timeAgo(n.created_at)}</div>
              </div>
              ${!n.is_read ? `
                <button class="btn btn-sm btn-outline" onclick="window.markNotifReadView('${escapeHtml(n.id)}')" type="button">
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
    document.getElementById("full-notifications-container")?.replaceChildren(
      document.createTextNode(`Unable to load notifications: ${err.message}`)
    );
  }
}

window.markNotifReadView = async function(id) {
  try {
    await api.patch(`/api/v1/notifications/${id}/read`);
    showToast("Notification marked as read", "success");
    const main = document.getElementById("app-main-content");
    if (main) renderStudentNotifications(main);
  } catch (err) {
    showToast(err.message || "Failed to mark read", "error");
  }
};


/* ==========================================================================
   HELPER UTILITY FUNCTIONS
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
