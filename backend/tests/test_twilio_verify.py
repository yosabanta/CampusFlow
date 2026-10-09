import os
import uuid
import hashlib
from datetime import datetime, timedelta, timezone
from unittest.mock import patch, MagicMock
import pytest
from fastapi.testclient import TestClient
from fastapi import HTTPException
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from twilio.base.exceptions import TwilioRestException

from app.main import app
from app.core.database import Base, get_db
from app.core.security import create_access_token, hash_password
from app.models.user import User, Student, UserRole
from app.models.complaint import Complaint
from app.models.proxy_request import OTPVerification, ProxyRequest
from app.services.twilio_verify_service import normalize_to_e164, TwilioVerifyService
from seed import seed_demo_users, DEMO_PASSWORD

TEST_DB_PATH = "test_twilio_verify.db"
test_engine = create_engine(
    f"sqlite:///{TEST_DB_PATH}",
    connect_args={"check_same_thread": False}
)
TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=test_engine)


def override_get_db():
    db = TestingSessionLocal()
    try:
        yield db
    finally:
        db.close()


@pytest.fixture(scope="module", autouse=True)
def setup_test_db():
    if os.path.exists(TEST_DB_PATH):
        try:
            os.remove(TEST_DB_PATH)
        except OSError:
            pass

    Base.metadata.create_all(bind=test_engine)
    db = TestingSessionLocal()
    seed_demo_users(db)

    # Add beneficiary student B: Sanjay Soren
    student_b_user = User(
        email="sanjay.soren.twilio@bput.ac.in",
        phone_number="9876544102",
        password_hash=hash_password(DEMO_PASSWORD),
        role=UserRole.STUDENT,
        first_name="Sanjay",
        last_name="Soren",
        theme_preference="light",
        is_active=True
    )
    db.add(student_b_user)
    db.flush()

    student_b = Student(
        id=student_b_user.id,
        roll_number="2201099",
        university_reg_number="2201099REG",
        department="Mechanical Engineering",
        batch_year=2022,
        semester=6,
        section="A",
        hostel_block="B",
        room_number="108"
    )
    db.add(student_b)
    db.commit()
    db.close()

    app.dependency_overrides[get_db] = override_get_db
    yield
    app.dependency_overrides.pop(get_db, None)
    if os.path.exists(TEST_DB_PATH):
        try:
            os.remove(TEST_DB_PATH)
        except OSError:
            pass


@pytest.fixture
def client():
    return TestClient(app)


def get_student_token(client, email="priya.sharma@bput.ac.in"):
    resp = client.post(
        "/api/v1/auth/login",
        json={"username": email, "password": DEMO_PASSWORD}
    )
    return resp.json()["access_token"]


# ==============================================================================
# 1. E.164 NORMALIZATION TESTS
# ==============================================================================

def test_normalize_to_e164_standard_indian_10_digits():
    assert normalize_to_e164("9876544102") == "+919876544102"
    assert normalize_to_e164(" 9876544102 ") == "+919876544102"


def test_normalize_to_e164_with_country_code():
    assert normalize_to_e164("+919876544102") == "+919876544102"
    assert normalize_to_e164("+91 9876544102") == "+919876544102"
    assert normalize_to_e164("919876544102") == "+919876544102"


def test_normalize_to_e164_with_trunk_zero():
    assert normalize_to_e164("09876544102") == "+919876544102"


def test_normalize_to_e164_invalid_cases():
    with pytest.raises(ValueError):
        normalize_to_e164("")
    with pytest.raises(ValueError):
        normalize_to_e164("123")
    with pytest.raises(ValueError):
        normalize_to_e164("abcdefghij")


# ==============================================================================
# 2. TWILIO VERIFY INITIATE & DISPATCH TESTS
# ==============================================================================

