import urllib.request
import json
import uuid
import sys
sys.path.append('backend')
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
            body = resp.read()
            # Try to decode as utf-8 or json
            try:
                text = body.decode('utf-8', errors='ignore')
                data = json.loads(text) if text else None
            except Exception:
                data = body
            return resp.status, data
    except urllib.error.HTTPError as e:
        body = e.read()
        try:
            text = body.decode('utf-8', errors='ignore')
            data = json.loads(text) if text else None
        except Exception:
            data = body
        return e.code, data

print("============================================================")
print("CAMPUSFLOW — PHASE 13 FULL-SYSTEM AUDIT TEST SUITE")
print("BPUT Hackathon 2026 — Problem Statement 07")
print("============================================================")

results = {}

# ------------------------------------------------------------
# 1. REPOSITORY & FRONTEND ASSET AUDIT
# ------------------------------------------------------------
print("\n[1/11] AUDITING FRONTEND ASSETS & PWA SHELL...")
assets = [
    '/index.html', '/manifest.json', '/sw.js',
    '/css/variables.css', '/css/themes.css', '/css/base.css',
    '/css/layout.css', '/css/components.css', '/css/forms.css',
    '/css/tables.css', '/css/responsive.css',
    '/js/app.js', '/js/api.js', '/js/auth.js', '/js/router.js',
    '/js/state.js', '/js/theme.js', '/js/ui.js', '/js/utils.js',
    '/js/notifications.js', '/js/student.js', '/js/hostel.js',
    '/js/academic.js', '/js/admin.js', '/js/operations.js',
    '/assets/icons/icon-192.svg', '/assets/icons/icon-512.svg'
]
asset_failures = []
for a in assets:
    st, _ = make_req(base_fe + a)
    if st != 200:
        asset_failures.append((a, st))
assert len(asset_failures) == 0, f"Asset failures: {asset_failures}"
print(f"PASS: All {len(assets)} frontend assets verified HTTP 200 OK.")
results["Frontend Assets"] = "PASS"

# ------------------------------------------------------------
# 2. ROLE MATRIX & AUTHENTICATION AUDIT (ALL 8 ROLES)
# ------------------------------------------------------------
print("\n[2/11] AUDITING 8-ROLE AUTHENTICATION & ACCESS MATRIX...")
roles_config = [
    ("STUDENT", "priya.sharma@bput.ac.in", "CampusFlow@2026"),
    ("WARDEN", "warden.sharma@bput.ac.in", "CampusFlow@2026"),
    ("HOSTEL_FACULTY", "dr.mishra.hostel@bput.ac.in", "CampusFlow@2026"),
    ("TEACHER", "prof.mohanty@bput.ac.in", "CampusFlow@2026"),
    ("LAB_ASSISTANT", "ramesh.lab@bput.ac.in", "CampusFlow@2026"),
    ("ADMIN", "dean.admin@bput.ac.in", "CampusFlow@2026"),
    ("STAFF", "ramesh.estate@bput.ac.in", "CampusFlow@2026"),
    ("GUARD", "guard.gate1@bput.ac.in", "CampusFlow@2026")
]

tokens = {}
for role, email, pwd in roles_config:
    st, auth_data = make_req(base_be + '/api/v1/auth/login', 'POST', {'username': email, 'password': pwd})
    assert st == 200, f"Login failed for {role} ({email}): {st}"
    assert auth_data['user']['role'] == role, f"Expected role {role}, got {auth_data['user']['role']}"
    token = auth_data['access_token']
    tokens[role] = token

    # Check verified identity /auth/me
    st, me = make_req(base_be + '/api/v1/auth/me', 'GET', token=token)
    assert st == 200 and me['email'] == email and me['role'] == role
    print(f" - {role:15}: Verified {me['first_name']} {me['last_name']} ({me['email']})")

print("PASS: All 8 roles authenticated and identities verified.")
results["8-Role Auth Matrix"] = "PASS"

# ------------------------------------------------------------
# 3. RBAC BOUNDARY ENFORCEMENT AUDIT (NEGATIVE SECURITY MATRIX)
# ------------------------------------------------------------
print("\n[3/11] AUDITING SERVER-SIDE RBAC SECURITY MATRIX...")
# Student -> Admin Metrics
st, _ = make_req(base_be + '/api/v1/admin/control-tower/metrics', 'GET', token=tokens["STUDENT"])
assert st in [401, 403], f"Student accessed admin metrics: {st}"

