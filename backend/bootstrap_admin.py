#!/usr/bin/env python3
"""
CampusFlow — Secure First Administrator Bootstrap CLI
Creates the root campus administrative user in a clean, unseeded database.

Usage:
    python bootstrap_admin.py --email admin@campus.edu --first-name Ashok --last-name Patnaik --phone 9876543211

Flags:
    --email        Administrator institutional email address (required)
    --first-name   Administrator given name (required)
    --last-name    Administrator surname (required)
    --phone        Contact mobile number (10-15 digits, required)
    --password     Administrator password (optional; securely prompted if omitted)
    --force        Allow creating an additional admin if one already exists
"""

import sys
import os
import argparse
import getpass
import re
import uuid
from datetime import datetime, timezone

# Add backend directory to sys.path
backend_dir = os.path.dirname(os.path.abspath(__file__))
if backend_dir not in sys.path:
    sys.path.insert(0, backend_dir)

from app.core.config import settings
from app.core.database import SessionLocal, engine
from app.core.security import hash_password
from app.models.user import User, UserRole
from app.models.audit import AuditLog


EMAIL_REGEX = re.compile(r"^[\w\.-]+@[\w\.-]+\.\w+$")
PHONE_REGEX = re.compile(r"^\+?[0-9]{10,15}$")


def validate_email(email: str) -> str:
    cleaned = email.strip().lower()
    if not EMAIL_REGEX.match(cleaned):
        raise ValueError(f"Invalid email address format: '{email}'")
    return cleaned


def validate_phone(phone: str) -> str:
    cleaned = phone.strip()
    if not PHONE_REGEX.match(cleaned):
        raise ValueError(f"Invalid phone number format: '{phone}' (must be 10-15 numeric digits)")
    return cleaned


def validate_password(password: str) -> str:
    if len(password) < 8:
        raise ValueError("Password must be at least 8 characters long.")
    return password


def bootstrap_admin(
    email: str,
    first_name: str,
    last_name: str,
    phone: str,
    password: Optional[str] = None,
    force: bool = False,
    update: bool = False,
    db = None
) -> User:
    """
    Creates or safely updates an administrator account with verified hashed password and audit logging.
    Enforces single-bootstrap rule unless --force or --update is explicitly provided.
    """
    email_clean = validate_email(email)
    phone_clean = validate_phone(phone)
    pwd_clean = validate_password(password) if password else None
    fname_clean = first_name.strip()
    lname_clean = last_name.strip()

    if not fname_clean or not lname_clean:
        raise ValueError("First name and last name must not be empty.")

    def _execute(session):
        # Check if an administrator already exists
        existing_admin = session.query(User).filter(User.role == UserRole.ADMIN).first()
        if existing_admin:
            if update:
                # Safely update existing administrator account
                prev_state = {
                    "email": existing_admin.email,
                    "first_name": existing_admin.first_name,
                    "last_name": existing_admin.last_name,
                    "phone": existing_admin.phone_number
                }
                existing_admin.email = email_clean
                existing_admin.first_name = fname_clean
                existing_admin.last_name = lname_clean
                existing_admin.phone_number = phone_clean
                if pwd_clean:
                    existing_admin.password_hash = hash_password(pwd_clean)

                audit_entry = AuditLog(
                    actor_id=existing_admin.id,
                    entity_type="USER",
                    entity_id=existing_admin.id,
                    action="ADMIN_UPDATE",
                    previous_state=prev_state,
                    new_state={
                        "email": email_clean,
                        "first_name": fname_clean,
                        "last_name": lname_clean,
                        "phone": phone_clean
                    }
                )
                session.add(audit_entry)
                session.commit()
                session.refresh(existing_admin)
                return existing_admin

            if not force:
                raise ValueError(
                    f"An administrator already exists ({existing_admin.email}). Initial setup completed. Use '--update' to modify or '--force' to add another."
                )

        if not pwd_clean:
            raise ValueError("Password is required when creating a new administrator account.")

        # Check for duplicate email or phone number
        duplicate_user = session.query(User).filter(
            (User.email == email_clean) | (User.phone_number == phone_clean)
        ).first()

        if duplicate_user:
            raise ValueError(
                f"A user with email '{email_clean}' or phone '{phone_clean}' already exists (Role: {duplicate_user.role.value})."
            )

        hashed_pwd = hash_password(pwd_clean)

        admin_user = User(
            id=uuid.uuid4(),
            email=email_clean,
            phone_number=phone_clean,
            password_hash=hashed_pwd,
            role=UserRole.ADMIN,
            first_name=fname_clean,
            last_name=lname_clean,
            theme_preference="light",
            is_active=True
        )
        session.add(admin_user)
        session.flush()

        # Record audit log entry
        audit_entry = AuditLog(
            actor_id=admin_user.id,
            entity_type="USER",
            entity_id=admin_user.id,
            action="ADMIN_BOOTSTRAP",
            previous_state=None,
            new_state={
                "email": email_clean,
                "role": UserRole.ADMIN.value,
                "first_name": fname_clean,
                "last_name": lname_clean
            }
        )
        session.add(audit_entry)
        session.commit()
        session.refresh(admin_user)
        return admin_user

    if db is not None:
        return _execute(db)

    if SessionLocal is None:
        raise RuntimeError("Database session factory is not configured. Check DATABASE_URL in .env.")

    with SessionLocal() as session:
        return _execute(session)


def main():
    parser = argparse.ArgumentParser(
        description="CampusFlow Safe First-Administrator Bootstrap CLI"
    )
    parser.add_argument("--email", type=str, required=True, help="Administrator email (e.g. dev.rocky2006@gmail.com)")
    parser.add_argument("--first-name", type=str, required=True, help="Administrator first name")
    parser.add_argument("--last-name", type=str, required=True, help="Administrator last name")
    parser.add_argument("--phone", type=str, required=True, help="Administrator phone number (10 digits)")
    parser.add_argument("--password", type=str, default=None, help="Administrator password (prompted if omitted)")
    parser.add_argument("--force", action="store_true", help="Allow creating additional administrator account")
    parser.add_argument("--update", action="store_true", help="Safely update existing administrator account")

    args = parser.parse_args()

    password = args.password
    if not password:
        while True:
            password = getpass.getpass("Enter administrator password (min 8 chars): ")
            if len(password) < 8:
                print("Password must be at least 8 characters. Please try again.")
                continue
            confirm = getpass.getpass("Confirm administrator password: ")
            if password != confirm:
                print("Passwords do not match. Please try again.")
                continue
            break

    try:
        admin = bootstrap_admin(
            email=args.email,
            first_name=args.first_name,
            last_name=args.last_name,
            phone=args.phone,
            password=password,
            force=args.force,
            update=args.update
        )
        print("\n" + "=" * 60)
        print("  CAMPUSFLOW FIRST ADMINISTRATOR CREATED SUCCESSFULLY")
        print("=" * 60)
        print(f"  User ID:    {admin.id}")
        print(f"  Email:      {admin.email}")
        print(f"  Name:       {admin.first_name} {admin.last_name}")
        print(f"  Role:       {admin.role.value}")
        print(f"  Phone:      {admin.phone_number}")
        print(f"  Database:   {settings.DATABASE_URL}")
        print("=" * 60)
        print("  You may now log in to the CampusFlow Control Tower using these credentials.\n")
    except Exception as ex:
        print(f"\n[BOOTSTRAP ERROR] {ex}", file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()
