/**
 * CampusFlow MVP — Client-Side Hash Router
 * Routes between Login, Role Dashboards, and Controlled Workflow Placeholders
 */

import { store } from "./state.js";
import { isAuthenticated, getCurrentUser, getCurrentRole, login } from "./auth.js";
import { renderNavigation, renderPlaceholder, showToast } from "./ui.js";
import { escapeHtml, formatRole, getGreeting } from "./utils.js";
import {
  renderStudentDashboard,
  renderStudentComplaints,
  renderStudentHelpAFriend,
  renderStudentGatePasses,
  renderStudentDocuments,
  renderStudentAttendance,
  renderStudentMaterials,
  renderStudentNotices,
  renderStudentProfile,
  renderStudentNotifications
} from "./student.js";
import {
  renderWardenDashboard,
  renderWardenGatePasses,
  renderHostelFacultyDashboard,
  renderHostelFacultyGatePasses,
  renderHostelComplaints,
  renderStaffProfile,
  renderStaffNotifications
} from "./hostel.js";
import {
  renderTeacherDashboard,
  renderTeacherAttendance,
  renderTeacherClassManagement,
  renderTeacherClassNotices,
  renderTeacherMaterials,
  renderTeacherProfile,
  renderTeacherNotifications,
  renderLabDashboard,
  renderLabEquipment,
  renderLabRequisitions,
  renderLabNotices,
  renderLabProfile,
  renderLabNotifications
} from "./academic.js";
import {
  renderAdminControlTower,
  renderAdminSlaBreaches,
  renderAdminRecurringComplaints,
  renderAdminComplaints,
  renderAdminAnnouncements,
  renderAdminAuditLogs,
  renderAdminNotifications,
  renderAdminProfile
} from "./admin.js";
import {
  renderMaintenanceStaffDashboard,
  renderMaintenanceStaffComplaints,
  renderGuardScanner,
  renderGuardGateActivity
} from "./operations.js";

export function initRouter() {
  window.addEventListener("hashchange", () => handleRoute(window.location.hash));
  handleRoute(window.location.hash);
}

export function handleRoute(hash) {
  const route = hash || (isAuthenticated() ? "#dashboard" : "#login");
  store.setState({ currentRoute: route });

  // Update active state in navigation
  document.querySelectorAll(".nav-link").forEach(link => {
    if (link.getAttribute("href") === route) {
      link.classList.add("active");
    } else {
      link.classList.remove("active");
    }
  });

  // Guard protected routes
  if (route !== "#login" && !isAuthenticated()) {
    window.location.hash = "#login";
    return;
  }

  // Redirect to dashboard if logged in and visiting login
  if (route === "#login" && isAuthenticated()) {
    window.location.hash = "#dashboard";
    return;
  }

  // Dispatch view rendering
  renderView(route);
}