# Guard -> Lodge Complaint
st, _ = make_req(base_be + '/api/v1/complaints', 'POST', {'title': 'bad', 'description': 'bad', 'location_type': 'HOSTEL', 'location_details': '101'}, token=tokens["GUARD"])
assert st in [401, 403], f"Guard lodged student complaint: {st}"

# Staff -> Admin Control Tower
st, _ = make_req(base_be + '/api/v1/admin/control-tower/metrics', 'GET', token=tokens["STAFF"])
assert st in [401, 403], f"Staff accessed admin metrics: {st}"

# Teacher -> Warden Gatepass Approve
random_id = str(uuid.uuid4())
st, _ = make_req(base_be + f'/api/v1/gatepasses/{random_id}/approve', 'PATCH', token=tokens["TEACHER"])
assert st in [401, 403], f"Teacher approved gate pass: {st}"

# Lab Assistant -> Admin Audit Logs
st, _ = make_req(base_be + '/api/v1/admin/audit-logs', 'GET', token=tokens["LAB_ASSISTANT"])
assert st in [401, 403], f"Lab Assistant accessed audit logs: {st}"

print("PASS: Server-side RBAC boundary checks strictly rejected unauthorized actions (HTTP 403).")
results["RBAC Security Matrix"] = "PASS"

# ------------------------------------------------------------
# 4. COMPLAINT WORKFLOW & AUDIT TRAIL AUDIT
# ------------------------------------------------------------
print("\n[4/11] AUDITING COMPLAINTS LIFECYCLE & AUDIT TRAIL...")
# Student lodges complaint
comp_payload = {
    "title": f"Phase 13 Plumbing Leak {uuid.uuid4().hex[:4]}",
    "description": "Continuous water leakage beneath wash basin in corridor.",
    "location_type": "HOSTEL",
    "location_details": "Block B 2nd Floor Corridor",
    "priority": "HIGH"
}
st, comp = make_req(base_be + '/api/v1/complaints', 'POST', comp_payload, token=tokens["STUDENT"])
assert st == 201, f"Lodge complaint failed: {st}, {comp}"
cid = comp['id']
print(f" - Complaint lodged by Student: {comp['ticket_number']} (Status: {comp['status']})")

# Admin assigns complaint to Maintenance Staff (Kailash Sahoo: 21ec6b37-1466-4abd-89e0-063336cf4781)
staff_uuid = "21ec6b37-1466-4abd-89e0-063336cf4781"
st, assigned_comp = make_req(base_be + f'/api/v1/complaints/{cid}/assign', 'PATCH', {'assigned_staff_id': staff_uuid}, token=tokens["ADMIN"])
assert st == 200, f"Assign failed: {st}"
assert assigned_comp['status'] == 'ASSIGNED'
print(f" - Complaint assigned by Admin to staff {staff_uuid[:8]}. Status: ASSIGNED.")

# Staff starts work (IN_PROGRESS)
st, prog_comp = make_req(base_be + f'/api/v1/complaints/{cid}/status', 'PATCH', {
    'status': 'IN_PROGRESS',
    'resolution_notes': 'Maintenance team arrived on site.'
}, token=tokens["STAFF"])
assert st == 200 and prog_comp['status'] == 'IN_PROGRESS'
print(" - Staff transitioned ticket to IN_PROGRESS.")

# Staff resolves ticket with notes (RESOLVED)
st, res_comp = make_req(base_be + f'/api/v1/complaints/{cid}/status', 'PATCH', {
    'status': 'RESOLVED',
    'resolution_notes': 'Replaced broken elbow pipe joint and tested pressure.'
}, token=tokens["STAFF"])
assert st == 200 and res_comp['status'] == 'RESOLVED'
assert res_comp.get('resolved_at') is not None
print(" - Staff resolved ticket with notes. Status: RESOLVED.")

