import math
import re
import threading
import time
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, List, Optional

from fastapi import Depends, FastAPI, HTTPException, status
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, EmailStr, Field
from sqlalchemy import func
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session

from database import get_db
from models import (
    Category,
    Citizen,
    Department,
    District,
    Grievance,
    GrievanceLog,
    Notification,
    Officer,
    Subcategory,
    Ward,
    post_status_enum,
)


ACTIVE_STATUSES = ("Pending", "In Progress", "Reopened")
PRIORITY_ORDER = ("Low", "Medium", "High", "Critical")
DEDUP_RADIUS_METERS = 50
DEDUP_WINDOW_DAYS = 14
LOCAL_SURGE_THRESHOLD = 3
SLA_MONITOR_INTERVAL_SECONDS = 60
sla_monitor_thread: Optional[threading.Thread] = None


app = FastAPI(
    title="Delhi Accountability Monitoring System API",
    version="1.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",
        "http://localhost:5173",
        "http://localhost:5174",
        "http://127.0.0.1:3000",
        "http://127.0.0.1:5173",
        "http://127.0.0.1:5174",
    ],
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=[
        "Accept",
        "Authorization",
        "Content-Type",
        "Origin",
        "X-Requested-With",
    ],
)


class OTPLoginRequest(BaseModel):
    phone: str = Field(..., min_length=10, max_length=15)
    otp: str = Field(..., min_length=4, max_length=6)


class StaffLoginRequest(BaseModel):
    email: EmailStr
    password: str


class GrievanceDetailResponse(BaseModel):
    id: int
    ticket_id: str
    title: str
    description: str
    status: str
    priority: str
    latitude: float
    longitude: float
    sla_due_date: datetime
    created_at: datetime
    resolved_at: Optional[datetime] = None
    resolution_notes: Optional[str] = None
    resolution_photo_url: Optional[str] = None
    district_name: str
    ward_name: str
    department_name: str

    class Config:
        from_attributes = True


class OfficerQueueResponse(BaseModel):
    ticket_id: str
    title: str
    priority: str
    sla_due_date: datetime
    status: str

    class Config:
        from_attributes = True


class GrievanceIntakeRequest(BaseModel):
    citizen_id: int = Field(..., gt=0)
    subcategory_id: int = Field(..., gt=0)
    latitude: float = Field(..., ge=-90, le=90)
    longitude: float = Field(..., ge=-180, le=180)
    district_id: int = Field(..., gt=0)
    ward_id: int = Field(..., gt=0)
    title: str = Field(..., min_length=1, max_length=150)
    description: str = Field(..., min_length=1)
    intake_photo_url: Optional[str] = Field(default="", max_length=255)


class GrievanceIntakeResponse(BaseModel):
    ticket_id: str
    status: str
    priority: str
    assigned_officer_id: int
    sla_due_date: datetime
    duplicate_detected: bool
    nearby_duplicate_count: int
    is_flagged_to_cmo: bool


class GrievanceResolveRequest(BaseModel):
    officer_id: int = Field(..., gt=0)
    resolution_notes: str
    resolution_photo_url: str = Field(..., max_length=255)


class GrievanceResolveResponse(BaseModel):
    ticket_id: str
    previous_status: str
    new_status: str
    resolved_at: datetime
    log_id: int


class GrievanceReopenRequest(BaseModel):
    remarks: str


class GrievanceReopenResponse(BaseModel):
    ticket_id: str
    previous_status: str
    new_status: str
    reopened_count: int
    is_escalated_to_supervisor: bool
    sla_due_date: datetime
    log_id: int


def utc_now() -> datetime:
    return datetime.now(timezone.utc).replace(tzinfo=None)


