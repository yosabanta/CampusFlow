import logging
import re
from typing import Optional, Dict, Any
from fastapi import HTTPException, status
from twilio.rest import Client
from twilio.base.exceptions import TwilioRestException
from app.core.config import settings

logger = logging.getLogger(__name__)


def normalize_to_e164(phone: str, default_country_code: str = "+91") -> str:
    """
    Normalize arbitrary phone strings to strict E.164 format (+[country_code][number]).
    Default country code is India (+91) for standard 10-digit campus roll numbers.
    """
    if not phone:
        raise ValueError("Phone number cannot be empty.")
    
    cleaned = phone.strip()
    # Check if already starts with '+'
    if cleaned.startswith("+"):
        digits_only = re.sub(r"[^\d]", "", cleaned[1:])
        if len(digits_only) < 7 or len(digits_only) > 15:
            raise ValueError(f"Invalid phone number length for E.164: '{phone}'")
        return f"+{digits_only}"
    
    # Strip any non-digit characters
    digits = re.sub(r"\D", "", cleaned)
    
    # If 10 digits (standard Indian mobile), prepend default country code (+91)
    if len(digits) == 10:
        return f"{default_country_code}{digits}"
    
    # If 12 digits starting with 91
    if len(digits) == 12 and digits.startswith("91"):
        return f"+{digits}"
    
    # If 11 digits starting with 0 (national trunk prefix)
    if len(digits) == 11 and digits.startswith("0"):
        return f"{default_country_code}{digits[1:]}"
    
    # Otherwise check general length
    if 7 <= len(digits) <= 15:
        if not default_country_code.startswith("+"):
            default_country_code = f"+{default_country_code}"
        return f"{default_country_code}{digits}"
    
    raise ValueError(f"Unable to normalize phone number '{phone}' to E.164.")


class TwilioVerifyService:
    """
    Wrapper around Twilio Verify v2 REST API.
    Provides start_verification and check_verification.
    """

    def __init__(
        self,
        account_sid: Optional[str] = None,
        auth_token: Optional[str] = None,
        service_sid: Optional[str] = None
    ):
        self.account_sid = account_sid if account_sid is not None else settings.TWILIO_ACCOUNT_SID
        self.auth_token = auth_token if auth_token is not None else settings.TWILIO_AUTH_TOKEN
        self.service_sid = service_sid if service_sid is not None else settings.TWILIO_VERIFY_SERVICE_SID
        self._client: Optional[Client] = None

    def _get_client(self) -> Client:
        if not self.account_sid or not self.auth_token or not self.service_sid:
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail="Twilio Verify service is not configured on the server. Please contact administrator."
            )
        if self._client is None:
            self._client = Client(self.account_sid, self.auth_token)
        return self._client

    def start_verification(self, phone_e164: str, channel: str = "sms") -> Dict[str, Any]:
        """
        Initiates an SMS OTP verification via Twilio Verify Service.
        Never returns the actual OTP (Twilio generates and dispatches it directly).
        """
        client = self._get_client()
        try:
            verification = client.verify.v2.services(self.service_sid).verifications.create(
                to=phone_e164,
                channel=channel
            )
            logger.info(
                f"[Twilio Verify] Verification initiated for {phone_e164[:4]}***{phone_e164[-2:]} "
                f"| SID: {verification.sid} | Status: {verification.status}"
            )
            return {
                "sid": verification.sid,
                "status": verification.status,
                "to": verification.to
            }
        except TwilioRestException as e:
            logger.error(f"[Twilio Verify Error] Start verification failed for {phone_e164}: Code {e.code} - {e.msg}")
            if e.code == 60200:  # Invalid parameter / phone number
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="The provided phone number is invalid for SMS delivery."
                )
            elif e.code == 60203:  # Max send attempts reached
                raise HTTPException(
                    status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                    detail="Maximum OTP send attempts reached for this number. Please try again later."
                )
            elif e.code == 21608:  # Unverified recipient in Twilio trial mode
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Twilio trial account restriction: recipient phone number must be verified in Twilio Console."
                )
            elif e.code in (20003, 20404):  # Authentication or Service not found
                raise HTTPException(
                    status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                    detail="Twilio Verify provider authentication error or service not found."
                )
            else:
                raise HTTPException(
                    status_code=status.HTTP_502_BAD_GATEWAY,
                    detail=f"SMS provider error: {e.msg}"
                )
        except Exception as e:
            logger.error(f"[Twilio Verify Error] Unexpected error starting verification: {str(e)}")
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="An unexpected error occurred while dispatching verification SMS."
            )

    def check_verification(self, phone_e164: str, code: str) -> Dict[str, Any]:
        """
        Checks an OTP code against Twilio Verify Service.
        Returns dict with status ('approved', 'pending', 'canceled').
        """
        client = self._get_client()
        try:
            check = client.verify.v2.services(self.service_sid).verification_checks.create(
                to=phone_e164,
                code=code.strip()
            )
            logger.info(
                f"[Twilio Verify] Check verification for {phone_e164[:4]}***{phone_e164[-2:]} "
                f"| SID: {check.sid} | Status: {check.status} | Valid: {check.valid}"
            )
            return {
                "sid": check.sid,
                "status": check.status,
                "valid": bool(check.valid)
            }
        except TwilioRestException as e:
            logger.error(f"[Twilio Verify Error] Check verification failed for {phone_e164}: Code {e.code} - {e.msg}")
            if e.code == 60202:  # Max check attempts reached
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Maximum verification check attempts exceeded. Please initiate a new code."
                )
            elif e.code == 20404:  # Verification not found or expired
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Verification code expired or not found. Please initiate a fresh request."
                )
            else:
                raise HTTPException(
                    status_code=status.HTTP_502_BAD_GATEWAY,
                    detail=f"SMS verification provider error: {e.msg}"
                )
        except Exception as e:
            logger.error(f"[Twilio Verify Error] Unexpected error checking verification: {str(e)}")
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="An unexpected error occurred while verifying OTP."
            )


# Default singleton instance
twilio_verify_service = TwilioVerifyService()
