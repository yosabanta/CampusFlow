import re
from datetime import datetime, timedelta, timezone
from typing import Optional
from sqlalchemy.orm import Session
from app.models.complaint import Complaint

CATEGORY_KEYWORDS = {
    "plumbing": [r"\bpipe\b", r"\btap\b", r"\bwater\b", r"\bleak\b", r"\bbasin\b", r"\bflush\b", r"\bdrain\b", r"\bshower\b"],
    "electrical": [r"\blight\b", r"\bfan\b", r"\bswitch\b", r"\bwire\b", r"\bpower\b", r"\bsocket\b", r"\bfuse\b", r"\bmcb\b", r"\bshort circuit\b"],
    "carpentry": [r"\bdoor\b", r"\bwindow\b", r"\block\b", r"\bchair\b", r"\bdesk\b", r"\bhinge\b", r"\bbed\b", r"\btable\b", r"\bcupboard\b"],
    "internet": [r"\bwifi\b", r"\blan\b", r"\brouter\b", r"\bethernet\b", r"\bnetwork\b", r"\bslow\b", r"\bdisconnect\b", r"\binternet\b"],
    "mess": [r"\bfood\b", r"\bmess\b", r"\bmeal\b", r"\blunch\b", r"\bdinner\b", r"\broti\b", r"\bdal\b", r"\bhygiene\b", r"\bcaterer\b"]
}


def triage_complaint_category(title: str, description: str) -> str:
    """
    Lightweight heuristic triage engine.
    Matches keywords and regex patterns against complaint title & description
    to automatically classify category if not provided by student.
    """
    combined_text = f"{title} {description}".lower()

    for category, patterns in CATEGORY_KEYWORDS.items():
        for pattern in patterns:
            if re.search(pattern, combined_text):
                return category

    return "general"


def detect_recurring_hotspot(db: Session, location_details: str, category_id: str) -> bool:
    """
    Heuristic hotspot detector.
    Rule: >= 3 complaints in the same location/block within the last 14 days.
    When a student submits a complaint, if >= 2 complaints already exist for this
    location/category in the last 14 days, the new complaint constitutes the 3rd+
    hotspot occurrence, triggering is_recurring = True.
    """
    two_weeks_ago = datetime.now(timezone.utc) - timedelta(days=14)
    if db.bind and db.bind.dialect.name == "sqlite":
        two_weeks_ago = two_weeks_ago.replace(tzinfo=None)

    # Extract primary location token (e.g. 'Block B' or 'Hostel B' or first 15 chars)
    normalized_loc = location_details.strip()

    count = db.query(Complaint).filter(
        Complaint.category_id == category_id,
        Complaint.created_at >= two_weeks_ago,
        Complaint.location_details.ilike(f"%{normalized_loc[:15]}%")
    ).count()

    return count >= 2

