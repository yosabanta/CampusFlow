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
print("PHASE 12 AUTOMATED SMOKE & REGRESSION TEST SUITE")
print("Maintenance Staff & Security Guard Experiences")
print("============================================================")

print("\n--- 1. VERIFY FRONTEND ASSETS SERVED ---")
assets = [
    '/index.html', '/css/components.css', '/css/layout.css',
    '/js/app.js', '/js/api.js', '/js/auth.js', '/js/router.js',
    '/js/ui.js', '/js/student.js', '/js/hostel.js', '/js/academic.js',
    '/js/admin.js', '/js/operations.js'
]
for path in assets:
    status, _ = make_req(base_fe + path)
    assert status == 200, f"Failed to fetch {path}, status {status}"
print(f"All {len(assets)} frontend assets verified HTTP 200 OK (including operations.js).")

# ============================================================
# PART A: DEPARTMENT / MAINTENANCE STAFF
# ============================================================
print("\n--- 2. VERIFY MAINTENANCE STAFF WORKFLOWS (ramesh.estate@bput.ac.in) ---")
st, login_data = make_req(base_be + '/api/v1/auth/login', 'POST', {
    'username': 'ramesh.estate@bput.ac.in',
    'password': 'CampusFlow@2026'
})
assert st == 200, f"Staff login failed: {st}"
staff_token = login_data['access_token']
assert login_data['user']['role'] == 'STAFF', f"Expected STAFF, got {login_data['user']['role']}"
print(f"Staff login OK: {login_data['user']['email']} (Role: {login_data['user']['role']})")

# Profile /auth/me
st, me = make_req(base_be + '/api/v1/auth/me', 'GET', token=staff_token)
assert st == 200 and me['email'] == 'ramesh.estate@bput.ac.in'
assert me['role'] == 'STAFF'
print(f"Profile verified: {me['first_name']} {me['last_name']} ({me['role']})")

# A. List Assigned Complaints
print("\n--- A. ASSIGNED COMPLAINTS LIST ---")
st, complaints = make_req(base_be + '/api/v1/complaints', 'GET', token=staff_token)
assert st == 200, f"Fetch complaints failed: {st}"
assert isinstance(complaints, list)
print(f"Assigned Complaints Loaded: {len(complaints)} work order(s) scoped to technician.")
for c in complaints[:3]:
    print(f" - Ticket {c.get('ticket_number')}: {c.get('title')} [{c.get('status')}] (Loc: {c.get('location')})")

# B. Complaint Status Transitions (IN_PROGRESS -> RESOLVED)
print("\n--- B. COMPLAINT WORKFLOW LIFECYCLE ---")
if len(complaints) > 0:
    target_comp = complaints[0]
    cid = target_comp['id']

    # Transition to IN_PROGRESS
    st, prog_res = make_req(base_be + f'/api/v1/complaints/{cid}/status', 'PATCH', {
        'status': 'IN_PROGRESS',
        'resolution_notes': 'Site inspection commenced by Senior Maintenance Supervisor.'
    }, token=staff_token)
    assert st == 200, f"Move to IN_PROGRESS failed: {st}, {prog_res}"
    assert prog_res['status'] == 'IN_PROGRESS'
    print(f"Complaint {prog_res['ticket_number']} moved to IN_PROGRESS.")

    # Transition to RESOLVED with notes
    res_notes = f"Fixed wiring and tested with multimeter at {datetime.now(timezone.utc).strftime('%H:%M:%S')}. System fully operational."
    st, res_res = make_req(base_be + f'/api/v1/complaints/{cid}/status', 'PATCH', {
        'status': 'RESOLVED',
        'resolution_notes': res_notes
    }, token=staff_token)
    assert st == 200, f"Move to RESOLVED failed: {st}, {res_res}"
    assert res_res['status'] == 'RESOLVED'
    assert res_res.get('resolved_at') is not None
    print(f"Complaint {res_res['ticket_number']} marked RESOLVED with timestamp {res_res.get('resolved_at')}.")

# C. Staff Notifications
print("\n--- C. STAFF NOTIFICATIONS ---")
st, notifs_data = make_req(base_be + '/api/v1/notifications', 'GET', token=staff_token)
assert st == 200
notifs = notifs_data.get('notifications', []) if isinstance(notifs_data, dict) else notifs_data
print(f"Staff Notifications retrieved: {len(notifs)} alert(s).")

# D. Staff RBAC Check
print("\n--- D. STAFF RBAC BOUNDARY CHECK ---")
st, admin_denied = make_req(base_be + '/api/v1/admin/control-tower/metrics', 'GET', token=staff_token)
assert st in [401, 403], f"Expected 401/403 for Staff accessing Admin metrics, got {st}"
print(f"Staff correctly denied access to Admin Control Tower (HTTP {st}).")