function renderView(route) {
  const main = document.getElementById("app-main-content");
  const shellBody = document.getElementById("app-body");
  const noticeBanner = document.getElementById("notice-board-banner");
  const loginContainer = document.getElementById("login-view-container");
  const appContainer = document.getElementById("authenticated-app");
  if (!main) return;

  // View: Login Page
  if (route === "#login") {
    if (appContainer) appContainer.style.display = "none";
    if (shellBody) shellBody.style.display = "none";
    if (noticeBanner) noticeBanner.style.display = "none";
    renderLoginView();
    return;
  }

  // Authenticated views: Ensure common shell is visible and login view is hidden
  if (loginContainer) loginContainer.style.display = "none";
  if (appContainer) appContainer.style.display = "flex";
  if (shellBody) shellBody.style.display = "flex";
  if (noticeBanner) noticeBanner.style.display = "block";

  const user = getCurrentUser();
  const role = getCurrentRole();

  // View: Dashboard Foundation
  if (route === "#dashboard" || route === "") {
    if (role === "STUDENT") {
      renderStudentDashboard(main, user);
    } else if (role === "WARDEN") {
      renderWardenDashboard(main, user);
    } else if (role === "HOSTEL_FACULTY") {
      renderHostelFacultyDashboard(main, user);
    } else if (role === "TEACHER") {
      renderTeacherDashboard(main, user);
    } else if (role === "LAB_ASSISTANT") {
      renderLabDashboard(main, user);
    } else if (role === "ADMIN") {
      renderAdminControlTower(main, user);
    } else if (role === "STAFF") {
      renderMaintenanceStaffDashboard(main, user);
    } else if (role === "GUARD") {
      renderGuardScanner(main, user);
    } else {
      renderDashboardView(user, role);
    }
    return;
  }

  // Workflow Handlers & Placeholders
  switch (route) {
    case "#class-management":
      if (role === "TEACHER") {
        renderTeacherClassManagement(main);
      } else {
        renderPlaceholder(
          "Class Management & Timetable Modifications",
          "Manage timetable adjustments, lecture cancellations, room changes, and slot switches."
        );
      }
      break;

    case "#gatepasses":
      if (role === "STUDENT") {
        renderStudentGatePasses(main);
      } else if (role === "WARDEN") {
        renderWardenGatePasses(main);
      } else if (role === "HOSTEL_FACULTY") {
        renderHostelFacultyGatePasses(main);
      } else if (role === "GUARD") {
        renderGuardGateActivity(main);
      } else {
        renderPlaceholder(
          "Gate Pass & QR Verification System",
          "Review student gate-pass applications, verify parental approvals, and process leave requests."
        );
      }
      break;

    case "#complaints":
      if (role === "STUDENT") {
        renderStudentComplaints(main);
      } else if (role === "WARDEN" || role === "HOSTEL_FACULTY") {
        renderHostelComplaints(main, role);
      } else if (role === "ADMIN") {
        renderAdminComplaints(main);
      } else if (role === "STAFF") {
        renderMaintenanceStaffComplaints(main);
      } else {
        renderPlaceholder(
          "Complaints & Maintenance Operations",
          "Triage, assign, and resolve maintenance tickets across campus departments."
        );
      }
      break;

    case "#sla-breaches":
      if (role === "ADMIN") {
        renderAdminSlaBreaches(main);
      } else {
        renderPlaceholder(
          "SLA Breach Monitoring",
          "SLA monitoring and escalation tracking is restricted to Campus Administrators."
        );
      }
      break;

    case "#recurring-issues":
      if (role === "ADMIN") {
        renderAdminRecurringComplaints(main);
      } else {
        renderPlaceholder(
          "Recurring Issue Intelligence",
          "Infrastructure recurrence analysis and hotspot tracking is restricted to Campus Administrators."
        );
      }
      break;

    case "#documents":
      if (role === "STUDENT") {
        renderStudentDocuments(main);
      } else {
        renderPlaceholder(
          "Digital Document & Certificate Requests",
          "Request bonafide certificates, fee estimates, and hostel dues clearances with SHA-256 verification hashes."
        );
      }
      break;

    case "#attendance":
      if (role === "STUDENT") {
        renderStudentAttendance(main);
      } else if (role === "TEACHER") {
        renderTeacherAttendance(main);
      } else {
        renderPlaceholder(
          "Lecture Attendance Management",
          "Inspect real-time subject-wise lecture attendance percentages and shortage alerts."
        );
      }
      break;

    case "#materials":
      if (role === "STUDENT") {
        renderStudentMaterials(main);
      } else if (role === "TEACHER") {
        renderTeacherMaterials(main);
      } else {
        renderPlaceholder(
          "Academic Study Materials Repository",
          "Access course syllabi, lecture notes, question banks, and reference PDFs categorized by branch and semester."
        );
      }
      break;

    case "#help-a-friend":
      if (role === "STUDENT") {
        renderStudentHelpAFriend(main);
      } else {
        renderPlaceholder(
          "Help-a-Friend Emergency Proxy System",
          "Lodge emergency proxy complaints or gate-passes on behalf of fellow students with cryptographic OTP verification."
        );
      }
      break;

    case "#announcements":
      if (role === "ADMIN") {
        renderAdminAnnouncements(main);
      } else {
        renderPlaceholder(
          "Targeted Institutional Communications",
          "Publishing institution-wide notices and broadcast alerts is restricted to Campus Administrators."
        );
      }
      break;

    case "#class-notices":
      if (role === "STUDENT") {
        renderStudentNotices(main);
      } else if (role === "TEACHER") {
        renderTeacherClassNotices(main);
      } else if (role === "LAB_ASSISTANT") {
        renderLabNotices(main);
      } else if (role === "ADMIN") {
        renderAdminAnnouncements(main);
      } else {
        renderPlaceholder(
          "Class Notices & Timetable Modifications",
          "Manage and view cohort-specific class notices, rescheduling, cancellations, and room changes."
        );
      }
      break;

    case "#notifications":
      if (role === "STUDENT") {
        renderStudentNotifications(main);
      } else if (role === "WARDEN" || role === "HOSTEL_FACULTY" || role === "STAFF" || role === "GUARD") {
        renderStaffNotifications(main);
      } else if (role === "TEACHER") {
        renderTeacherNotifications(main);
      } else if (role === "LAB_ASSISTANT") {
        renderLabNotifications(main);
      } else if (role === "ADMIN") {
        renderAdminNotifications(main);
      } else {
        renderPlaceholder(
          "System Notifications",
          "Inspect personal institutional alerts, approvals, and ticket status changes."
        );
      }
      break;

    case "#profile":
      if (role === "STUDENT") {
        renderStudentProfile(main, user);
      } else if (role === "WARDEN" || role === "HOSTEL_FACULTY" || role === "STAFF" || role === "GUARD") {
        renderStaffProfile(main, user);
      } else if (role === "TEACHER") {
        renderTeacherProfile(main, user);
      } else if (role === "LAB_ASSISTANT") {
        renderLabProfile(main, user);
      } else if (role === "ADMIN") {
        renderAdminProfile(main, user);
      } else {
        renderPlaceholder(
          "User Profile",
          "View your institutional profile, contact details, and account permissions."
        );
      }
      break;

    case "#lab":
      if (role === "LAB_ASSISTANT") {
        renderLabEquipment(main);
      } else {
        renderPlaceholder(
          "Lab & Workshop Equipment Operations",
          "Track machine working status, log equipment breakdowns, and submit consumable indents."
        );
      }
      break;

    case "#requisitions":
      if (role === "LAB_ASSISTANT") {
        renderLabRequisitions(main);
      } else {
        renderPlaceholder(
          "Laboratory Requisitions & Consumable Indents",
          "Manage workshop tool requests, purchase approvals, and supplier order tracking."
        );
      }
      break;

    case "#scanner":
      if (role === "GUARD" || role === "ADMIN") {
        renderGuardScanner(main, user);
      } else {
        renderPlaceholder(
          "Security Gate One-Time QR Pass Scanner",
          "Perimeter QR pass verification is restricted to Security Personnel and Administrators."
        );
      }
      break;

    case "#audit":
      if (role === "ADMIN") {
        renderAdminAuditLogs(main);
      } else {
        renderPlaceholder(
          "Institutional Control Tower & Audit Ledger",
          "Inspect tamper-evident system audit trails, workflow cycle-time metrics, and cross-department telemetry."
        );
      }
      break;

    case "#about":
      renderAboutView();
      break;

    default:
      renderNotFoundView(route);
      break;
  }
}