# Student rates ticket (5 stars)
st, rate_comp = make_req(base_be + f'/api/v1/complaints/{cid}/rate', 'POST', {'rating': 5}, token=tokens["STUDENT"])
assert st == 200 and rate_comp.get('rating') == 5
print(" - Student rated complaint 5/5 stars. Loop closed.")

# Verify audit trail contains the events
st, audit_events = make_req(base_be + f'/api/v1/admin/audit-logs?entity_type=COMPLAINT&limit=5', 'GET', token=tokens["ADMIN"])
assert st == 200 and len(audit_events) > 0
print(f" - System Audit Trail captured complaint telemetry ({len(audit_events)} recent events).")
results["Complaint Lifecycle & Audit"] = "PASS"

# ------------------------------------------------------------
# 5. ONE-TIME QR & REPLAY ATTACK PREVENTION AUDIT
# ------------------------------------------------------------
print("\n[5/11] AUDITING ONE-TIME QR ATOMIC CONSUMPTION & REPLAY PREVENTION...")
# Student requests gate pass
gp_payload = {
    "pass_type": "DAY_OUTING",
    "out_time": (datetime.now(timezone.utc) + timedelta(hours=1)).isoformat(),
    "expected_in_time": (datetime.now(timezone.utc) + timedelta(hours=3)).isoformat(),
    "destination": "State Central Library",
    "purpose": "Journal research for major project",
    "pin_code": "1234"
}
st, new_gp = make_req(base_be + '/api/v1/gatepasses', 'POST', gp_payload, token=tokens["STUDENT"])
assert st == 201, f"Gate pass request failed: {st}"
gpid = new_gp['id']

# Warden approves gate pass
st, approved_gp = make_req(base_be + f'/api/v1/gatepasses/{gpid}/approve', 'PATCH', token=tokens["WARDEN"])
assert st == 200 and approved_gp['status'] == 'APPROVED'
qr_token = approved_gp['qr_token']['qr_token']
print(f" - Pass {approved_gp['pass_number']} approved. Single-use QR generated: {qr_token[:16]}...")

# Guard First Scan: Valid Pass
st, v1 = make_req(base_be + '/api/v1/gatepasses/verify-qr', 'POST', {'qr_token': qr_token}, token=tokens["GUARD"])
assert st == 200, f"First scan failed: {st}"
assert v1['status'] == 'APPROVED'
print(" - First scan by Security Guard: SUCCESS (Exit permitted, token consumed).")

# Guard Second Scan: Replay Attack Attempt
st, v2 = make_req(base_be + '/api/v1/gatepasses/verify-qr', 'POST', {'qr_token': qr_token}, token=tokens["GUARD"])
assert st == 409, f"Expected 409 Conflict on replay, got {st}"
print(" - Second scan attempt: REJECTED with HTTP 409 Conflict (Replay blocked).")

# Guard records student return
st, ret = make_req(base_be + f'/api/v1/gatepasses/{gpid}/return', 'POST', token=tokens["GUARD"])
assert st == 200 and ret['status'] == 'COMPLETED'
assert ret.get('actual_in_time') is not None
print(" - Student return recorded by Guard. Status: COMPLETED.")
results["One-Time QR & Replay Defense"] = "PASS"

# ------------------------------------------------------------
# 6. HELP-A-FRIEND EMERGENCY PROXY & OTP AUDIT
# ------------------------------------------------------------
print("\n[6/11] AUDITING HELP-A-FRIEND PROXY WORKFLOW & OTP...")
# Student B (Beneficiary): roll 2201019 (Sanjay Soren)
# Request proxy OTP initiation
st, otp_init = make_req(base_be + '/api/v1/help-a-friend/initiate', 'POST', {
    "beneficiary_roll_number": "2201019"
}, token=tokens["STUDENT"])
assert st == 200, f"OTP init failed: {st}, {otp_init}"
assert otp_init["status"] == "OTP_SENT"
print(f" - Proxy OTP initiated for beneficiary roll {otp_init['beneficiary_roll_number']}.")

# Test Wrong OTP Rejection
st, bad_verify = make_req(base_be + '/api/v1/help-a-friend/verify-otp', 'POST', {
    "beneficiary_roll_number": "2201019",
    "otp_code": "000000"
}, token=tokens["STUDENT"])
assert st == 400, f"Expected 400 on bad OTP, got {st}"
print(" - Wrong OTP rejection verified (HTTP 400).")

