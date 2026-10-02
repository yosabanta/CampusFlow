import urllib.request
import json
import uuid
from datetime import datetime, timezone, timedelta

base_fe = 'http://127.0.0.1:5500'
base_be = 'http://127.0.0.1:8000'

def make_req(url, method='GET', data=None, token=None):
    headers = {'Content-Type': 'application/json'}
    if token:
        headers['Authorization'] = f'Bearer {token}'
    req = urllib.request.Request(url, method=method, headers=headers)
    if data is not None:
        req.data = json.dumps(data).encode()
    try:
        with urllib.request.urlopen(req) as resp:
            body = resp.read().decode('utf-8', errors='ignore')
            try:
                data = json.loads(body) if body else None
            except json.JSONDecodeError:
                data = body
            return resp.status, data
    except urllib.error.HTTPError as e:
        body = e.read().decode('utf-8', errors='ignore')
        try:
            data = json.loads(body) if body else None
        except json.JSONDecodeError:
            data = body
        return e.code, data

print("============================================================")
print("PHASE 11 AUTOMATED SMOKE & REGRESSION TEST SUITE")
print("Campus Admin Operational Control Tower")
print("============================================================")

print("\n--- 1. VERIFY FRONTEND ASSETS SERVED ---")
assets = [
    '/index.html', '/css/components.css', '/css/layout.css',
    '/js/app.js', '/js/api.js', '/js/auth.js', '/js/router.js',
    '/js/ui.js', '/js/student.js', '/js/hostel.js', '/js/academic.js',
    '/js/admin.js'
]
for path in assets:
    status, _ = make_req(base_fe + path)
    assert status == 200, f"Failed to fetch {path}, status {status}"
print(f"All {len(assets)} frontend assets verified HTTP 200 OK (including admin.js).")

print("\n--- 2. VERIFY CAMPUS ADMIN WORKFLOWS (dean.admin@bput.ac.in) ---")
# Login
st, login_data = make_req(base_be + '/api/v1/auth/login', 'POST', {
    'username': 'dean.admin@bput.ac.in',
    'password': 'CampusFlow@2026'
})
assert st == 200, f"Admin login failed: {st}"
admin_token = login_data['access_token']
assert login_data['user']['role'] == 'ADMIN', f"Expected ADMIN, got {login_data['user']['role']}"
print(f"Admin login OK: {login_data['user']['email']} (Role: {login_data['user']['role']})")

# Profile /auth/me
st, me = make_req(base_be + '/api/v1/auth/me', 'GET', token=admin_token)
assert st == 200 and me['email'] == 'dean.admin@bput.ac.in'
assert me['role'] == 'ADMIN'
print(f"Profile verified: {me['first_name']} {me['last_name']} - {me['email']}")

# A. Control Tower Metrics
print("\n--- A. CONTROL TOWER METRICS ---")
st, metrics = make_req(base_be + '/api/v1/admin/control-tower/metrics', 'GET', token=admin_token)
assert st == 200, f"Metrics failed: {st}, {metrics}"
assert 'total_complaints' in metrics
assert 'complaints_by_status' in metrics
assert 'sla_breaches_count' in metrics
assert 'recurring_hotspots_count' in metrics
assert 'staff_workload' in metrics
print(f"Metrics Loaded: Total Complaints={metrics['total_complaints']}, SLA Breaches={metrics['sla_breaches_count']}, Recurring Hotspots={metrics['recurring_hotspots_count']}, Staff Workload Count={len(metrics['staff_workload'])}")

# B. SLA Breaches View
print("\n--- B. SLA BREACHES VIEW ---")
st, breaches = make_req(base_be + '/api/v1/admin/control-tower/sla-breaches', 'GET', token=admin_token)
assert st == 200, f"SLA Breaches failed: {st}, {breaches}"
assert isinstance(breaches, list)
print(f"SLA Breaches retrieved: {len(breaches)} active breach ticket(s).")
if len(breaches) > 0:
    sample_b = breaches[0]
    print(f"Sample Breach: [{sample_b.get('category')}] {sample_b.get('title')} (Status: {sample_b.get('status')})")