def run_sla_compliance_monitor() -> None:
    """Background daemon loop checking immediate SLA compliance milestones."""
    while True:
        from database import SessionLocal

        worker_db = SessionLocal()
        try:
            now = utc_now()
            breached_tickets = (
                worker_db.query(Grievance)
                .filter(
                    Grievance.status.in_(ACTIVE_STATUSES),
                    Grievance.sla_due_date < now,
                    Grievance.is_escalated_to_dm.is_(False),
                )
                .all()
            )

            for ticket in breached_tickets:
                status_value = enum_value(ticket.status)
                ticket.is_escalated_to_dm = True
                ticket.priority = "Critical"

                escalation_message = (
                    "System Automation Hook: Active SLA countdown breached. "
                    "Ticket escalated to District Magistrate."
                )
                escalation_log = GrievanceLog(
                    grievance_id=ticket.id,
                    previous_status=status_value,
                    new_status=status_value,
                    remarks=escalation_message,
                    action_by_officer_id=ticket.assigned_officer_id,
                )
                notification = Notification(
                    grievance_id=ticket.id,
                    recipient_type="District Magistrate",
                    channel="Email",
                    message=(
                        f"SLA breach alert for ticket {ticket.ticket_id}. "
                        "Escalated to District Magistrate review."
                    ),
                )
                worker_db.add(escalation_log)
                worker_db.add(notification)

            worker_db.commit()
        except Exception as monitor_err:
            print(
                "Background monitoring worker error encountered: "
                f"{monitor_err}"
            )
            worker_db.rollback()
        finally:
            worker_db.close()

        time.sleep(SLA_MONITOR_INTERVAL_SECONDS)


@app.on_event("startup")
def start_sla_compliance_monitor() -> None:
    """Starts the lightweight SLA monitor once per FastAPI process."""
    global sla_monitor_thread

    if sla_monitor_thread and sla_monitor_thread.is_alive():
        return

    sla_monitor_thread = threading.Thread(
        target=run_sla_compliance_monitor,
        daemon=True,
    )
    sla_monitor_thread.start()


def require_non_empty(value: Optional[str], field_name: str) -> str:
    if value is None or not value.strip():
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"{field_name} must not be empty.",
        )
    return value.strip()


def enum_value(value: Any) -> str:
    return value.value if hasattr(value, "value") else str(value)


def elevate_priority(priority: str) -> str:
    current_index = PRIORITY_ORDER.index(priority)
    next_index = min(current_index + 1, len(PRIORITY_ORDER) - 1)
    return PRIORITY_ORDER[next_index]


def haversine_meters(
    lat_a: float,
    lon_a: float,
    lat_b: float,
    lon_b: float,
) -> float:
    earth_radius_meters = 6_371_000
    lat_a_rad = math.radians(lat_a)
    lat_b_rad = math.radians(lat_b)
    delta_lat = math.radians(lat_b - lat_a)
    delta_lon = math.radians(lon_b - lon_a)

    arc = (
        math.sin(delta_lat / 2) ** 2
        + math.cos(lat_a_rad)
        * math.cos(lat_b_rad)
        * math.sin(delta_lon / 2) ** 2
    )
    return earth_radius_meters * 2 * math.atan2(math.sqrt(arc), math.sqrt(1 - arc))


def bounding_box(
    latitude: float,
    longitude: float,
    radius_meters: int,
) -> Dict[str, float]:
    latitude_delta = radius_meters / 111_320
    longitude_scale = math.cos(math.radians(latitude))
    longitude_delta = (
        radius_meters / (111_320 * longitude_scale)
        if abs(longitude_scale) > 0.000001
        else 180
    )

    return {
        "min_latitude": latitude - latitude_delta,
        "max_latitude": latitude + latitude_delta,
        "min_longitude": longitude - longitude_delta,
        "max_longitude": longitude + longitude_delta,
    }


def nearby_active_duplicate_count(
    db: Session,
    subcategory_id: int,
    latitude: float,
    longitude: float,
    now: datetime,
) -> int:
    bounds = bounding_box(latitude, longitude, DEDUP_RADIUS_METERS)
    cutoff = now - timedelta(days=DEDUP_WINDOW_DAYS)

    candidates = (
        db.query(Grievance)
        .filter(
            Grievance.subcategory_id == subcategory_id,
            Grievance.status.in_(ACTIVE_STATUSES),
            Grievance.created_at >= cutoff,
            Grievance.latitude.between(
                bounds["min_latitude"],
                bounds["max_latitude"],
            ),
            Grievance.longitude.between(
                bounds["min_longitude"],
                bounds["max_longitude"],
            ),
        )
        .all()
    )

    return sum(
        1
        for grievance in candidates
        if haversine_meters(
            latitude,
            longitude,
            float(grievance.latitude),
            float(grievance.longitude),
        )
        <= DEDUP_RADIUS_METERS
    )