# Retrieve OTP code from database / SMS notification
import re
import sqlite3
conn = sqlite3.connect('campusflow_demo.db')
cur = conn.cursor()
cur.execute("SELECT message_body FROM sms_notifications WHERE trigger_event = 'OTP_DISPATCH' ORDER BY dispatched_at DESC LIMIT 1")
row = cur.fetchone()
conn.close()
otp_code = re.search(r"\b(\d{6})\b", row[0]).group(1) if row else None

assert otp_code is not None, "Failed to retrieve OTP code for test"
print(f" - Real OTP retrieved from mock SMS dispatch: {otp_code}")

# Verify correct OTP
st, good_verify = make_req(base_be + '/api/v1/help-a-friend/verify-otp', 'POST', {
    "beneficiary_roll_number": "2201019",
    "otp_code": otp_code
}, token=tokens["STUDENT"])
assert st == 200 and good_verify['status'] == 'VERIFIED'
otp_ver_id = good_verify['otp_verification_id']
print(f" - OTP Verified! Single-use verification token: {otp_ver_id[:8]}...")

# Submit proxy complaint
st, proxy_comp = make_req(base_be + '/api/v1/help-a-friend/submit', 'POST', {
    "otp_verification_id": otp_ver_id,
    "complaint": {
        "title": "Proxy Lodged Room Fan Malfunction",
        "description": "Ceiling fan making severe grinding noise.",
        "location_type": "Hostel",
        "location_details": "Hostel Block B, Room B-108",
        "priority": "HIGH"
    }
}, token=tokens["STUDENT"])
assert st == 201, f"Proxy submit failed: {st}, {proxy_comp}"

# Verify complaint belongs to Student B, NOT Student A
conn = sqlite3.connect('campusflow_demo.db')
cur = conn.cursor()
cur.execute("SELECT id FROM students WHERE roll_number = '2201019'")
student_b_id = cur.fetchone()[0]
conn.close()
student_b_uuid = str(uuid.UUID(student_b_id))
assert proxy_comp["student_id"] == student_b_uuid, f"Complaint not assigned to beneficiary: {proxy_comp['student_id']}"
print(f" - Proxy complaint lodged! Ticket: {proxy_comp['ticket_number']} belongs to beneficiary 2201019.")

# Replay test on consumed verification token
st, replay_proxy = make_req(base_be + '/api/v1/help-a-friend/submit', 'POST', {
    "otp_verification_id": otp_ver_id,
    "complaint": {
        "title": "Replay Attempt",
        "description": "Should be rejected.",
        "location_type": "Hostel",
        "location_details": "Room 204"
    }
}, token=tokens["STUDENT"])
assert st in [400, 404, 409], f"Expected rejection on consumed proxy token, got {st}"
print(" - Consumed OTP verification replay rejected (Single-use verified).")
results["Help-a-Friend Proxy Security"] = "PASS"

# ------------------------------------------------------------
# 7. DIGITAL DOCUMENT & VERIFICATION HASH AUDIT
# ------------------------------------------------------------
print("\n[7/11] AUDITING DIGITAL DOCUMENT REQUEST & PDF HASH...")
st, doc_req = make_req(base_be + '/api/v1/documents', 'POST', {
    "document_type": "BONAFIDE",
    "purpose": "Bank education loan renewal"
}, token=tokens["STUDENT"])
assert st == 201, f"Document request failed: {st}, {doc_req}"
doc_id = doc_req['id']
print(f" - Student requested Bonafide Certificate: {doc_req['request_number']} (Status: {doc_req['status']})")

# Admin approves document request
st, approved_doc = make_req(base_be + f'/api/v1/documents/{doc_id}/approve', 'PATCH', token=tokens["ADMIN"])
assert st == 200, f"Approve document failed: {st}"
assert approved_doc['status'] == 'APPROVED'
assert approved_doc.get('verification_hash') is not None
print(f" - Document approved by Admin. SHA-256 Hash: {approved_doc['verification_hash'][:16]}...")