/* --------------------------------------------------------------------------
   LOGIN VIEW RENDERER
   -------------------------------------------------------------------------- */
function renderLoginView() {
  const container = document.getElementById("login-view-container");
  const appContainer = document.getElementById("authenticated-app");
  if (appContainer) appContainer.style.display = "none";
  if (!container) return;

  container.style.display = "block";
  container.innerHTML = `
    <div class="login-card">
      <div class="login-header">
        <div class="login-logo">CF</div>
        <h1 class="login-title">CampusFlow</h1>
        <p class="login-subtitle">Unified Campus Operations Platform &bull; BPUT 2026</p>
      </div>

      <div id="login-alert" class="form-alert error" role="alert">
        <span>⚠️</span>
        <span id="login-alert-msg">Invalid credentials</span>
      </div>

      <form id="login-form" autocomplete="on">
        <div class="form-group">
          <label class="form-label" for="login-identifier">
            Institutional Identifier
            <span class="form-label-desc">Email, Phone, or Roll No.</span>
          </label>
          <div class="form-control-wrap">
            <input 
              type="text" 
              id="login-identifier" 
              class="form-input" 
              placeholder="e.g. 2201042 or priya.sharma@bput.ac.in" 
              required 
              autocomplete="username"
            />
          </div>
        </div>

        <div class="form-group">
          <label class="form-label" for="login-password">
            Password
            <span class="form-label-desc">Default: CampusFlow@2026</span>
          </label>
          <div class="form-control-wrap">
            <input 
              type="password" 
              id="login-password" 
              class="form-input has-toggle" 
              placeholder="Enter password" 
              required 
              autocomplete="current-password"
            />
            <button type="button" id="btn-toggle-pwd" class="btn-password-toggle" aria-label="Show password">👁️</button>
          </div>
        </div>

        <div style="margin-top: 20px;">
          <button type="submit" id="btn-submit-login" class="btn btn-primary" style="width: 100%; height: 42px;">
            <span id="login-btn-text">Sign In to CampusFlow</span>
            <span id="login-btn-spinner" class="spinner" style="display: none; width: 18px; height: 18px;"></span>
          </button>
        </div>
      </form>

      <!-- Quick Demo Login Selector (Crucial for Hackathon Evaluators) -->
      <div class="demo-logins-box">
        <div class="demo-logins-title">
          <span>⚡ 1-Click Demo Accounts</span>
          <span>8 Institutional Roles</span>
        </div>
        <div class="demo-chips-grid">
          <button type="button" class="btn-demo-chip" data-user="priya.sharma@bput.ac.in">
            <span class="demo-chip-role">Student</span>
            <span class="demo-chip-name">Priya Sharma (CSE)</span>
          </button>
          <button type="button" class="btn-demo-chip" data-user="dean.admin@bput.ac.in">
            <span class="demo-chip-role">Campus Admin</span>
            <span class="demo-chip-name">Ashok Patnaik</span>
          </button>
          <button type="button" class="btn-demo-chip" data-user="warden.sharma@bput.ac.in">
            <span class="demo-chip-role">Warden</span>
            <span class="demo-chip-name">Sunil Sharma (Block B)</span>
          </button>
          <button type="button" class="btn-demo-chip" data-user="dr.mishra.hostel@bput.ac.in">
            <span class="demo-chip-role">Hostel Faculty</span>
            <span class="demo-chip-name">Bijoy Mishra</span>
          </button>
          <button type="button" class="btn-demo-chip" data-user="prof.mohanty@bput.ac.in">
            <span class="demo-chip-role">Teacher</span>
            <span class="demo-chip-name">Subhashree Mohanty</span>
          </button>
          <button type="button" class="btn-demo-chip" data-user="ramesh.lab@bput.ac.in">
            <span class="demo-chip-role">Lab Assistant</span>
            <span class="demo-chip-name">Ramesh Nayak</span>
          </button>
          <button type="button" class="btn-demo-chip" data-user="ramesh.estate@bput.ac.in">
            <span class="demo-chip-role">Maintenance Staff</span>
            <span class="demo-chip-name">Kailash Sahoo</span>
          </button>
          <button type="button" class="btn-demo-chip" data-user="guard.gate1@bput.ac.in">
            <span class="demo-chip-role">Security Guard</span>
            <span class="demo-chip-name">Dhaneswar Pradhan</span>
          </button>
        </div>
      </div>
    </div>
  `;

  // Attach login form submission
  const form = document.getElementById("login-form");
  const identifierInput = document.getElementById("login-identifier");
  const passwordInput = document.getElementById("login-password");
  const togglePwdBtn = document.getElementById("btn-toggle-pwd");
  const alertEl = document.getElementById("login-alert");
  const alertMsg = document.getElementById("login-alert-msg");
  const submitBtn = document.getElementById("btn-submit-login");
  const btnText = document.getElementById("login-btn-text");
  const btnSpinner = document.getElementById("login-btn-spinner");

  togglePwdBtn?.addEventListener("click", () => {
    const isPwd = passwordInput.type === "password";
    passwordInput.type = isPwd ? "text" : "password";
    togglePwdBtn.textContent = isPwd ? "🙈" : "👁️";
  });

  // Attach quick demo click handlers
  container.querySelectorAll(".btn-demo-chip").forEach(chip => {
    chip.addEventListener("click", () => {
      const email = chip.getAttribute("data-user");
      identifierInput.value = email;
      passwordInput.value = "CampusFlow@2026";
      form.requestSubmit();
    });
  });

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    alertEl.classList.remove("visible");

    submitBtn.disabled = true;
    btnText.style.display = "none";
    btnSpinner.style.display = "inline-block";

    try {
      await login(identifierInput.value, passwordInput.value);
      showToast("Authentication successful! Welcome to CampusFlow.", "success");
      submitBtn.disabled = false;
      btnText.style.display = "inline";
      btnSpinner.style.display = "none";
      window.location.hash = "#dashboard";
      handleRoute("#dashboard");
    } catch (err) {
      alertMsg.textContent = err.message || "Failed to sign in. Verify your credentials.";
      alertEl.classList.add("visible");
      submitBtn.disabled = false;
      btnText.style.display = "inline";
      btnSpinner.style.display = "none";
    }
  });
}