def generate_ticket_id(department_code: str, now: datetime) -> str:
    safe_code = re.sub(r"[^A-Z0-9]", "", department_code.upper())[:5]
    code = safe_code or "GEN"
    return f"DL-{now:%Y}-{code}-{now:%m%d%H%M%S%f}"


def ensure_unique_ticket_id(
    db: Session,
    department_code: str,
) -> tuple[str, datetime]:
    for _ in range(5):
        now = utc_now()
        ticket_id = generate_ticket_id(department_code, now)
        exists = (
            db.query(Grievance.id)
            .filter(Grievance.ticket_id == ticket_id)
            .first()
        )
        if not exists:
            return ticket_id, now

    raise HTTPException(
        status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
        detail="Unable to generate a unique grievance ticket id.",
    )


# =====================================================================
# PHASE 1: AUTHENTICATION ROUTERS (MOCKED FLOWS MATCHING APP.JSX)
# =====================================================================


@app.post("/api/v1/auth/otp", status_code=status.HTTP_200_OK)
def citizen_otp_login(
    payload: OTPLoginRequest,
    db: Session = Depends(get_db),
) -> Dict[str, Any]:
    """Validates citizen OTP logins with the evaluator bypass OTP."""
    if payload.otp != "1234":
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid security credentials / incorrect OTP token entered.",
        )

    citizen = db.query(Citizen).filter(Citizen.phone == payload.phone).first()
    if citizen is None:
        citizen = Citizen(
            name="Evaluator Account",
            phone=payload.phone,
            otp_hash="mocked_otp_bypass_hash",
        )
        try:
            db.add(citizen)
            db.commit()
            db.refresh(citizen)
        except SQLAlchemyError as exc:
            db.rollback()
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Failed to create evaluator citizen account.",
            ) from exc

    return {
        "success": True,
        "user_id": citizen.id,
        "role": "Citizen",
        "token": "mocked_jwt_token_hash",
    }


@app.post("/api/v1/auth/login", status_code=status.HTTP_200_OK)
def staff_and_executive_login(
    payload: StaffLoginRequest,
    db: Session = Depends(get_db),
) -> Dict[str, Any]:
    """Authenticates staff users via explicit officer email lookups."""
    officer = db.query(Officer).filter(Officer.email == payload.email).first()
    if officer is None or payload.password != "password":
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid administrative username or password configuration.",
        )

    return {
        "success": True,
        "user_id": officer.id,
        "role": enum_value(officer.role),
        "department_id": officer.department_id,
        "token": "mocked_staff_jwt_token_hash",
    }


# =====================================================================
# PHASE 1: OPERATIONAL & QUEUE DATA RETRIEVAL ROUTERS
# =====================================================================


@app.get(
    "/api/v1/grievances/{ticket_id}",
    response_model=GrievanceDetailResponse,
)
def get_grievance_by_id(
    ticket_id: str,
    db: Session = Depends(get_db),
) -> GrievanceDetailResponse:
    """Fetches full transaction metadata for targeted grievance tracking."""
    record = (
        db.query(Grievance)
        .filter(Grievance.ticket_id == ticket_id)
        .first()
    )
    if record is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Requested grievance ticket does not exist.",
        )

    district_name = (
        db.query(District.name)
        .filter(District.id == record.district_id)
        .scalar()
        or "Unknown"
    )
    ward_name = (
        db.query(Ward.name)
        .filter(Ward.id == record.ward_id)
        .scalar()
        or "Unknown"
    )
    department_name = (
        db.query(Department.name)
        .filter(Department.id == record.department_id)
        .scalar()
        or "Unknown"
    )

    return GrievanceDetailResponse(
        id=record.id,
        ticket_id=record.ticket_id,
        title=record.title,
        description=record.description,
        status=enum_value(record.status),
        priority=enum_value(record.priority),
        latitude=float(record.latitude),
        longitude=float(record.longitude),
        sla_due_date=record.sla_due_date,
        created_at=record.created_at,
        resolved_at=record.resolved_at,
        resolution_notes=record.resolution_notes,
        resolution_photo_url=record.resolution_photo_url,
        district_name=district_name,
        ward_name=ward_name,
        department_name=department_name,
    )