# Download generated PDF
pdf_url = base_be + f'/api/v1/documents/{doc_id}/download'
req_pdf = urllib.request.Request(pdf_url, headers={'Authorization': f'Bearer {tokens["STUDENT"]}'})
with urllib.request.urlopen(req_pdf) as resp_pdf:
    pdf_bytes = resp_pdf.read()
    assert resp_pdf.status == 200
    assert pdf_bytes.startswith(b'%PDF'), "Downloaded file is not valid PDF!"
    print(f" - PDF generated and downloaded ({len(pdf_bytes)} bytes, %PDF magic header verified).")
results["Digital Documents & PDF"] = "PASS"

# ------------------------------------------------------------
# 8. ACADEMIC WORKFLOW & COHORT TARGETING AUDIT
# ------------------------------------------------------------
print("\n[8/11] AUDITING ACADEMIC ATTENDANCE & TARGETED NOTICES...")
# Teacher creates attendance session
sess_payload = {
    "subject": f"Compiler Design (CS502) - Sec A {uuid.uuid4().hex[:4]}",
    "branch": "Computer Science & Engineering",
    "batch_year": 2022,
    "section": "A",
    "session_date": datetime.now(timezone.utc).isoformat()
}
st, sess = make_req(base_be + '/api/v1/attendance/sessions', 'POST', sess_payload, token=tokens["TEACHER"])
assert st == 201
sid = sess['id']

# Record attendance for Priya Sharma
priya_id = "b84a4d69-d4a7-48e8-a9fa-987d7c38b0da"
st, recs = make_req(base_be + f'/api/v1/attendance/sessions/{sid}/records', 'POST', [{"student_id": priya_id, "status": "PRESENT"}], token=tokens["TEACHER"])
assert st == 201 and len(recs) == 1
print(f" - Teacher recorded attendance session {sid[:8]} for '{sess['subject']}'.")

# Student retrieves own attendance profile
st, stu_att = make_req(base_be + f'/api/v1/attendance/student/{priya_id}', 'GET', token=tokens["STUDENT"])
assert st == 200 and stu_att['total_sessions'] >= 1
print(f" - Student attendance profile loaded: {stu_att['attendance_percentage']}% aggregate attendance.")

# Teacher creates targeted class notice
notice_title = f"Phase 13 Exam Briefing {uuid.uuid4().hex[:4]}"
st, class_not = make_req(base_be + '/api/v1/class-notices', 'POST', {
    "notice_type": "RESCHEDULED",
    "subject": notice_title,
    "target_branch": "Computer Science & Engineering",
    "target_year": 2022,
    "target_semester": 6,
    "target_section": "A",
    "class_date": (datetime.now(timezone.utc) + timedelta(days=1)).isoformat(),
    "period": "02:00 PM - 03:00 PM",
    "details": "Class moved to Auditorium for seminar lecture."
}, token=tokens["TEACHER"])
assert st == 201
print(f" - Teacher posted targeted class notice: '{class_not['subject']}'.")

# Student sees applicable notice
st, stu_notices = make_req(base_be + '/api/v1/class-notices', 'GET', token=tokens["STUDENT"])
assert st == 200 and any(n['id'] == class_not['id'] for n in stu_notices)
print(" - Student cohort scoped notices verified.")
results["Academic Attendance & Notices"] = "PASS"

# ------------------------------------------------------------
# 9. LAB & WORKSHOP REQUISITION LIFECYCLE AUDIT
# ------------------------------------------------------------
print("\n[9/11] AUDITING LAB EQUIPMENT & REQUISITIONS...")
# List equipment
st, equip = make_req(base_be + '/api/v1/lab/equipment', 'GET', token=tokens["LAB_ASSISTANT"])
assert st == 200 and len(equip) > 0
print(f" - Lab equipment inventory loaded: {len(equip)} machines tracked.")

# Create draft requisition
st, req_draft = make_req(base_be + '/api/v1/lab/requisitions', 'POST', {
    "lab_name": "IoT & Embedded Systems Lab"
}, token=tokens["LAB_ASSISTANT"])
assert st == 201 and req_draft['status'] == 'DRAFT'
req_id = req_draft['id']