def test_initiate_otp_success_with_twilio_mock(client):
    """Initiates verification via Twilio: returns 200, status OTP_SENT, no demo_otp returned."""
    token = get_student_token(client)

    with patch("app.services.proxy_service.twilio_verify_service.start_verification") as mock_start:
        mock_start.return_value = {
            "sid": "VE1234567890abcdef1234567890abcdef",
            "status": "pending",
            "to": "+919876544102"
        }

        resp = client.post(
            "/api/v1/help-a-friend/initiate",
            json={
                "beneficiary_roll_number": "2201099",
                "student_mobile_number": "9876544102"
            },
            headers={"Authorization": f"Bearer {token}"}
        )

        assert resp.status_code == 200
        data = resp.json()
        assert data["status"] == "OTP_SENT"
        assert data["beneficiary_roll_number"] == "2201099"
        assert data["masked_phone"] == "****4102"
        assert data["expires_in_seconds"] == 600
        # Critical security assertion: demo_otp MUST BE None
        assert data["demo_otp"] is None

        # Verify Twilio SDK mock was called with strict E.164 phone
        mock_start.assert_called_once_with(phone_e164="+919876544102", channel="sms")

        # Verify record in database does NOT store plaintext OTP
        db = TestingSessionLocal()
        record = db.query(OTPVerification).filter(
            OTPVerification.phone_number == "+919876544102"
        ).order_by(OTPVerification.created_at.desc()).first()
        assert record is not None
        assert record.is_verified is False
        assert len(record.otp_code_hash) == 64
        # otp_code_hash is SHA256 of the verification SID
        expected_hash = hashlib.sha256("VE1234567890abcdef1234567890abcdef".encode()).hexdigest()
        assert record.otp_code_hash == expected_hash
        db.close()


def test_initiate_otp_resend_cooldown_triggers_429(client):
    """Enforces 60-second cooldown between consecutive OTP requests for the same beneficiary."""
    token = get_student_token(client)

    # Immediately request another OTP for roll 2201099
    resp = client.post(
        "/api/v1/help-a-friend/initiate",
        json={"beneficiary_roll_number": "2201099"},
        headers={"Authorization": f"Bearer {token}"}
    )
    assert resp.status_code == 429
    assert "Rate limit exceeded" in resp.json()["error"]["message"]


def test_initiate_otp_beneficiary_not_found_returns_404(client):
    token = get_student_token(client)
    resp = client.post(
        "/api/v1/help-a-friend/initiate",
        json={"beneficiary_roll_number": "NON_EXISTENT_ROLL"},
        headers={"Authorization": f"Bearer {token}"}
    )
    assert resp.status_code == 404


def test_initiate_otp_mismatched_phone_returns_400(client):
    token = get_student_token(client)
    resp = client.post(
        "/api/v1/help-a-friend/initiate",
        json={
            "beneficiary_roll_number": "2201099",
            "student_mobile_number": "9999999999"
        },
        headers={"Authorization": f"Bearer {token}"}
    )
    assert resp.status_code == 400
    assert "does not match" in resp.json()["error"]["message"]


# ==============================================================================
# 3. TWILIO VERIFY CHECK TESTS
# ==============================================================================

def test_verify_otp_wrong_code_decrements_attempts_and_returns_400(client):
    """Submitting wrong code increments attempts and raises 400."""
    token = get_student_token(client)

    with patch("app.services.proxy_service.twilio_verify_service.check_verification") as mock_check:
        mock_check.return_value = {
            "sid": "VE123",
            "status": "pending",
            "valid": False
        }

        resp = client.post(
            "/api/v1/help-a-friend/verify-otp",
            json={
                "beneficiary_roll_number": "2201099",
                "otp_code": "000000"
            },
            headers={"Authorization": f"Bearer {token}"}
        )

        assert resp.status_code == 400
        assert "Invalid OTP code" in resp.json()["error"]["message"]
        assert "2 attempt(s) remaining" in resp.json()["error"]["message"]


