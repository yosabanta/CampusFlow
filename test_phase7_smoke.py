import urllib.request
import json
import sys

base_fe = 'http://127.0.0.1:5500'
base_be = 'http://127.0.0.1:8000'

print('=== 1. VERIFY FRONTEND ASSETS SERVED ===')
assets = [
    '/index.html', '/manifest.json', '/sw.js',
    '/css/variables.css', '/css/base.css', '/css/layout.css',
    '/css/components.css', '/css/forms.css', '/css/tables.css',
    '/css/responsive.css', '/css/themes.css',
    '/js/app.js', '/js/api.js', '/js/auth.js', '/js/router.js',
    '/js/state.js', '/js/notifications.js', '/js/theme.js',
    '/js/ui.js', '/js/utils.js', '/assets/icons/icon-192.svg'
]
for path in assets:
    req = urllib.request.urlopen(base_fe + path)
    assert req.status == 200, f'Failed {path}'
print(f'All {len(assets)} Frontend Shell assets returned HTTP 200 OK')

print('\n=== 2. VERIFY BACKEND HEALTH ===')
h_req = urllib.request.urlopen(base_be + '/health')
h_data = json.loads(h_req.read().decode())
assert h_data['status'] == 'ok', 'Degraded health'
print('Backend Health Status:', h_data['status'], '| App:', h_data['app'])

print('\n=== 3. VERIFY STUDENT AUTH & WORKFLOW DATA ===')
login_payload = json.dumps({'username': 'priya.sharma@bput.ac.in', 'password': 'CampusFlow@2026'}).encode()
l_req = urllib.request.Request(base_be + '/api/v1/auth/login', data=login_payload, headers={'Content-Type': 'application/json'})
l_resp = urllib.request.urlopen(l_req)
l_data = json.loads(l_resp.read().decode())
token = l_data['access_token']
assert token, 'No token'
print('Login OK, Token issued for Student Priya Sharma')

# Profile /auth/me
me_req = urllib.request.Request(base_be + '/api/v1/auth/me', headers={'Authorization': f'Bearer {token}'})
me_data = json.loads(urllib.request.urlopen(me_req).read().decode())
assert me_data['email'] == 'priya.sharma@bput.ac.in', 'Wrong email'
assert me_data['first_name'] == 'Priya', 'Wrong first name'
print('Profile Verified: Student Email:', me_data['email'], '| Name:', me_data['first_name'], me_data['last_name'])

# Notice Board
n_req = urllib.request.Request(base_be + '/api/v1/class-notices', headers={'Authorization': f'Bearer {token}'})
notices = json.loads(urllib.request.urlopen(n_req).read().decode())
assert len(notices) >= 1, 'No notices returned'
print(f'Notice Board: Loaded {len(notices)} real cohort notices:')
for n in notices:
    print(f"  - [{n['notice_type']}] {n['subject']}: {n['details'][:60]}...")

# Notifications
notif_req = urllib.request.Request(base_be + '/api/v1/notifications', headers={'Authorization': f'Bearer {token}'})
notifs = json.loads(urllib.request.urlopen(notif_req).read().decode())
print(f"Notifications Center: Loaded {len(notifs['notifications'])} items, Unread: {notifs['unread_count']}")
for nt in notifs['notifications']:
    print(f"  - [Read={nt['is_read']}] {nt['title']}: {nt['message'][:50]}...")

# Mark read
unread_notifs = [nt for nt in notifs['notifications'] if not nt['is_read']]
if unread_notifs:
    target_id = unread_notifs[0]['id']
    patch_req = urllib.request.Request(
        f"{base_be}/api/v1/notifications/{target_id}/read",
        method='PATCH',
        headers={'Authorization': f'Bearer {token}', 'Content-Type': 'application/json'}
    )
    patch_res = json.loads(urllib.request.urlopen(patch_req).read().decode())
    assert patch_res['is_read'] is True, 'Failed to mark read'
    print(f"Notification Mark Read Verified: ID {target_id} is_read=True")

print('\n=== 4. VERIFY MULTI-ROLE RBAC ACCESS ===')
demo_roles = [
    ('dean.admin@bput.ac.in', 'ADMIN'),
    ('warden.sharma@bput.ac.in', 'WARDEN'),
    ('dr.mishra.hostel@bput.ac.in', 'HOSTEL_FACULTY'),
    ('prof.mohanty@bput.ac.in', 'TEACHER'),
    ('ramesh.lab@bput.ac.in', 'LAB_ASSISTANT'),
    ('ramesh.estate@bput.ac.in', 'STAFF'),
    ('guard.gate1@bput.ac.in', 'GUARD')
]
for email, expected_role in demo_roles:
    lp = json.dumps({'username': email, 'password': 'CampusFlow@2026'}).encode()
    r = urllib.request.urlopen(urllib.request.Request(base_be + '/api/v1/auth/login', data=lp, headers={'Content-Type': 'application/json'}))
    tok = json.loads(r.read().decode())['access_token']
    mr = urllib.request.urlopen(urllib.request.Request(base_be + '/api/v1/auth/me', headers={'Authorization': f'Bearer {tok}'}))
    m_data = json.loads(mr.read().decode())
    assert m_data['role'] == expected_role, f'Mismatch for {email}'
    print(f"  [OK] Role Verified: {expected_role:<15} ({m_data['first_name']} {m_data['last_name']})")

print('\n=== ALL SMOKE TESTS PASSED CLEANLY! ===')