@app.get(
    "/api/v1/officer/{officer_id}/queue",
    response_model=List[OfficerQueueResponse],
)
def get_officer_work_queue(
    officer_id: int,
    db: Session = Depends(get_db),
) -> List[OfficerQueueResponse]:
    """Returns active unresolved tasks assigned to a ground officer."""
    tickets = (
        db.query(Grievance)
        .filter(
            Grievance.assigned_officer_id == officer_id,
            Grievance.status.in_(ACTIVE_STATUSES),
        )
        .order_by(Grievance.sla_due_date.asc())
        .all()
    )

    return [
        OfficerQueueResponse(
            ticket_id=ticket.ticket_id,
            title=ticket.title,
            priority=enum_value(ticket.priority),
            sla_due_date=ticket.sla_due_date,
            status=enum_value(ticket.status),
        )
        for ticket in tickets
    ]


@app.post(
    "/api/v1/grievances/intake",
    response_model=GrievanceIntakeResponse,
    status_code=status.HTTP_201_CREATED,
)
def intake_grievance(
    payload: GrievanceIntakeRequest,
    db: Session = Depends(get_db),
) -> GrievanceIntakeResponse:
    title = require_non_empty(payload.title, "title")
    description = require_non_empty(payload.description, "description")

    subcategory = (
        db.query(Subcategory)
        .filter(Subcategory.id == payload.subcategory_id)
        .first()
    )
    if subcategory is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Subcategory not found.",
        )

    department = (
        db.query(Department)
        .filter(Department.id == subcategory.department_id)
        .first()
    )
    if department is None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Subcategory is not linked to a valid department.",
        )

    citizen_exists = (
        db.query(Citizen.id)
        .filter(Citizen.id == payload.citizen_id)
        .first()
    )
    if citizen_exists is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Citizen not found.",
        )

    ward = (
        db.query(Ward)
        .filter(
            Ward.id == payload.ward_id,
            Ward.district_id == payload.district_id,
        )
        .first()
    )
    if ward is None:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Ward does not belong to the supplied district.",
        )

    officer = (
        db.query(Officer)
        .filter(
            Officer.department_id == subcategory.department_id,
            Officer.ward_id == payload.ward_id,
            Officer.role == "Officer",
            Officer.is_active.is_(True),
        )
        .order_by(Officer.id.asc())
        .first()
    )
    if officer is None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="No active ward officer is available for this department.",
        )

    ticket_id, now = ensure_unique_ticket_id(db, department.code)
    duplicate_count = nearby_active_duplicate_count(
        db=db,
        subcategory_id=payload.subcategory_id,
        latitude=payload.latitude,
        longitude=payload.longitude,
        now=now,
    )

    priority = enum_value(subcategory.base_priority)
    if duplicate_count:
        priority = elevate_priority(priority)

    is_flagged_to_cmo = duplicate_count >= LOCAL_SURGE_THRESHOLD
    if is_flagged_to_cmo:
        priority = elevate_priority(priority)

    grievance = Grievance(
        ticket_id=ticket_id,
        citizen_id=payload.citizen_id,
        category_id=subcategory.category_id,
        subcategory_id=subcategory.id,
        department_id=subcategory.department_id,
        assigned_officer_id=officer.id,
        latitude=payload.latitude,
        longitude=payload.longitude,
        district_id=payload.district_id,
        ward_id=payload.ward_id,
        title=title,
        description=description,
        intake_photo_url=(payload.intake_photo_url or "").strip(),
        status="Pending",
        priority=priority,
        is_flagged_to_cmo=is_flagged_to_cmo,
        sla_due_date=now + timedelta(days=subcategory.sla_days or 3),
    )

    try:
        db.add(grievance)
        db.commit()
        db.refresh(grievance)
    except SQLAlchemyError as exc:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to create grievance ticket.",
        ) from exc

    return GrievanceIntakeResponse(
        ticket_id=grievance.ticket_id,
        status=enum_value(grievance.status),
        priority=enum_value(grievance.priority),
        assigned_officer_id=grievance.assigned_officer_id,
        sla_due_date=grievance.sla_due_date,
        duplicate_detected=duplicate_count > 0,
        nearby_duplicate_count=duplicate_count,
        is_flagged_to_cmo=grievance.is_flagged_to_cmo,
    )