def test_verify_otp_max_attempts_lockout(client):
    """Exceeding 3 failed attempts locks out the request."""
    token = get_student_token(client)

    with patch("app.services.proxy_service.twilio_verify_service.check_verification") as mock_check:
        mock_check.return_value = {"sid": "VE123", "status": "pending", "valid": False}

        # Attempt 2
        client.post(
            "/api/v1/help-a-friend/verify-otp",
            json={"beneficiary_roll_number": "2201099", "otp_code": "111111"},
            headers={"Authorization": f"Bearer {token}"}
        )

        # Attempt 3
        client.post(
            "/api/v1/help-a-friend/verify-otp",
            json={"beneficiary_roll_number": "2201099", "otp_code": "222222"},
            headers={"Authorization": f"Bearer {token}"}
        )

        # Attempt 4: Should be locked out
        resp = client.post(
            "/api/v1/help-a-friend/verify-otp",
            json={"beneficiary_roll_number": "2201099", "otp_code": "333333"},
            headers={"Authorization": f"Bearer {token}"}
        )
        assert resp.status_code == 400
        assert "exceeded" in resp.json()["error"]["message"].lower()


def test_verify_otp_expired_code_fails(client):
    """Expired OTP record rejected with 400."""
    token = get_student_token(client)

    # Seed an expired record
    db = TestingSessionLocal()
    beneficiary = db.query(Student).filter(Student.roll_number == "2201099").first()
    expired_record = OTPVerification(
        beneficiary_student_id=beneficiary.id,
        phone_number="+919876544102",
        otp_code_hash=hashlib.sha256(b"sid").hexdigest(),
        purpose="HELP_A_FRIEND",
        expires_at=datetime.now(timezone.utc) - timedelta(minutes=1),
        attempts=0,
        is_verified=False
    )
    db.add(expired_record)
    db.commit()
    db.close()

    resp = client.post(
        "/api/v1/help-a-friend/verify-otp",
        json={"beneficiary_roll_number": "2201099", "otp_code": "654321"},
        headers={"Authorization": f"Bearer {token}"}
    )
    assert resp.status_code == 400
    assert "expired" in resp.json()["error"]["message"].lower()


def test_verify_otp_success_and_complaint_submission(client):
    """Valid verification code approved by Twilio permits proxy complaint submission."""
    token = get_student_token(client)

    # Seed a fresh pending OTP record with future expiration
    db = TestingSessionLocal()
    beneficiary = db.query(Student).filter(Student.roll_number == "2201099").first()
    beneficiary_id = str(beneficiary.id)
    pending_record = OTPVerification(
        beneficiary_student_id=beneficiary.id,
        phone_number="+919876544102",
        otp_code_hash=hashlib.sha256(b"valid_sid").hexdigest(),
        purpose="HELP_A_FRIEND",
        expires_at=datetime.now(timezone.utc) + timedelta(minutes=10),
        attempts=0,
        is_verified=False
    )
    db.add(pending_record)
    db.commit()
    db.refresh(pending_record)
    otp_id = str(pending_record.id)
    db.close()

    with patch("app.services.proxy_service.twilio_verify_service.check_verification") as mock_check:
        mock_check.return_value = {
            "sid": "VExxx",
            "status": "approved",
            "valid": True
        }

        # Step 3: Verify OTP
        verify_resp = client.post(
            "/api/v1/help-a-friend/verify-otp",
            json={
                "beneficiary_roll_number": "2201099",
                "otp_code": "123456"
            },
            headers={"Authorization": f"Bearer {token}"}
        )
        assert verify_resp.status_code == 200
        assert verify_resp.json()["status"] == "VERIFIED"
        assert verify_resp.json()["otp_verification_id"] == otp_id

        # Step 4: Lodge complaint using the verified token
        submit_resp = client.post(
            "/api/v1/help-a-friend/submit",
            json={
                "otp_verification_id": otp_id,
                "complaint": {
                    "title": "Twilio proxy test ticket - AC unit breakdown",
                    "description": "Room 108 AC unit is not turning on.",
                    "location_type": "Hostel",
                    "location_details": "Hostel B Room 108",
                    "priority": "HIGH"
                }
            },
            headers={"Authorization": f"Bearer {token}"}
        )
        assert submit_resp.status_code == 201
        data = submit_resp.json()
        assert data["student_id"] == beneficiary_id

        # Single-use enforcement: Attempting to use the same token again fails with 409
        second_submit = client.post(
            "/api/v1/help-a-friend/submit",
            json={
                "otp_verification_id": otp_id,
                "complaint": {
                    "title": "Duplicate proxy attempt",
                    "description": "Should fail.",
                    "location_type": "Hostel",
                    "location_details": "Hostel B",
                    "priority": "LOW"
                }
            },
            headers={"Authorization": f"Bearer {token}"}
        )
        assert second_submit.status_code == 409