/* --------------------------------------------------------------------------
   DASHBOARD VIEW RENDERER (ROLE-TAILORED)
   -------------------------------------------------------------------------- */
function renderDashboardView(user, role) {
  const container = document.getElementById("login-view-container");
  const appContainer = document.getElementById("authenticated-app");
  const main = document.getElementById("app-main-content");
  if (container) container.style.display = "none";
  if (appContainer) appContainer.style.display = "flex";
  if (!main || !user) return;

  const quickActions = getQuickActions(role);

  main.innerHTML = `
    <!-- Top Welcome Banner -->
    <div class="card" style="background: linear-gradient(135deg, var(--surface), var(--surface-hover)); border-left: 4px solid var(--primary);">
      <div style="display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 12px;">
        <div>
          <div style="font-size: 1.25rem; font-weight: 700; color: var(--text);">
            ${escapeHtml(getGreeting(user.first_name))} 👋
          </div>
          <p style="margin: 4px 0 0 0; font-size: 13px; color: var(--text-secondary);">
            Logged in as <strong style="color: var(--text);">${escapeHtml(user.first_name)} ${escapeHtml(user.last_name)}</strong> &bull; 
            <span class="status-badge info">${escapeHtml(formatRole(role))}</span>
          </p>
        </div>
        <div style="display: flex; gap: 8px;">
          <a href="#about" class="btn btn-sm btn-outline">System Diagnostics</a>
        </div>
      </div>
    </div>

    <!-- Quick Operational Actions -->
    <div style="margin-top: 24px;">
      <div style="font-size: 14px; font-weight: 700; color: var(--text); margin-bottom: 8px;">
        ⚡ Operational Quick Actions
      </div>
      <div class="quick-actions-grid">
        ${quickActions.map(action => `
          <a href="${action.route}" class="quick-action-card">
            <div class="quick-action-icon">${action.icon}</div>
            <div>
              <div class="quick-action-title">${escapeHtml(action.title)}</div>
              <div class="quick-action-desc">${escapeHtml(action.desc)}</div>
            </div>
          </a>
        `).join("")}
      </div>
    </div>

    <!-- Role Telemetry & Information Grid -->
    <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 16px; margin-top: 24px;">
      <div class="card">
        <div class="card-header">
          <div class="card-title">Profile Identity</div>
          <span class="status-badge approved">✓ Active</span>
        </div>
        <div style="font-size: 13px; display: flex; flex-direction: column; gap: 8px;">
          <div><strong style="color: var(--text-muted); font-size: 11px;">EMAIL</strong><br/>${escapeHtml(user.email)}</div>
          <div><strong style="color: var(--text-muted); font-size: 11px;">PHONE</strong><br/>${escapeHtml(user.phone_number)}</div>
          ${user.student_profile ? `
            <div><strong style="color: var(--text-muted); font-size: 11px;">ROLL NUMBER</strong><br/>${escapeHtml(user.student_profile.roll_number)}</div>
            <div><strong style="color: var(--text-muted); font-size: 11px;">DEPARTMENT</strong><br/>${escapeHtml(user.student_profile.department)} (Sem ${user.student_profile.semester})</div>
            <div><strong style="color: var(--text-muted); font-size: 11px;">HOSTEL RESIDENCE</strong><br/>Room ${escapeHtml(user.student_profile.room_number || 'Day Scholar')}</div>
          ` : ''}
          ${user.staff_profile ? `
            <div><strong style="color: var(--text-muted); font-size: 11px;">DESIGNATION</strong><br/>${escapeHtml(user.staff_profile.designation)}</div>
            <div><strong style="color: var(--text-muted); font-size: 11px;">DEPARTMENT</strong><br/>${escapeHtml(user.staff_profile.department_id)}</div>
          ` : ''}
        </div>
      </div>

      <div class="card">
        <div class="card-header">
          <div class="card-title">Real-Time Platform State</div>
          <span class="status-badge approved">● Operational</span>
        </div>
        <div style="font-size: 13px; display: flex; flex-direction: column; gap: 8px;">
          <div><strong style="color: var(--text-muted); font-size: 11px;">ARCHITECTURE</strong><br/>High-Cohesion Modular Monolith</div>
          <div><strong style="color: var(--text-muted); font-size: 11px;">BACKEND ENGINE</strong><br/>FastAPI + SQLAlchemy + SQLite/PostgreSQL</div>
          <div><strong style="color: var(--text-muted); font-size: 11px;">ENCRYPTION</strong><br/>Bcrypt Password Hashing &bull; HS256 JWT</div>
          <div><strong style="color: var(--text-muted); font-size: 11px;">NETWORK STATUS</strong><br/>${navigator.onLine ? '✓ Online (Connected to Gateway)' : '⚠️ Offline (Cached App Shell)'}</div>
        </div>
      </div>
    </div>
  `;
}