# Add line item
st, req_item = make_req(base_be + f'/api/v1/lab/requisitions/{req_id}/items', 'POST', {
    "item_name": "Lead-Free Solder Wire Roll (500g)",
    "quantity": 10,
    "unit": "rolls",
    "justification": "Required for microelectronics semester lab"
}, token=tokens["LAB_ASSISTANT"])
assert st == 201

# Submit requisition
st, req_sub = make_req(base_be + f'/api/v1/lab/requisitions/{req_id}/submit', 'POST', token=tokens["LAB_ASSISTANT"])
assert st == 200 and req_sub['status'] == 'SUBMITTED'

# Admin approves requisition
st, req_app = make_req(base_be + f'/api/v1/lab/requisitions/{req_id}/review', 'POST', {
    "status": "APPROVED"
}, token=tokens["ADMIN"])
assert st == 200 and req_app['status'] == 'APPROVED'

# Move to ORDERED
st, req_ord = make_req(base_be + f'/api/v1/lab/requisitions/{req_id}/order', 'POST', token=tokens["LAB_ASSISTANT"])
assert st == 200 and req_ord['status'] == 'ORDERED'

# Move to COMPLETED
st, req_done = make_req(base_be + f'/api/v1/lab/requisitions/{req_id}/complete', 'POST', token=tokens["LAB_ASSISTANT"])
assert st == 200 and req_done['status'] == 'COMPLETED'
print(" - Full Requisition Lifecycle (DRAFT -> SUBMITTED -> APPROVED -> ORDERED -> COMPLETED) verified.")
results["Lab Equipment & Requisitions"] = "PASS"

# ------------------------------------------------------------
# 10. ADMIN CONTROL TOWER & OPERATIONAL TELEMETRY
# ------------------------------------------------------------
print("\n[10/11] AUDITING ADMIN CONTROL TOWER TELEMETRY...")
st, metrics = make_req(base_be + '/api/v1/admin/control-tower/metrics', 'GET', token=tokens["ADMIN"])
assert st == 200
assert 'total_complaints' in metrics
assert 'sla_breaches_count' in metrics
assert 'recurring_hotspots_count' in metrics
assert 'staff_workload' in metrics
print(f" - Control Tower Telemetry: Total Complaints={metrics['total_complaints']}, SLA Breaches={metrics['sla_breaches_count']}, Recurring Hotspots={metrics['recurring_hotspots_count']}, Staff Workload Count={len(metrics['staff_workload'])}")

st, breaches = make_req(base_be + '/api/v1/admin/control-tower/sla-breaches', 'GET', token=tokens["ADMIN"])
assert st == 200 and isinstance(breaches, list)
print(f" - Active SLA Breaches Ledger: {len(breaches)} ticket(s) exceeding threshold.")

st, recurring = make_req(base_be + '/api/v1/admin/control-tower/recurring-complaints', 'GET', token=tokens["ADMIN"])
assert st == 200 and isinstance(recurring, list)
print(f" - Recurring Infrastructure Hotspots: {len(recurring)} recurrent cluster(s).")
results["Admin Control Tower"] = "PASS"

# ------------------------------------------------------------
# 11. NOTIFICATIONS & NOTICE BOARD ARCHITECTURE AUDIT
# ------------------------------------------------------------
print("\n[11/11] AUDITING NOTIFICATIONS & NOTICE BOARD...")
st, notifs_data = make_req(base_be + '/api/v1/notifications', 'GET', token=tokens["STUDENT"])
assert st == 200
notifs_list = notifs_data.get('notifications', []) if isinstance(notifs_data, dict) else notifs_data
assert len(notifs_list) > 0
print(f" - Student transactional notifications: {len(notifs_list)} total alerts retrieved.")

# Mark notification read
nid = notifs_list[0]['id']
st, mark_read = make_req(base_be + f'/api/v1/notifications/{nid}/read', 'PATCH', token=tokens["STUDENT"])
assert st == 200 and mark_read['is_read'] == True
print(f" - Notification {nid[:8]} read state persisted successfully.")
results["Notifications & Notice Board"] = "PASS"

print("\n============================================================")
print("AUDIT SUMMARY:")
for k, v in results.items():
    print(f" - {k:35}: {v}")
print("ALL 11 INTEGRATION AUDIT MODULES PASSED WITHOUT DEFECT!")
print("============================================================")