# ==============================================================================
# 4. ERROR HANDLING & MISSING CONFIG TESTS
# ==============================================================================

def test_twilio_unconfigured_raises_503():
    """TwilioVerifyService raises 503 if credentials are unconfigured."""
    with patch("app.core.config.settings.TWILIO_ACCOUNT_SID", None), \
         patch("app.core.config.settings.TWILIO_AUTH_TOKEN", None), \
         patch("app.core.config.settings.TWILIO_VERIFY_SERVICE_SID", None):
        service = TwilioVerifyService(account_sid=None, auth_token=None, service_sid=None)
        with pytest.raises(HTTPException) as exc:
            service.start_verification("+919876544102")
        assert exc.value.status_code == 503
        assert "not configured" in exc.value.detail


def test_twilio_provider_error_handling():
    """Verifies that TwilioRestException error codes map to proper HTTP status codes."""
    service = TwilioVerifyService(
        account_sid="ACdummy",
        auth_token="dummy_token",
        service_sid="VAdummy"
    )

    # Mock client to raise TwilioRestException
    mock_client = MagicMock()
    service._client = mock_client

    # 60200 -> 400 Bad Request
    mock_client.verify.v2.services.return_value.verifications.create.side_effect = TwilioRestException(
        status=400, uri="/v2/Services", msg="Invalid phone number", code=60200
    )
    with pytest.raises(HTTPException) as exc:
        service.start_verification("+919876544102")
    assert exc.value.status_code == 400
    assert "invalid" in exc.value.detail.lower()

    # 60203 -> 429 Too Many Requests
    mock_client.verify.v2.services.return_value.verifications.create.side_effect = TwilioRestException(
        status=429, uri="/v2/Services", msg="Max send attempts reached", code=60203
    )
    with pytest.raises(HTTPException) as exc:
        service.start_verification("+919876544102")
    assert exc.value.status_code == 429
    assert "Maximum OTP send attempts" in exc.value.detail

    # 21608 -> 400 Twilio trial restriction
    mock_client.verify.v2.services.return_value.verifications.create.side_effect = TwilioRestException(
        status=400, uri="/v2/Services", msg="Trial unverified number", code=21608
    )
    with pytest.raises(HTTPException) as exc:
        service.start_verification("+919876544102")
    assert exc.value.status_code == 400
    assert "trial" in exc.value.detail.lower()


def test_initiate_otp_lookup_by_university_reg_number_and_email(client):
    """Verifies that a student can be looked up by University Registration Number or Email."""
    token = get_student_token(client)
    with patch("app.services.proxy_service.twilio_verify_service.start_verification") as mock_start, \
         patch("app.services.proxy_service.datetime") as mock_dt:
        from datetime import datetime, timezone, timedelta
        future_time = datetime.now(timezone.utc) + timedelta(minutes=10)
        mock_dt.now.return_value = future_time
        mock_start.return_value = {"sid": "VAbypasstest", "status": "pending"}

        # Lookup using university_reg_number
        res1 = client.post(
            "/api/v1/help-a-friend/initiate",
            json={
                "beneficiary_roll_number": "2201099REG",
                "student_mobile_number": "9876544102"
            },
            headers={"Authorization": f"Bearer {token}"}
        )
        assert res1.status_code == 200
        assert res1.json()["status"] == "OTP_SENT"
        assert res1.json()["beneficiary_roll_number"] == "2201099REG"

        # Advance further for second call
        mock_dt.now.return_value = future_time + timedelta(minutes=5)
        res2 = client.post(
            "/api/v1/help-a-friend/initiate",
            json={
                "beneficiary_roll_number": "sanjay.soren.twilio@bput.ac.in",
                "student_mobile_number": "9876544102"
            },
            headers={"Authorization": f"Bearer {token}"}
        )
        assert res2.status_code == 200
        assert res2.json()["status"] == "OTP_SENT"