@app.post(
    "/api/v1/grievances/{ticket_id}/resolve",
    response_model=GrievanceResolveResponse,
)
def resolve_grievance(
    ticket_id: str,
    payload: GrievanceResolveRequest,
    db: Session = Depends(get_db),
) -> GrievanceResolveResponse:
    resolution_notes = require_non_empty(
        payload.resolution_notes,
        "resolution_notes",
    )
    resolution_photo_url = require_non_empty(
        payload.resolution_photo_url,
        "resolution_photo_url",
    )

    grievance = (
        db.query(Grievance)
        .filter(Grievance.ticket_id == ticket_id)
        .with_for_update()
        .first()
    )
    if grievance is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Grievance ticket not found.",
        )

    previous_status = enum_value(grievance.status)
    if previous_status not in ACTIVE_STATUSES:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Ticket cannot be resolved from {previous_status} status.",
        )

    officer = (
        db.query(Officer)
        .filter(
            Officer.id == payload.officer_id,
            Officer.is_active.is_(True),
        )
        .first()
    )
    if officer is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Active officer not found.",
        )

    officer_role = enum_value(officer.role)
    elevated_roles = {"Supervisor", "District Magistrate", "CMO_Monitor"}
    if (
        officer.id != grievance.assigned_officer_id
        and officer_role not in elevated_roles
    ):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only the assigned officer or an elevated role can resolve.",
        )

    now = utc_now()
    grievance.status = "Resolved"
    grievance.resolved_at = now
    grievance.resolution_notes = resolution_notes
    grievance.resolution_photo_url = resolution_photo_url

    log = GrievanceLog(
        grievance_id=grievance.id,
        previous_status=previous_status,
        new_status="Resolved",
        remarks=resolution_notes,
        action_by_officer_id=payload.officer_id,
    )

    try:
        db.add(log)
        db.commit()
        db.refresh(log)
        db.refresh(grievance)
    except SQLAlchemyError as exc:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to resolve grievance ticket.",
        ) from exc

    return GrievanceResolveResponse(
        ticket_id=grievance.ticket_id,
        previous_status=previous_status,
        new_status=enum_value(grievance.status),
        resolved_at=grievance.resolved_at,
        log_id=log.id,
    )


@app.post(
    "/api/v1/grievances/{ticket_id}/reopen",
    response_model=GrievanceReopenResponse,
)
def reopen_grievance(
    ticket_id: str,
    payload: GrievanceReopenRequest,
    db: Session = Depends(get_db),
) -> GrievanceReopenResponse:
    remarks = require_non_empty(payload.remarks, "remarks")

    grievance = (
        db.query(Grievance)
        .filter(Grievance.ticket_id == ticket_id)
        .with_for_update()
        .first()
    )
    if grievance is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Grievance ticket not found.",
        )

    previous_status = enum_value(grievance.status)
    if previous_status != "Resolved":
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Only resolved tickets can be reopened.",
        )

    now = utc_now()
    grievance.status = "Reopened"
    grievance.reopened_count = (grievance.reopened_count or 0) + 1
    grievance.is_escalated_to_supervisor = True
    grievance.sla_due_date = now + timedelta(hours=48)

    log = GrievanceLog(
        grievance_id=grievance.id,
        previous_status=previous_status,
        new_status="Reopened",
        remarks=remarks,
        action_by_officer_id=grievance.assigned_officer_id,
    )

    try:
        db.add(log)
        db.commit()
        db.refresh(log)
        db.refresh(grievance)
    except SQLAlchemyError as exc:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to reopen grievance ticket.",
        ) from exc

    return GrievanceReopenResponse(
        ticket_id=grievance.ticket_id,
        previous_status=previous_status,
        new_status=enum_value(grievance.status),
        reopened_count=grievance.reopened_count,
        is_escalated_to_supervisor=grievance.is_escalated_to_supervisor,
        sla_due_date=grievance.sla_due_date,
        log_id=log.id,
    )