function getQuickActions(role) {
  switch (role) {
    case "STUDENT":
      return [
        { title: "Apply Gate Pass", desc: "Request local or home leave pass", route: "#gatepasses", icon: "🎫" },
        { title: "Lodge Complaint", desc: "Report hostel or facility issue", route: "#complaints", icon: "🛠️" },
        { title: "Request Document", desc: "Bonafide, dues clearance", route: "#documents", icon: "📄" },
        { title: "Help-a-Friend OTP", desc: "Emergency proxy request", route: "#help-a-friend", icon: "🤝" }
      ];

    case "ADMIN":
      return [
        { title: "Complaints Audit", desc: "Review escalated tickets", route: "#complaints", icon: "🛠️" },
        { title: "Broadcast Notice", desc: "Post campus circular", route: "#class-notices", icon: "📢" },
        { title: "System Audit Logs", desc: "Trace cryptographic ledger", route: "#audit", icon: "🛡️" },
        { title: "Lab Inventory", desc: "Workshop machines & status", route: "#lab", icon: "🔬" }
      ];

    case "WARDEN":
      return [
        { title: "Approve Gate Passes", desc: "Pending student leaves", route: "#gatepasses", icon: "🎫" },
        { title: "Hostel Complaints", desc: "Plumbing, Wi-Fi, electricity", route: "#complaints", icon: "🏠" },
        { title: "Room Allotment", desc: "Senior & junior block rosters", route: "#hostel", icon: "🛏️" }
      ];

    case "HOSTEL_FACULTY":
      return [
        { title: "Leave Clearances", desc: "Faculty advisory approval", route: "#gatepasses", icon: "🎫" },
        { title: "Student Welfare", desc: "Academic counseling & welfare", route: "#students", icon: "🏛️" }
      ];

    case "TEACHER":
      return [
        { title: "Post Class Notice", desc: "Timetable or room swap", route: "#class-notices", icon: "📢" },
        { title: "Mark Attendance", desc: "Live lecture roll call", route: "#attendance", icon: "📝" },
        { title: "Upload Notes", desc: "Share lecture materials", route: "#materials", icon: "📚" }
      ];

    case "LAB_ASSISTANT":
      return [
        { title: "Machine Breakdown", desc: "Update lathe & mill status", route: "#lab", icon: "⚙️" },
        { title: "Submit Requisition", desc: "Cutting tips, coolants, tools", route: "#requisitions", icon: "📦" }
      ];

    case "STAFF":
      return [
        { title: "Assigned Repairs", desc: "Electrical & plumbing tasks", route: "#complaints", icon: "🔧" },
        { title: "Mark Resolved", desc: "Submit work completion note", route: "#maintenance", icon: "✓" }
      ];

    case "GUARD":
      return [
        { title: "Scan QR Token", desc: "Verify student gate-pass", route: "#scanner", icon: "📷" },
        { title: "Entry / Exit Log", desc: "Perimeter gate logs", route: "#gatepasses", icon: "📋" }
      ];

    default:
      return [
        { title: "Dashboard", desc: "Campus operations overview", route: "#dashboard", icon: "📊" }
      ];
  }
}

