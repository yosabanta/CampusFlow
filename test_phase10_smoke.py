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
print("PHASE 10 AUTOMATED SMOKE & REGRESSION TEST SUITE")
print("============================================================")

print("\n--- 1. VERIFY FRONTEND ASSETS SERVED ---")
assets = [
    '/index.html', '/css/components.css', '/css/layout.css',
    '/js/app.js', '/js/api.js', '/js/auth.js', '/js/router.js',
    '/js/ui.js', '/js/student.js', '/js/hostel.js', '/js/academic.js'
]
for path in assets:
    status, _ = make_req(base_fe + path)
    assert status == 200, f"Failed to fetch {path}, status {status}"
print(f"All {len(assets)} frontend assets verified HTTP 200 OK (including academic.js).")

print("\n--- 2. VERIFY TEACHER WORKFLOWS (prof.mohanty@bput.ac.in) ---")
# Login
st, login_data = make_req(base_be + '/api/v1/auth/login', 'POST', {
    'username': 'prof.mohanty@bput.ac.in',
    'password': 'CampusFlow@2026'
})
assert st == 200, f"Teacher login failed: {st}"
teacher_token = login_data['access_token']
assert login_data['user']['role'] == 'TEACHER', f"Expected TEACHER, got {login_data['user']['role']}"
print(f"Teacher login OK: {login_data['user']['email']} (Role: {login_data['user']['role']})")

# Profile /auth/me
st, me = make_req(base_be + '/api/v1/auth/me', 'GET', token=teacher_token)
assert st == 200 and me['email'] == 'prof.mohanty@bput.ac.in'
print(f"Profile verified: {me['first_name']} {me['last_name']}")

# A. Create Attendance Session
sess_payload = {
    "subject": f"Cloud Computing (CS601) - Lab {uuid.uuid4().hex[:4]}",
    "branch": "Computer Science & Engineering",
    "batch_year": 2022,
    "section": "A",
    "session_date": datetime.now(timezone.utc).isoformat()
}
st, session = make_req(base_be + '/api/v1/attendance/sessions', 'POST', sess_payload, token=teacher_token)
assert st == 201, f"Create session failed: {st}, {session}"
session_id = session['id']
print(f"Attendance Session Created: ID {session_id} for '{session['subject']}'")

# B. Record Attendance (Priya Sharma: b84a4d69-d4a7-48e8-a9fa-987d7c38b0da)
priya_id = "b84a4d69-d4a7-48e8-a9fa-987d7c38b0da"
att_payload = [
    {"student_id": priya_id, "status": "PRESENT"}
]
st, records = make_req(base_be + f'/api/v1/attendance/sessions/{session_id}/records', 'POST', att_payload, token=teacher_token)
assert st == 201, f"Record attendance failed: {st}, {records}"
assert len(records) == 1 and records[0]['status'] == 'PRESENT'
print(f"Attendance Records Saved: {len(records)} record(s) confirmed on backend.")

# C. Verify duplicate prevention (409 Conflict)
st, dup_err = make_req(base_be + f'/api/v1/attendance/sessions/{session_id}/records', 'POST', att_payload, token=teacher_token)
assert st == 409, f"Expected 409 Conflict on duplicate, got {st}"
print("Duplicate attendance submission correctly rejected with 409 Conflict.")

# D. Verify session retrieval
st, fetched_sess = make_req(base_be + f'/api/v1/attendance/sessions/{session_id}', 'GET', token=teacher_token)
assert st == 200 and len(fetched_sess['records']) == 1
print(f"Session details fetched: Verified {len(fetched_sess['records'])} stored record(s).")

# E. Verify student attendance lookup
st, student_att = make_req(base_be + f'/api/v1/attendance/student/{priya_id}', 'GET', token=teacher_token)
assert st == 200 and student_att['total_sessions'] >= 1
print(f"Student Attendance Profile Lookup: Total: {student_att['total_sessions']}, Percentage: {student_att['attendance_percentage']}%")

# F. Class Management / Notice Creation
notice_payload = {
    "notice_type": "RESCHEDULED",
    "target_branch": "Computer Science & Engineering",
    "target_year": 2022,
    "target_semester": 6,
    "target_section": "A",
    "subject": "Distributed Systems",
    "class_date": (datetime.now(timezone.utc) + timedelta(days=1)).isoformat(),
    "period": "11:00 AM - 12:00 PM",
    "details": "Class rescheduled to Room 305 due to lab maintenance."
}
st, notice = make_req(base_be + '/api/v1/class-notices', 'POST', notice_payload, token=teacher_token)
assert st == 201, f"Create notice failed: {st}, {notice}"
print(f"Class Notice Created: [{notice['notice_type']}] {notice['subject']}")

# G. Class Notices Retrieval
st, notices_list = make_req(base_be + '/api/v1/class-notices', 'GET', token=teacher_token)
assert st == 200 and len(notices_list) >= 1
print(f"Class Notices Listed: {len(notices_list)} notices active.")

