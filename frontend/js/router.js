/**
 * CampusFlow MVP — Client-Side Hash Router
 * Routes between Login, Role Dashboards, and Controlled Workflow Placeholders
 */

import { store } from "./state.js";
import { api } from "./api.js";
import { isAuthenticated, getCurrentUser, getCurrentRole, login, demoLogin, registerStudent } from "./auth.js";
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
/* --------------------------------------------------------------------------
   LOGIN & REGISTRATION VIEW RENDERER (CLEAN & DATABASE-DRIVEN)
   -------------------------------------------------------------------------- */
function renderLoginView() {
  const container = document.getElementById("login-view-container");
  const appContainer = document.getElementById("authenticated-app");
  if (appContainer) appContainer.style.display = "none";
  if (!container) return;

  container.style.display = "block";
  container.innerHTML = `
    <div class="login-card" style="max-width: 480px;">
      <div class="login-header">
        <div class="login-logo">CF</div>
        <h1 class="login-title">CampusFlow</h1>
        <p class="login-subtitle">Unified Campus Operations Platform &bull; BPUT 2026</p>
      </div>

      <!-- Auth Mode Switcher -->
      <div class="filter-tabs" style="margin-bottom: 20px; display: flex; width: 100%;">
        <button type="button" id="tab-auth-login" class="filter-tab active" style="flex: 1; text-align: center;">Sign In</button>
        <button type="button" id="tab-auth-register" class="filter-tab" style="flex: 1; text-align: center;">Student Registration</button>
      </div>

      <div id="login-alert" class="form-alert error" role="alert">
        <span>⚠️</span>
        <span id="login-alert-msg">Invalid credentials</span>
      </div>

      <!-- 1. SIGN IN FORM -->
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
              placeholder="e.g. roll number or email" 
              required 
              autocomplete="username"
            />
          </div>
        </div>

        <div class="form-group">
          <label class="form-label" for="login-password">
            Password
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

        <div style="margin-top: 16px; font-size: 11px; color: var(--text-muted); text-align: center; line-height: 1.5;">
          🔒 Fully database-driven. First Campus Administrator can be bootstrapped via CLI (<code>python bootstrap_admin.py</code>).
        </div>

        <!-- QUICK DEMO ONE-TAP LOGIN SECTION -->
        <div id="demo-logins-section" class="demo-logins-box" style="display: none;">
          <div class="demo-logins-title">
            <span>⚡ Quick Demo Login</span>
            <span style="font-size: 10px; font-weight: normal; color: var(--text-muted);">Non-Production Only</span>
          </div>
          <div class="demo-chips-grid" id="demo-chips-grid"></div>
        </div>
      </form>

      <!-- 2. STUDENT SELF-REGISTRATION FORM -->
      <form id="register-form" style="display: none;" autocomplete="off">
        <div class="form-group">
          <label class="form-label" for="reg-name">Full Name *</label>
          <input type="text" id="reg-name" class="form-input" placeholder="e.g. Priya Sharma" required />
        </div>

        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px;">
          <div class="form-group">
            <label class="form-label" for="reg-email">Institutional Email *</label>
            <input type="email" id="reg-email" class="form-input" placeholder="name@campus.edu" required />
          </div>
          <div class="form-group">
            <label class="form-label" for="reg-phone">Mobile Number *</label>
            <input type="tel" id="reg-phone" class="form-input" placeholder="10-digit mobile number" required pattern="[0-9]{10,15}" />
          </div>
        </div>

        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px;">
          <div class="form-group">
            <label class="form-label" for="reg-password">Password (min 8 chars) *</label>
            <input type="password" id="reg-password" class="form-input" placeholder="Create secure password" minlength="8" required />
          </div>
          <div class="form-group">
            <label class="form-label" for="reg-confirm-password">Confirm Password *</label>
            <input type="password" id="reg-confirm-password" class="form-input" placeholder="Re-enter password" minlength="8" required />
          </div>
        </div>

        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px;">
          <div class="form-group">
            <label class="form-label" for="reg-roll">College Roll Number *</label>
            <input type="text" id="reg-roll" class="form-input" placeholder="e.g. 2201042" required />
          </div>
          <div class="form-group">
            <label class="form-label" for="reg-uni-reg">University Registration Number *</label>
            <input type="text" id="reg-uni-reg" class="form-input" placeholder="e.g. 2201108204" required />
          </div>
        </div>

        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px;">
          <div class="form-group">
            <label class="form-label" for="reg-branch">Department / Branch</label>
            <input type="text" id="reg-branch" class="form-input" placeholder="Computer Science & Engineering" value="Computer Science & Engineering" />
          </div>
          <div class="form-group">
            <label class="form-label" for="reg-batch">Batch Year</label>
            <input type="number" id="reg-batch" class="form-input" placeholder="2026" value="2026" />
          </div>
        </div>

        <!-- Accommodation Type Selection (Required) -->
        <div class="form-group">
          <label class="form-label" for="reg-accommodation">Accommodation Type *</label>
          <select id="reg-accommodation" class="form-select" required>
            <option value="Day Scholar" selected>Day Scholar</option>
            <option value="Hosteler">Hosteler</option>
          </select>
        </div>

        <!-- Dynamic Hostel Residency Fields Container (Shown only when Hosteler is selected) -->
        <div id="hostel-fields-container" style="display: none; padding: 12px; border: 1px solid var(--border-subtle); border-radius: var(--radius-md); background: var(--surface-secondary); margin-bottom: 12px;">
          <div style="font-size: 11px; font-weight: 700; color: var(--color-royal-iris); margin-bottom: 8px; text-transform: uppercase;">
            🏢 Hostel Residency Details
          </div>
          <div class="form-group">
            <label class="form-label" for="reg-hostel-select">Hostel Facility *</label>
            <select id="reg-hostel-select" class="form-select">
              <option value="">-- Loading available hostels... --</option>
            </select>
            <div id="reg-hostel-hint" style="font-size: 11px; color: var(--text-muted); margin-top: 4px;"></div>
          </div>
          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px;">
            <div class="form-group">
              <label class="form-label" for="reg-hostel-block">Hostel Block (if applicable)</label>
              <input type="text" id="reg-hostel-block" class="form-input" placeholder="e.g. Block A" />
            </div>
            <div class="form-group">
              <label class="form-label" for="reg-room">Room Number (if applicable)</label>
              <input type="text" id="reg-room" class="form-input" placeholder="e.g. 104" />
            </div>
          </div>
        </div>

        <div style="margin-top: 16px;">
          <button type="submit" id="btn-submit-reg" class="btn btn-secondary" style="width: 100%; height: 42px;">
            <span id="reg-btn-text">Complete Student Enrollment</span>
            <span id="reg-btn-spinner" class="spinner" style="display: none; width: 18px; height: 18px;"></span>
          </button>
        </div>
      </form>
    </div>
  `;

  // Attach tabs switcher
  const tabLogin = document.getElementById("tab-auth-login");
  const tabRegister = document.getElementById("tab-auth-register");
  const formLogin = document.getElementById("login-form");
  const formRegister = document.getElementById("register-form");
  const alertEl = document.getElementById("login-alert");
  const alertMsg = document.getElementById("login-alert-msg");

  tabLogin?.addEventListener("click", () => {
    tabLogin.classList.add("active");
    tabRegister?.classList.remove("active");
    formLogin.style.display = "block";
    formRegister.style.display = "none";
    alertEl?.classList.remove("visible");
  });

  tabRegister?.addEventListener("click", () => {
    tabRegister.classList.add("active");
    tabLogin?.classList.remove("active");
    formRegister.style.display = "block";
    formLogin.style.display = "none";
    alertEl?.classList.remove("visible");
  });

  // Attach Accommodation Type change handler (Hosteler vs Day Scholar)
  const accommodationSelect = document.getElementById("reg-accommodation");
  const hostelContainer = document.getElementById("hostel-fields-container");
  const hostelSelect = document.getElementById("reg-hostel-select");
  const hostelBlockInput = document.getElementById("reg-hostel-block");
  const roomInput = document.getElementById("reg-room");
  const hostelHint = document.getElementById("reg-hostel-hint");

  let hostelsLoaded = false;
  const loadHostelsList = async () => {
    try {
      const list = await api.get("/api/v1/auth/hostels");
      if (!hostelSelect) return;
      if (list && list.length > 0) {
        hostelSelect.innerHTML = `<option value="">-- Select Hostel Facility --</option>` +
          list.map(h => `<option value="${h.id}">${escapeHtml(h.name)} (${escapeHtml(h.code)}) — ${h.available_rooms} rooms available</option>`).join("");
        if (hostelHint) hostelHint.textContent = `${list.length} campus hostel facility records found.`;
      } else {
        hostelSelect.innerHTML = `<option value="">-- No hostels registered in DB yet --</option>`;
        if (hostelHint) hostelHint.textContent = "No hostel facilities configured in database yet. Hostels can be created by Admin.";
      }
      hostelsLoaded = true;
    } catch (err) {
      if (hostelSelect) hostelSelect.innerHTML = `<option value="">-- Select Hostel --</option>`;
      if (hostelHint) hostelHint.textContent = "Could not load hostels from server.";
    }
  };

  accommodationSelect?.addEventListener("change", async () => {
    const isHosteler = accommodationSelect.value === "Hosteler";
    if (isHosteler) {
      if (hostelContainer) hostelContainer.style.display = "block";
      if (!hostelsLoaded) {
        await loadHostelsList();
      }
    } else {
      // Day Scholar: Hide hostel fields immediately and clear all values
      if (hostelContainer) hostelContainer.style.display = "none";
      if (hostelSelect) hostelSelect.value = "";
      if (hostelBlockInput) hostelBlockInput.value = "";
      if (roomInput) roomInput.value = "";
    }
  });

  // Attach password toggle
  const passwordInput = document.getElementById("login-password");
  const togglePwdBtn = document.getElementById("btn-toggle-pwd");
  togglePwdBtn?.addEventListener("click", () => {
    const isPwd = passwordInput.type === "password";
    passwordInput.type = isPwd ? "text" : "password";
    togglePwdBtn.textContent = isPwd ? "🙈" : "👁️";
  });

  // Attach login submission
  const identifierInput = document.getElementById("login-identifier");
  const submitBtn = document.getElementById("btn-submit-login");
  const btnText = document.getElementById("login-btn-text");
  const btnSpinner = document.getElementById("login-btn-spinner");

  formLogin.addEventListener("submit", async (e) => {
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

  // Load Quick Demo Login accounts if enabled (non-production only)
  const demoSection = document.getElementById("demo-logins-section");
  const demoGrid = document.getElementById("demo-chips-grid");
  const loadDemoAccounts = async () => {
    try {
      const accounts = await api.get("/api/v1/auth/demo-accounts");
      if (accounts && accounts.length > 0 && demoSection && demoGrid) {
        demoGrid.innerHTML = accounts.map(acc => `
          <button type="button" class="btn-demo-chip" data-role="${escapeHtml(acc.role)}" data-username="${escapeHtml(acc.username)}" title="${escapeHtml(acc.subtext)}">
            <span style="font-weight: 700; color: var(--text);">${escapeHtml(acc.role_label)}</span>
            <span style="font-size: 10px; color: var(--text-muted); text-overflow: ellipsis; overflow: hidden; white-space: nowrap;">${escapeHtml(acc.display_name)}</span>
          </button>
        `).join("");
        demoSection.style.display = "block";

        demoGrid.querySelectorAll(".btn-demo-chip").forEach(btn => {
          btn.addEventListener("click", async () => {
            const role = btn.dataset.role;
            const username = btn.dataset.username;
            alertEl?.classList.remove("visible");
            const roleName = btn.querySelector("span")?.textContent || role;
            btn.style.opacity = "0.5";
            btn.style.pointerEvents = "none";
            try {
              await demoLogin(role, username);
              showToast(`Authenticated as ${roleName}! Welcome to CampusFlow.`, "success");
              window.location.hash = "#dashboard";
              handleRoute("#dashboard");
            } catch (err) {
              btn.style.opacity = "1";
              btn.style.pointerEvents = "auto";
              alertMsg.textContent = err.message || "Quick demo login failed.";
              alertEl?.classList.add("visible");
            }
          });
        });
      }
    } catch (err) {
      // Demo accounts disabled or unavailable in production — keep drawer hidden
      if (demoSection) demoSection.style.display = "none";
    }
  };
  loadDemoAccounts();

  // Attach registration submission
  formRegister?.addEventListener("submit", async (e) => {
    e.preventDefault();
    alertEl.classList.remove("visible");

    const regBtn = document.getElementById("btn-submit-reg");
    const regBtnText = document.getElementById("reg-btn-text");
    const regBtnSpinner = document.getElementById("reg-btn-spinner");

    const pwd = document.getElementById("reg-password").value;
    const confirmPwd = document.getElementById("reg-confirm-password").value;

    if (pwd !== confirmPwd) {
      alertMsg.textContent = "Password and confirm password do not match. Please verify.";
      alertEl.classList.add("visible");
      return;
    }

    const isHosteler = accommodationSelect.value === "Hosteler";
    let selectedHostelId = null;
    let selectedHostelName = null;

    if (isHosteler && hostelSelect && hostelSelect.value) {
      selectedHostelId = hostelSelect.value;
      if (hostelSelect.selectedIndex >= 0) {
        selectedHostelName = hostelSelect.options[hostelSelect.selectedIndex].text.split("—")[0].trim();
      }
    }

    regBtn.disabled = true;
    regBtnText.style.display = "none";
    regBtnSpinner.style.display = "inline-block";

    const payload = {
      full_name: document.getElementById("reg-name").value.trim(),
      email: document.getElementById("reg-email").value.trim(),
      phone: document.getElementById("reg-phone").value.trim(),
      password: pwd,
      confirm_password: confirmPwd,
      college_roll_number: document.getElementById("reg-roll").value.trim().toUpperCase(),
      roll_number: document.getElementById("reg-roll").value.trim().toUpperCase(),
      university_reg_number: document.getElementById("reg-uni-reg").value.trim().toUpperCase(),
      accommodation_type: isHosteler ? "Hosteler" : "Day Scholar",
      hostel_id: isHosteler ? selectedHostelId : null,
      hostel_name: isHosteler ? selectedHostelName : null,
      hostel_block: isHosteler ? (hostelBlockInput?.value.trim() || null) : null,
      room_number: isHosteler ? (roomInput?.value.trim() || null) : null,
      department: document.getElementById("reg-branch").value.trim() || "Computer Science & Engineering",
      batch_year: parseInt(document.getElementById("reg-batch").value, 10) || 2026,
      section: "A"
    };

    try {
      await registerStudent(payload);
      showToast("Student enrollment successful! Logging in...", "success");
      await login(payload.email, payload.password);
      regBtn.disabled = false;
      regBtnText.style.display = "inline";
      regBtnSpinner.style.display = "none";
      window.location.hash = "#dashboard";
      handleRoute("#dashboard");
    } catch (err) {
      alertMsg.textContent = err.message || "Enrollment failed. Please check your inputs.";
      alertEl.classList.add("visible");
      regBtn.disabled = false;
      regBtnText.style.display = "inline";
      regBtnSpinner.style.display = "none";
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

  const roleIdentityMap = {
    STUDENT: {
      gradient: "linear-gradient(135deg, var(--color-night-violet) 0%, var(--color-royal-iris) 100%)",
      borderAccent: "var(--color-butter-yellow)",
      badgeBg: "var(--color-butter-yellow)",
      badgeColor: "var(--color-graphite)"
    },
    WARDEN: {
      gradient: "linear-gradient(135deg, var(--color-graphite) 0%, #3B2A20 100%)",
      borderAccent: "var(--color-soft-apricot)",
      badgeBg: "var(--color-soft-apricot)",
      badgeColor: "var(--color-graphite)"
    },
    HOSTEL_FACULTY: {
      gradient: "linear-gradient(135deg, var(--color-graphite) 0%, #064E3B 100%)",
      borderAccent: "var(--color-champagne)",
      badgeBg: "var(--color-champagne)",
      badgeColor: "var(--color-emerald-ink)"
    },
    TEACHER: {
      gradient: "linear-gradient(135deg, var(--color-graphite) 0%, #2A1152 100%)",
      borderAccent: "var(--color-ultra-violet)",
      badgeBg: "rgba(106, 0, 244, 0.25)",
      badgeColor: "#E0D0FF"
    },
    LAB_ASSISTANT: {
      gradient: "linear-gradient(135deg, var(--color-graphite) 0%, #3B0E2A 100%)",
      borderAccent: "var(--color-dragonfruit)",
      badgeBg: "rgba(255, 70, 150, 0.25)",
      badgeColor: "#FFB0D2"
    },
    STAFF: {
      gradient: "linear-gradient(135deg, var(--color-graphite) 0%, #2B2818 100%)",
      borderAccent: "var(--color-butter-yellow)",
      badgeBg: "var(--color-butter-yellow)",
      badgeColor: "var(--color-graphite)"
    },
    GUARD: {
      gradient: "linear-gradient(135deg, var(--color-night-violet) 0%, #0B291D 100%)",
      borderAccent: "var(--color-lime-spark)",
      badgeBg: "var(--color-lime-spark)",
      badgeColor: "var(--color-graphite)"
    },
    ADMIN: {
      gradient: "linear-gradient(135deg, var(--color-graphite) 0%, var(--color-royal-iris) 100%)",
      borderAccent: "var(--color-ultra-violet)",
      badgeBg: "var(--color-ultra-violet)",
      badgeColor: "#FFFFFF"
    }
  };

  const iden = roleIdentityMap[role] || {
    gradient: "linear-gradient(135deg, var(--color-graphite) 0%, var(--color-night-violet) 100%)",
    borderAccent: "var(--color-signal-blue)",
    badgeBg: "rgba(0, 87, 255, 0.2)",
    badgeColor: "#A8CCFF"
  };

  main.innerHTML = `
    <!-- Top Welcome Banner with Role-Specific Palette Identity (Item 10) -->
    <div class="card card-graphite" style="background: ${iden.gradient}; border-left: 5px solid ${iden.borderAccent}; box-shadow: var(--shadow-md);">
      <div style="display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 12px;">
        <div>
          <div style="font-size: 1.25rem; font-weight: 700; color: #FFFFFF;">
            ${escapeHtml(getGreeting(user.first_name))} 👋
          </div>
          <p style="margin: 4px 0 0 0; font-size: 13px; color: #CBD2DE;">
            Logged in as <strong style="color: #FFFFFF;">${escapeHtml(user.first_name)} ${escapeHtml(user.last_name)}</strong> &bull; 
            <span class="status-badge" style="background: ${iden.badgeBg}; color: ${iden.badgeColor}; border: 1px solid ${iden.borderAccent}; font-weight: 700;">${escapeHtml(formatRole(role))}</span>
          </p>
        </div>
        <div style="display: flex; gap: 8px;">
          <a href="#about" class="btn btn-sm btn-outline-secondary" style="border-color: rgba(255, 255, 255, 0.2); color: #FFFFFF;">System Diagnostics</a>
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
            <div><strong style="color: var(--text-muted); font-size: 11px;">COLLEGE ROLL NUMBER</strong><br/><code style="font-weight: 700;">${escapeHtml(user.student_profile.college_roll_number || user.student_profile.roll_number)}</code></div>
            <div><strong style="color: var(--text-muted); font-size: 11px;">UNIVERSITY REG. NUMBER</strong><br/><code style="font-weight: 700;">${escapeHtml(user.student_profile.university_reg_number || 'Pending Verification')}</code></div>
            <div><strong style="color: var(--text-muted); font-size: 11px;">ACCOMMODATION TYPE</strong><br/>
              <span class="status-badge ${user.student_profile.accommodation_type === 'HOSTELER' || user.student_profile.accommodation_type === 'Hosteler' ? 'info' : 'approved'}" style="font-size: 10px;">
                ${user.student_profile.accommodation_type === 'HOSTELER' || user.student_profile.accommodation_type === 'Hosteler' ? '🏢 Hosteler' : '🏡 Day Scholar'}
              </span>
            </div>
            ${(user.student_profile.accommodation_type === 'HOSTELER' || user.student_profile.accommodation_type === 'Hosteler' || user.student_profile.room_number) ? `
              <div><strong style="color: var(--text-muted); font-size: 11px;">HOSTEL RESIDENCE</strong><br/>${escapeHtml(user.student_profile.hostel_block ? `${user.student_profile.hostel_block} • ` : '')}Room ${escapeHtml(user.student_profile.room_number || 'Assigned')}</div>
            ` : ''}
            <div><strong style="color: var(--text-muted); font-size: 11px;">DEPARTMENT</strong><br/>${escapeHtml(user.student_profile.department)} (Sem ${user.student_profile.semester})</div>
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