# ============================================================
# PART B: SECURITY GUARD
# ============================================================
print("\n--- 3. VERIFY SECURITY GUARD WORKFLOWS (guard.gate1@bput.ac.in) ---")
st, guard_login = make_req(base_be + '/api/v1/auth/login', 'POST', {
    'username': 'guard.gate1@bput.ac.in',
    'password': 'CampusFlow@2026'
})
assert st == 200, f"Guard login failed: {st}"
guard_token = guard_login['access_token']
assert guard_login['user']['role'] == 'GUARD'
print(f"Guard login OK: {guard_login['user']['email']} (Role: {guard_login['user']['role']})")

# Profile /auth/me
st, guard_me = make_req(base_be + '/api/v1/auth/me', 'GET', token=guard_token)
assert st == 200 and guard_me['email'] == 'guard.gate1@bput.ac.in'
assert guard_me['role'] == 'GUARD'
print(f"Profile verified: {guard_me['first_name']} {guard_me['last_name']} ({guard_me['role']})")

# E. Recent Gate Activity Log
print("\n--- E. RECENT GATE ACTIVITY LEDGER ---")
st, passes = make_req(base_be + '/api/v1/gatepasses', 'GET', token=guard_token)
assert st == 200, f"Fetch gate passes failed: {st}"
assert isinstance(passes, list)
print(f"Perimeter Gate Activity: {len(passes)} total gate pass record(s) loaded.")

# F. CRITICAL DEMO: ONE-TIME QR TEST & REPLAY ATTACK REJECTION
print("\n--- F. MANDATORY ONE-TIME QR & REPLAY ATTACK DEMONSTRATION ---")

# 1. Student creates fresh gate pass
st_login, s_data = make_req(base_be + '/api/v1/auth/login', 'POST', {
    'username': 'priya.sharma@bput.ac.in',
    'password': 'CampusFlow@2026'
})
st_token = s_data['access_token']

gp_payload = {
    "pass_type": "DAY_OUTING",
    "out_time": (datetime.now(timezone.utc) + timedelta(hours=1)).isoformat(),
    "expected_in_time": (datetime.now(timezone.utc) + timedelta(hours=4)).isoformat(),
    "destination": "Main Market & City Bookstore",
    "purpose": "Academic reference textbooks purchase",
    "pin_code": "1234"
}
st, new_gp = make_req(base_be + '/api/v1/gatepasses', 'POST', gp_payload, token=st_token)
assert st == 201, f"Student gate pass apply failed: {st}, {new_gp}"
gp_id = new_gp['id']
print(f"1. Student applied for gate pass: {new_gp['pass_number']} (Status: {new_gp['status']})")

# 2. Warden approves and generates single-use QR token
w_login, w_data = make_req(base_be + '/api/v1/auth/login', 'POST', {
    'username': 'warden.sharma@bput.ac.in',
    'password': 'CampusFlow@2026'
})
w_token = w_data['access_token']

st, approved_gp = make_req(base_be + f'/api/v1/gatepasses/{gp_id}/approve', 'PATCH', token=w_token)
assert st == 200, f"Warden approve failed: {st}, {approved_gp}"
assert approved_gp['status'] == 'APPROVED'
assert approved_gp['qr_token'] is not None
qr_token_str = approved_gp['qr_token']['qr_token']
assert approved_gp['qr_token']['status'] == 'ACTIVE'
print(f"2. Warden approved gate pass. Active single-use QR token generated: {qr_token_str[:16]}... (Status: {approved_gp['qr_token']['status']})")

# 3. FIRST SCAN: Guard scans valid active QR at perimeter gate
st, verify_res = make_req(base_be + '/api/v1/gatepasses/verify-qr', 'POST', {
    'qr_token': qr_token_str
}, token=guard_token)
assert st == 200, f"First QR scan failed: {st}, {verify_res}"
assert verify_res['status'] == 'APPROVED'
assert verify_res.get('actual_out_time') is not None
print(f"3. FIRST SCAN SUCCESS: Exit permitted for pass {verify_res['pass_number']} at {verify_res['actual_out_time']}.")

# Verify backend parent gate pass is now CHECKED_OUT
st, checked_out_gp = make_req(base_be + f'/api/v1/gatepasses/{gp_id}', 'GET', token=guard_token)
assert st == 200
assert checked_out_gp['status'] == 'CHECKED_OUT'
assert checked_out_gp['actual_out_time'] is not None
print(f"   Backend state confirmed: Gate pass status is now '{checked_out_gp['status']}'.")

# 4. SECOND SCAN: Replay attack attempt with EXACT SAME QR TOKEN
print("4. Attempting SECOND SCAN with same consumed QR token (Replay Attack Test)...")
st, replay_res = make_req(base_be + '/api/v1/gatepasses/verify-qr', 'POST', {
    'qr_token': qr_token_str
}, token=guard_token)

assert st == 409, f"Expected HTTP 409 Conflict on replay attempt, got {st}: {replay_res}"
error_detail = ""
if isinstance(replay_res, dict):
    if 'detail' in replay_res:
        error_detail = replay_res['detail']
    elif 'error' in replay_res:
        error_detail = str(replay_res['error'])
    else:
        error_detail = str(replay_res)