# C. Recurring Complaints View
print("\n--- C. RECURRING COMPLAINTS VIEW ---")
st, recurring = make_req(base_be + '/api/v1/admin/control-tower/recurring-complaints', 'GET', token=admin_token)
assert st == 200, f"Recurring complaints failed: {st}, {recurring}"
assert isinstance(recurring, list)
print(f"Recurring Complaints retrieved: {len(recurring)} flagged hotspot item(s).")
if len(recurring) > 0:
    sample_r = recurring[0]
    print(f"Sample Hotspot: [{sample_r.get('category')}] {sample_r.get('location')} - '{sample_r.get('title')}'")

# D. Complaints Operations & Maintenance Assignment
print("\n--- D. COMPLAINTS OPERATIONS & ASSIGNMENT ---")
st, complaints = make_req(base_be + '/api/v1/complaints', 'GET', token=admin_token)
assert st == 200, f"Complaints failed: {st}"
print(f"Complaints retrieved: {len(complaints)} total ticket(s).")

# Test Staff Assignment on an existing open complaint
open_complaints = [c for c in complaints if c.get('status') in ['OPEN', 'REOPENED', 'ASSIGNED']]
target_c = open_complaints[0] if open_complaints else complaints[0]
cid = target_c['id']

# Assign to Maintenance Supervisor Kailash Sahoo (21ec6b37-1466-4abd-89e0-063336cf4781)
staff_id = "21ec6b37-1466-4abd-89e0-063336cf4781"
st, assign_res = make_req(base_be + f'/api/v1/complaints/{cid}/assign', 'PATCH', {'assigned_staff_id': staff_id}, token=admin_token)
assert st == 200, f"Assignment failed: {st}, {assign_res}"
assert assign_res.get('assigned_staff_id') == staff_id
assert assign_res.get('status') == 'ASSIGNED'
print(f"Complaint {cid[:8]} successfully assigned to staff {staff_id[:8]}! Status: {assign_res.get('status')}")

# Update status to IN_PROGRESS
st, status_res = make_req(base_be + f'/api/v1/complaints/{cid}/status', 'PATCH', {
    'status': 'IN_PROGRESS',
    'resolution_notes': 'Maintenance team dispatched to site for inspection.'
}, token=admin_token)
assert st == 200, f"Status update failed: {st}, {status_res}"
assert status_res.get('status') == 'IN_PROGRESS'
print(f"Complaint {cid[:8]} status updated to IN_PROGRESS with resolution notes.")

# E. Targeted Announcements / Class Notices
print("\n--- E. TARGETED ANNOUNCEMENTS / COMMUNICATIONS ---")
announcement_subject = f"Phase 11 Campus Directive {uuid.uuid4().hex[:6].upper()}"
ann_payload = {
    "notice_type": "RESCHEDULED",
    "subject": announcement_subject,
    "target_branch": "Computer Science & Engineering",
    "target_year": 2022,
    "target_semester": 6,
    "target_section": "A",
    "class_date": (datetime.now(timezone.utc) + timedelta(days=1)).isoformat(),
    "period": "10:00 AM - 11:00 AM",
    "details": "Campus power grid maintenance scheduled for Sunday 10:00 AM - 02:00 PM. High-draw lab equipment must be powered down."
}
st, created_ann = make_req(base_be + '/api/v1/class-notices', 'POST', ann_payload, token=admin_token)
assert st == 201, f"Create announcement failed: {st}, {created_ann}"
assert created_ann['subject'] == announcement_subject
assert created_ann['target_branch'] == "Computer Science & Engineering"
print(f"Announcement Created: '{created_ann['subject']}' (ID: {created_ann['id'][:8]})")

# Verify persistence via GET /class-notices
st, notices_list = make_req(base_be + '/api/v1/class-notices', 'GET', token=admin_token)
assert st == 200
found = any(n['id'] == created_ann['id'] for n in notices_list)
assert found, "Created announcement was not found in persistence list!"
print(f"Announcement persistence verified on GET /api/v1/class-notices (Total notices: {len(notices_list)}).")