# H. Study Material Creation
material_payload = {
    "title": f"Distributed Systems Lecture Notes {uuid.uuid4().hex[:4]}",
    "description": "Consensus protocols, Raft, Paxos, and Byzantine Fault Tolerance.",
    "file_url": "/uploads/materials/cs602_notes.pdf",
    "file_type": "application/pdf",
    "targets": [
        {
            "branch": "Computer Science & Engineering",
            "batch_year": 2022,
            "semester": 6,
            "section": "A",
            "subject": "Distributed Systems"
        }
    ]
}
st, material = make_req(base_be + '/api/v1/materials', 'POST', material_payload, token=teacher_token)
assert st == 201, f"Create material failed: {st}, {material}"
print(f"Study Material Published: '{material['title']}' with {len(material['targets'])} target cohort(s).")

# I. Study Materials Retrieval
st, materials_list = make_req(base_be + '/api/v1/materials', 'GET', token=teacher_token)
assert st == 200 and len(materials_list) >= 1
print(f"Study Materials Listed: {len(materials_list)} documents found.")

print("\n--- 3. VERIFY LAB ASSISTANT WORKFLOWS (ramesh.lab@bput.ac.in) ---")
# Login
st, login_data = make_req(base_be + '/api/v1/auth/login', 'POST', {
    'username': 'ramesh.lab@bput.ac.in',
    'password': 'CampusFlow@2026'
})
assert st == 200, f"Lab login failed: {st}"
lab_token = login_data['access_token']
assert login_data['user']['role'] == 'LAB_ASSISTANT', f"Expected LAB_ASSISTANT, got {login_data['user']['role']}"
print(f"Lab Assistant login OK: {login_data['user']['email']} (Role: {login_data['user']['role']})")

# A. Register Equipment
eq_code = f"EQ-TEST-{uuid.uuid4().hex[:6].upper()}"
eq_payload = {
    "equipment_id": eq_code,
    "name": "Precision Surface Grinder",
    "category": "Grinding Tools",
    "lab_name": "Mechanical Workshop Lab 1",
    "total_quantity": 3,
    "available_quantity": 3,
    "damaged_quantity": 0,
    "working_status": "FUNCTIONAL",
    "maintenance_status": "Routine calibration verified."
}
st, eq = make_req(base_be + '/api/v1/lab/equipment', 'POST', eq_payload, token=lab_token)
assert st == 201, f"Register equipment failed: {st}, {eq}"
eq_id = eq['id']
print(f"Equipment Registered: {eq['name']} (ID: {eq['equipment_id']}, Status: {eq['working_status']})")

# B. Update Equipment
upd_payload = {
    "working_status": "NEEDS_REPAIR",
    "available_quantity": 2,
    "damaged_quantity": 1,
    "maintenance_status": "Spindle bearing replacement required."
}
st, updated_eq = make_req(base_be + f'/api/v1/lab/equipment/{eq_id}', 'PATCH', upd_payload, token=lab_token)
assert st == 200, f"Update equipment failed: {st}"
assert updated_eq['working_status'] == 'NEEDS_REPAIR' and updated_eq['damaged_quantity'] == 1
print(f"Equipment Updated: Status={updated_eq['working_status']}, Damaged={updated_eq['damaged_quantity']}")

# C. List Equipment
st, eq_list = make_req(base_be + '/api/v1/lab/equipment', 'GET', token=lab_token)
assert st == 200 and len(eq_list) >= 1
print(f"Equipment Listed: {len(eq_list)} tools and machines in inventory.")

# D. Requisition Full State Machine:
# DRAFT -> SUBMITTED -> APPROVED -> ORDERED -> COMPLETED
req_payload = {
    "lab_name": "Mechanical Workshop Lab 1",
    "items": [
        {
            "item_name": "High Speed Milling Cutters 20mm",
            "specifications": "Solid Carbide, 4 Flute",
            "quantity": 15,
            "unit": "pieces",
            "justification": "Replacement of dull cutters for semester machining projects."
        }
    ]
}
st, requisition = make_req(base_be + '/api/v1/lab/requisitions', 'POST', req_payload, token=lab_token)
assert st == 201, f"Create requisition failed: {st}, {requisition}"
req_id = requisition['id']
assert requisition['status'] == 'DRAFT'
print(f"Requisition Indent Created (Step 1/6): {requisition['requisition_number']} in status '{requisition['status']}'")

# E. Add Line Item to Draft
item_payload = {
    "item_name": "Coolant Fluid IS 1115",
    "specifications": "20L can",
    "quantity": 2,
    "unit": "cans",
    "justification": "Coolant level top-up"
}
st, item = make_req(base_be + f'/api/v1/lab/requisitions/{req_id}/items', 'POST', item_payload, token=lab_token)
assert st == 201, f"Add item failed: {st}, {item}"
print(f"Line Item Added to Draft: '{item['item_name']}' ({item['quantity']} {item['unit']})")

# F. Submit Requisition: DRAFT -> SUBMITTED
st, submitted_req = make_req(base_be + f'/api/v1/lab/requisitions/{req_id}/submit', 'POST', token=lab_token)
assert st == 200 and submitted_req['status'] == 'SUBMITTED'
print(f"Requisition Submitted (Step 2/6): Status is '{submitted_req['status']}'")