function renderAboutView() {
  const main = document.getElementById("app-main-content");
  if (!main) return;

  main.innerHTML = `
    <div class="card" style="max-width: 800px; margin: 0 auto;">
      <div class="card-header">
        <div class="card-title">CampusFlow Architecture & Diagnostics</div>
        <span class="status-badge approved">Phase 7 Ready</span>
      </div>
      <div style="font-size: 13px; line-height: 1.6; color: var(--text-secondary);">
        <p><strong>CampusFlow</strong> is the unified campus operations platform built for <strong>BPUT Hackathon 2026 Problem Statement 07</strong>.</p>
        <p>This implementation features a vanilla HTML5/CSS3/JavaScript application shell optimized for low-bandwidth institutional networks (<180 KB payload), with zero runtime framework overhead.</p>
        
        <h4 style="margin: 16px 0 8px 0; color: var(--text);">Core Foundation Highlights</h4>
        <ul style="list-style: disc; padding-left: 20px; display: flex; flex-direction: column; gap: 4px;">
          <li>Centralized API client with automatic JWT token attachment and 401 recovery.</li>
          <li>Common shell featuring immediate sub-header Notice Board (never buried in menus).</li>
          <li>Real-time In-App Notification Center with live unread badge and instant PATCH read tracking.</li>
          <li>Dynamic 8-role institutional RBAC navigation with controlled workflow placeholders.</li>
          <li>PWA Progressive Web App capability with offline shell caching via Service Worker.</li>
          <li>Dual Light and Dark themes with strict contrast compliance and accessible focus states.</li>
        </ul>
      </div>
      <div style="margin-top: 16px;">
        <a href="#dashboard" class="btn btn-primary">Return to Dashboard</a>
      </div>
    </div>
  `;
}

function renderNotFoundView(route) {
  const main = document.getElementById("app-main-content");
  if (!main) return;

  main.innerHTML = `
    <div class="card" style="max-width: 500px; margin: 40px auto; text-align: center;">
      <div class="state-container">
        <div class="state-icon">🔍</div>
        <div class="state-title">Page Not Found</div>
        <div class="state-desc">The requested route <code>${escapeHtml(route)}</code> does not exist in CampusFlow.</div>
        <div style="margin-top: 16px;">
          <a href="#dashboard" class="btn btn-primary">Go to Dashboard</a>
        </div>
      </div>
    </div>
  `;
}