# F. System Audit Ledger
print("\n--- F. SYSTEM AUDIT LOGS ---")
st, audit_logs = make_req(base_be + '/api/v1/admin/audit-logs?limit=10', 'GET', token=admin_token)
assert st == 200, f"Audit logs failed: {st}, {audit_logs}"
assert isinstance(audit_logs, list)
assert len(audit_logs) > 0
print(f"Audit Logs retrieved: {len(audit_logs)} log events.")
sample_log = audit_logs[0]
print(f"Sample Audit Event: [{sample_log.get('timestamp')}] {sample_log.get('action')} on {sample_log.get('entity_type')} (ID: {sample_log.get('id')})")

# Test filtering by entity_type
st, filtered_logs = make_req(base_be + '/api/v1/admin/audit-logs?entity_type=COMPLAINT&limit=5', 'GET', token=admin_token)
assert st == 200 and isinstance(filtered_logs, list)
print(f"Filtered Audit Logs (COMPLAINT): {len(filtered_logs)} record(s) found.")

# G. Notifications
print("\n--- G. ADMIN NOTIFICATIONS ---")
st, notifs_data = make_req(base_be + '/api/v1/notifications', 'GET', token=admin_token)
assert st == 200, f"Notifications failed: {st}"
notifs = notifs_data.get('notifications', []) if isinstance(notifs_data, dict) else notifs_data
print(f"Admin Notifications: {len(notifs)} notification(s) retrieved (Unread: {notifs_data.get('unread_count', 0)}).")
if len(notifs) > 0:
    first_notif = notifs[0]
    st, read_res = make_req(base_be + f'/api/v1/notifications/{first_notif["id"]}/read', 'PATCH', token=admin_token)
    assert st == 200
    print(f"Notification {first_notif['id'][:8]} marked as read successfully.")

# H. RBAC Verification
print("\n--- H. RBAC BOUNDARY VERIFICATION ---")
# Admin should NOT be able to lodge student complaints (Student-only)
st, denied_lodge = make_req(base_be + '/api/v1/complaints', 'POST', {
    "title": "Unauthorized Admin Complaint",
    "description": "Admin lodge test",
    "category": "MAINTENANCE",
    "location": "Hostel 1"
}, token=admin_token)
assert st in [401, 403], f"Expected 401/403 for Admin lodging complaint, got {st}"
print(f"Admin correctly denied student-only endpoint (HTTP {st}).")

# Student should NOT be able to access Admin Control Tower metrics
st_login, s_data = make_req(base_be + '/api/v1/auth/login', 'POST', {
    'username': 'priya.sharma@bput.ac.in',
    'password': 'CampusFlow@2026'
})
st_token = s_data['access_token']
st, student_denied = make_req(base_be + '/api/v1/admin/control-tower/metrics', 'GET', token=st_token)
assert st in [401, 403], f"Expected 401/403 for Student accessing Admin metrics, got {st}"
print(f"Student correctly denied Admin Control Tower metrics (HTTP {st}).")

# --- CROSS-ROLE REGRESSION ---
print("\n============================================================")
print("CROSS-ROLE REGRESSION CHECKS")
print("============================================================")

# 1. Student Regression
print("\n--- 1. STUDENT REGRESSION (priya.sharma@bput.ac.in) ---")
st, s_profile = make_req(base_be + '/api/v1/auth/me', 'GET', token=st_token)
assert st == 200 and s_profile['role'] == 'STUDENT'
st, s_complaints = make_req(base_be + '/api/v1/complaints', 'GET', token=st_token)
assert st == 200
st, s_passes = make_req(base_be + '/api/v1/gatepasses', 'GET', token=st_token)
assert st == 200
st, s_docs = make_req(base_be + '/api/v1/documents', 'GET', token=st_token)
assert st == 200
st, s_mat = make_req(base_be + '/api/v1/materials', 'GET', token=st_token)
assert st == 200
st, s_notifs = make_req(base_be + '/api/v1/notifications', 'GET', token=st_token)
assert st == 200
s_notif_count = len(s_notifs.get('notifications', [])) if isinstance(s_notifs, dict) else len(s_notifs)
print(f"Student Regression PASSED: Profile, Complaints ({len(s_complaints)}), Gate Passes ({len(s_passes)}), Documents ({len(s_docs)}), Materials ({len(s_mat)}), Notifications ({s_notif_count}).")