# G. Review Requisition: SUBMITTED -> APPROVED
review_payload = {"status": "APPROVED"}
st, approved_req = make_req(base_be + f'/api/v1/lab/requisitions/{req_id}/review', 'POST', review_payload, token=lab_token)
assert st == 200 and approved_req['status'] == 'APPROVED'
print(f"Requisition Reviewed (Step 3/6): Status transitioned to '{approved_req['status']}'")

# H. Move to Ordered: APPROVED -> ORDERED
st, ordered_req = make_req(base_be + f'/api/v1/lab/requisitions/{req_id}/order', 'POST', token=lab_token)
assert st == 200 and ordered_req['status'] == 'ORDERED'
print(f"Requisition Ordered (Step 4/6): Status transitioned to '{ordered_req['status']}'")

# I. Move to Completed: ORDERED -> COMPLETED
st, completed_req = make_req(base_be + f'/api/v1/lab/requisitions/{req_id}/complete', 'POST', token=lab_token)
assert st == 200 and completed_req['status'] == 'COMPLETED'
print(f"Requisition Completed (Step 5/6): Status transitioned to '{completed_req['status']}'")

# J. Requisition Rejection State Machine: DRAFT -> SUBMITTED -> REJECTED
r2_payload = {"lab_name": "Mechanical Workshop Lab 2"}
st, r2 = make_req(base_be + '/api/v1/lab/requisitions', 'POST', r2_payload, token=lab_token)
st, r2_sub = make_req(base_be + f"/api/v1/lab/requisitions/{r2['id']}/submit", 'POST', token=lab_token)
st, r2_rej = make_req(base_be + f"/api/v1/lab/requisitions/{r2['id']}/review", 'POST', {
    "status": "REJECTED",
    "rejection_reason": "Out of budget for FY 2026-Q1."
}, token=lab_token)
assert st == 200 and r2_rej['status'] == 'REJECTED' and r2_rej['rejection_reason'] == "Out of budget for FY 2026-Q1."
print(f"Requisition Rejection (Step 6/6): Status '{r2_rej['status']}' with recorded reason '{r2_rej['rejection_reason']}'")

# K. List Requisitions
st, reqs_list = make_req(base_be + '/api/v1/lab/requisitions', 'GET', token=lab_token)
assert st == 200 and len(reqs_list) >= 2
print(f"Requisitions Listed: {len(reqs_list)} total requisitions tracked.")

print("\n--- 4. REGRESSION VERIFICATION: STUDENT, WARDEN & HOSTEL FACULTY ---")
# Student: Priya Sharma
st, s_login = make_req(base_be + '/api/v1/auth/login', 'POST', {'username': 'priya.sharma@bput.ac.in', 'password': 'CampusFlow@2026'})
assert st == 200 and s_login['user']['role'] == 'STUDENT'
s_token = s_login['access_token']

st, s_att = make_req(base_be + '/api/v1/attendance/my-attendance', 'GET', token=s_token)
assert st == 200 and s_att['attendance_percentage'] > 0
st, s_docs = make_req(base_be + '/api/v1/documents', 'GET', token=s_token)
assert st == 200
st, s_passes = make_req(base_be + '/api/v1/gatepasses', 'GET', token=s_token)
assert st == 200
st, s_mats = make_req(base_be + '/api/v1/materials', 'GET', token=s_token)
assert st == 200
print(f"Student Regressions: Attendance ({s_att['attendance_percentage']}%), Documents ({len(s_docs)}), GatePasses ({len(s_passes)}), Materials ({len(s_mats)}) [ALL OK]")

# Warden: Sunil Sharma
st, w_login = make_req(base_be + '/api/v1/auth/login', 'POST', {'username': 'warden.sharma@bput.ac.in', 'password': 'CampusFlow@2026'})
assert st == 200 and w_login['user']['role'] == 'WARDEN'
w_token = w_login['access_token']
st, w_passes = make_req(base_be + '/api/v1/gatepasses', 'GET', token=w_token)
assert st == 200
st, w_cmps = make_req(base_be + '/api/v1/complaints', 'GET', token=w_token)
assert st == 200
print(f"Warden Regressions: GatePasses ({len(w_passes)}), Complaints ({len(w_cmps)}) [ALL OK]")

# Hostel Faculty: Dr. Bijoy Mishra
st, hf_login = make_req(base_be + '/api/v1/auth/login', 'POST', {'username': 'dr.mishra.hostel@bput.ac.in', 'password': 'CampusFlow@2026'})
assert st == 200 and hf_login['user']['role'] == 'HOSTEL_FACULTY'
hf_token = hf_login['access_token']
st, hf_passes = make_req(base_be + '/api/v1/gatepasses', 'GET', token=hf_token)
assert st == 200
st, hf_cmps = make_req(base_be + '/api/v1/complaints', 'GET', token=hf_token)
assert st == 200
print(f"Hostel Faculty Regressions: GatePasses ({len(hf_passes)}), Complaints ({len(hf_cmps)}) [ALL OK]")

print("\n============================================================")
print("PHASE 10 ALL SMOKE TESTS AND REGRESSIONS PASSED CLEANLY!")
print("============================================================")