@app.get("/api/v1/admin/executive-alerts")
def executive_alerts(db: Session = Depends(get_db)) -> Dict[str, Any]:
    metric_row = db.query(
        func.count(Grievance.id).label("total_complaints"),
        func.count(Grievance.id)
        .filter(Grievance.status == "Pending")
        .label("pending_count"),
        func.count(Grievance.id)
        .filter(Grievance.status == "In Progress")
        .label("in_progress_count"),
        func.count(Grievance.id)
        .filter(Grievance.status == "Resolved")
        .label("resolved_count"),
        func.count(Grievance.id)
        .filter(Grievance.status == "Reopened")
        .label("reopened_count"),
    ).one()

    alerts: List[str] = []
    alert_details: List[Dict[str, Any]] = []
    seven_days_ago = utc_now() - timedelta(days=7)

    cluster_rows = (
        db.query(
            Grievance.ward_id,
            Ward.name.label("ward_name"),
            Grievance.subcategory_id,
            Subcategory.name.label("subcategory_name"),
            func.count(Grievance.id).label("active_count"),
        )
        .join(Ward, Ward.id == Grievance.ward_id)
        .join(Subcategory, Subcategory.id == Grievance.subcategory_id)
        .filter(
            Grievance.status.in_(ACTIVE_STATUSES),
            Grievance.created_at >= seven_days_ago,
        )
        .group_by(
            Grievance.ward_id,
            Ward.name,
            Grievance.subcategory_id,
            Subcategory.name,
        )
        .having(func.count(Grievance.id) >= 50)
        .all()
    )

    for row in cluster_rows:
        message = (
            "Geographic cluster surge: "
            f"{row.active_count} active {row.subcategory_name} complaints "
            f"were filed in ward {row.ward_name} over the last 7 days."
        )
        alerts.append(message)
        alert_details.append(
            {
                "type": "geographic_cluster_surge",
                "severity": "high",
                "message": message,
                "ward_id": row.ward_id,
                "ward_name": row.ward_name,
                "subcategory_id": row.subcategory_id,
                "subcategory_name": row.subcategory_name,
                "active_count": row.active_count,
            }
        )

    department_rows = (
        db.query(
            Department.id.label("department_id"),
            Department.name.label("department_name"),
            Department.code.label("department_code"),
            func.count(Grievance.id).label("active_count"),
            func.count(Grievance.id)
            .filter(Grievance.sla_due_date < func.now())
            .label("overdue_count"),
        )
        .join(Grievance, Grievance.department_id == Department.id)
        .filter(Grievance.status.in_(ACTIVE_STATUSES))
        .group_by(Department.id, Department.name, Department.code)
        .having(func.count(Grievance.id) > 0)
        .all()
    )

    for row in department_rows:
        active_count = int(row.active_count or 0)
        overdue_count = int(row.overdue_count or 0)
        compliant_count = active_count - overdue_count
        compliance_rate = (
            compliant_count / active_count
            if active_count
            else 1
        )

        if compliance_rate < 0.60:
            message = (
                "Administrative SLA breach: "
                f"{row.department_name} compliance is "
                f"{compliance_rate:.0%} with {overdue_count} overdue "
                f"active tickets."
            )
            alerts.append(message)
            alert_details.append(
                {
                    "type": "administrative_sla_breach",
                    "severity": "critical",
                    "message": message,
                    "department_id": row.department_id,
                    "department_name": row.department_name,
                    "department_code": row.department_code,
                    "active_count": active_count,
                    "overdue_count": overdue_count,
                    "compliance_rate": round(compliance_rate, 4),
                }
            )

    return {
        "generated_at": utc_now(),
        "metrics": {
            "total_complaints": metric_row.total_complaints,
            "pending_count": metric_row.pending_count,
            "in_progress_count": metric_row.in_progress_count,
            "resolved_count": metric_row.resolved_count,
            "reopened_count": metric_row.reopened_count,
        },
        "alerts": alerts,
        "alert_details": alert_details,
    }