# 2. Warden Regression
print("\n--- 2. WARDEN REGRESSION (warden.sharma@bput.ac.in) ---")
st, w_login = make_req(base_be + '/api/v1/auth/login', 'POST', {
    'username': 'warden.sharma@bput.ac.in',
    'password': 'CampusFlow@2026'
})
assert st == 200
w_token = w_login['access_token']
st, w_passes = make_req(base_be + '/api/v1/gatepasses', 'GET', token=w_token)
assert st == 200
st, w_comp = make_req(base_be + '/api/v1/complaints', 'GET', token=w_token)
assert st == 200
st, w_notifs = make_req(base_be + '/api/v1/notifications', 'GET', token=w_token)
assert st == 200
w_notif_count = len(w_notifs.get('notifications', [])) if isinstance(w_notifs, dict) else len(w_notifs)
print(f"Warden Regression PASSED: Gate Passes ({len(w_passes)}), Complaints ({len(w_comp)}), Notifications ({w_notif_count}).")

# 3. Hostel Faculty Regression
print("\n--- 3. HOSTEL FACULTY REGRESSION (dr.mishra.hostel@bput.ac.in) ---")
st, hf_login = make_req(base_be + '/api/v1/auth/login', 'POST', {
    'username': 'dr.mishra.hostel@bput.ac.in',
    'password': 'CampusFlow@2026'
})
assert st == 200
hf_token = hf_login['access_token']
st, hf_passes = make_req(base_be + '/api/v1/gatepasses', 'GET', token=hf_token)
assert st == 200
st, hf_comp = make_req(base_be + '/api/v1/complaints', 'GET', token=hf_token)
assert st == 200
print(f"Hostel Faculty Regression PASSED: Gate Passes ({len(hf_passes)}), Complaints ({len(hf_comp)}).")

# 4. Teacher Regression
print("\n--- 4. TEACHER REGRESSION (prof.mohanty@bput.ac.in) ---")
st, t_login = make_req(base_be + '/api/v1/auth/login', 'POST', {
    'username': 'prof.mohanty@bput.ac.in',
    'password': 'CampusFlow@2026'
})
assert st == 200
t_token = t_login['access_token']
st, t_notices = make_req(base_be + '/api/v1/class-notices', 'GET', token=t_token)
assert st == 200
st, t_materials = make_req(base_be + '/api/v1/materials', 'GET', token=t_token)
assert st == 200
print(f"Teacher Regression PASSED: Class Notices ({len(t_notices)}), Study Materials ({len(t_materials)}).")

# 5. Lab Assistant Regression
print("\n--- 5. LAB ASSISTANT REGRESSION (ramesh.lab@bput.ac.in) ---")
st, l_login = make_req(base_be + '/api/v1/auth/login', 'POST', {
    'username': 'ramesh.lab@bput.ac.in',
    'password': 'CampusFlow@2026'
})
assert st == 200
l_token = l_login['access_token']
st, l_equip = make_req(base_be + '/api/v1/lab/equipment', 'GET', token=l_token)
assert st == 200
st, l_reqs = make_req(base_be + '/api/v1/lab/requisitions', 'GET', token=l_token)
assert st == 200
print(f"Lab Assistant Regression PASSED: Equipment ({len(l_equip)}), Requisitions ({len(l_reqs)}).")

print("\n============================================================")
print("ALL PHASE 11 & CROSS-ROLE SMOKE TESTS COMPLETED SUCCESSFULLY!")
print("============================================================")