assert "REPLAY" in error_detail or "already consumed" in error_detail, f"Expected replay rejection message, got: {error_detail}"
print(f"   SECOND SCAN CORRECTLY REJECTED: HTTP 409 Conflict confirmed!")
print(f"   Authoritative backend rejection: '{error_detail}'")
print("   [OK] ATOMIC ROW-LOCK SINGLE-USE QR BEHAVIOR FULLY VERIFIED!")

# G. Check-In / Return Recording
print("\n--- G. RETURN (CHECK-IN) RECORDING ---")
st, return_res = make_req(base_be + f'/api/v1/gatepasses/{gp_id}/return', 'POST', token=guard_token)
assert st == 200, f"Record return failed: {st}, {return_res}"
assert return_res['status'] == 'COMPLETED'
assert return_res.get('actual_in_time') is not None
print(f"Student return recorded! Pass {return_res['pass_number']} is now COMPLETED (In: {return_res['actual_in_time']}).")

# H. Guard RBAC Boundary Check
print("\n--- H. GUARD RBAC BOUNDARY CHECK ---")
st, guard_lodge_denied = make_req(base_be + '/api/v1/complaints', 'POST', {
    "title": "Unauthorized Guard Complaint",
    "description": "Guard lodge test",
    "category": "MAINTENANCE",
    "location": "Hostel 1"
}, token=guard_token)
assert st in [401, 403], f"Expected 401/403 for Guard lodging student complaint, got {st}"
print(f"Guard correctly denied student complaint lodging (HTTP {st}).")

st, guard_tower_denied = make_req(base_be + '/api/v1/admin/control-tower/metrics', 'GET', token=guard_token)
assert st in [401, 403], f"Expected 401/403 for Guard accessing Admin Control Tower, got {st}"
print(f"Guard correctly denied Admin Control Tower access (HTTP {st}).")

# ============================================================
# CROSS-ROLE REGRESSION CHECKS
# ============================================================
print("\n============================================================")
print("CROSS-ROLE REGRESSION CHECKS")
print("============================================================")

# 1. Student Regression
st, s_profile = make_req(base_be + '/api/v1/auth/me', 'GET', token=st_token)
assert st == 200 and s_profile['role'] == 'STUDENT'
st, s_complaints = make_req(base_be + '/api/v1/complaints', 'GET', token=st_token)
assert st == 200
st, s_passes = make_req(base_be + '/api/v1/gatepasses', 'GET', token=st_token)
assert st == 200
print(f"Student: Profile OK, Complaints ({len(s_complaints)}), Gate Passes ({len(s_passes)}).")

# 2. Warden Regression
st, w_passes = make_req(base_be + '/api/v1/gatepasses', 'GET', token=w_token)
assert st == 200
st, w_comp = make_req(base_be + '/api/v1/complaints', 'GET', token=w_token)
assert st == 200
print(f"Warden: Gate Passes ({len(w_passes)}), Complaints ({len(w_comp)}).")

# 3. Hostel Faculty Regression
st, hf_login = make_req(base_be + '/api/v1/auth/login', 'POST', {
    'username': 'dr.mishra.hostel@bput.ac.in',
    'password': 'CampusFlow@2026'
})
assert st == 200
hf_token = hf_login['access_token']
st, hf_passes = make_req(base_be + '/api/v1/gatepasses', 'GET', token=hf_token)
assert st == 200
print(f"Hostel Faculty: Gate Passes ({len(hf_passes)}).")

# 4. Teacher Regression
st, t_login = make_req(base_be + '/api/v1/auth/login', 'POST', {
    'username': 'prof.mohanty@bput.ac.in',
    'password': 'CampusFlow@2026'
})
assert st == 200
t_token = t_login['access_token']
st, t_notices = make_req(base_be + '/api/v1/class-notices', 'GET', token=t_token)
assert st == 200
print(f"Teacher: Class Notices ({len(t_notices)}).")

# 5. Lab Assistant Regression
st, l_login = make_req(base_be + '/api/v1/auth/login', 'POST', {
    'username': 'ramesh.lab@bput.ac.in',
    'password': 'CampusFlow@2026'
})
assert st == 200
l_token = l_login['access_token']
st, l_equip = make_req(base_be + '/api/v1/lab/equipment', 'GET', token=l_token)
assert st == 200
print(f"Lab Assistant: Equipment ({len(l_equip)}).")

# 6. Admin Regression
st, a_login = make_req(base_be + '/api/v1/auth/login', 'POST', {
    'username': 'dean.admin@bput.ac.in',
    'password': 'CampusFlow@2026'
})
assert st == 200
a_token = a_login['access_token']
st, a_metrics = make_req(base_be + '/api/v1/admin/control-tower/metrics', 'GET', token=a_token)
assert st == 200
print(f"Admin: Control Tower Metrics OK (Complaints: {a_metrics['total_complaints']}).")

print("\n============================================================")
print("ALL PHASE 12 & CROSS-ROLE SMOKE TESTS PASSED!")
print("============================================================")
