import logging
import sys
from datetime import datetime, timedelta
from decimal import Decimal
from typing import Iterable

from sqlalchemy import text
from sqlalchemy.exc import SQLAlchemyError

from database import SessionLocal, engine
from models import (
    Base,
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
)


logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s | %(levelname)s | %(message)s",
)
logger = logging.getLogger(__name__)


DELETE_SEQUENCE = (
    Notification,
    GrievanceLog,
    Grievance,
    Officer,
    Citizen,
    Subcategory,
    Category,
    Department,
    Ward,
    District,
)

SEQUENCE_TABLES = (
    "districts",
    "wards",
    "departments",
    "categories",
    "subcategories",
    "citizens",
    "officers",
    "grievances",
    "grievance_logs",
    "notifications",
)


def add_records(session, records: Iterable[object]) -> None:
    for record in records:
        session.add(record)


def reset_serial_sequence(session, table_name: str, column_name: str = "id") -> None:
    session.execute(
        text(
            """
            SELECT setval(
                pg_get_serial_sequence(:table_name, :column_name),
                COALESCE((SELECT MAX(id) FROM {table_name}), 1),
                (SELECT MAX(id) FROM {table_name}) IS NOT NULL
            )
            """.format(table_name=table_name)
        ),
        {"table_name": table_name, "column_name": column_name},
    )


def decimal_coord(value: float) -> Decimal:
    return Decimal(f"{value:.6f}")


def clear_database(session) -> None:
    logger.info("Clearing existing transaction and lookup data.")
    for model in DELETE_SEQUENCE:
        deleted_count = session.query(model).delete(synchronize_session=False)
        logger.info("Deleted %s row(s) from %s.", deleted_count, model.__tablename__)
    session.commit()
    logger.info("Database clear-out phase committed successfully.")


def seed_structural_data(session) -> None:
    logger.info("Seeding structural lookup taxonomies.")
    add_records(
        session,
        [
            District(id=1, name="New Delhi"),
            District(id=2, name="North Delhi"),
            District(id=3, name="South Delhi"),
        ],
    )
    session.flush()

    add_records(
        session,
        [
            Ward(id=1, district_id=2, name="Rohini Ward 11"),
            Ward(id=2, district_id=2, name="Rohini Ward 12"),
            Ward(id=3, district_id=3, name="Saket Ward 45"),
        ],
    )
    add_records(
        session,
        [
            Department(id=1, name="Public Works Department", code="PWD"),
            Department(id=2, name="Delhi Jal Board", code="DJB"),
        ],
    )
    add_records(
        session,
        [
            Category(id=1, name="Civic Infrastructure"),
            Category(id=2, name="Water Supply & Sewage"),
        ],
    )
    session.flush()

    add_records(
        session,
        [
            Subcategory(
                id=1,
                category_id=1,
                department_id=1,
                name="Major Pothole / Road Collapse",
                sla_days=7,
                base_priority="High",
            ),
            Subcategory(
                id=2,
                category_id=2,
                department_id=2,
                name="Water Contamination / Supply Outage",
                sla_days=2,
                base_priority="Critical",
            ),
            Subcategory(
                id=3,
                category_id=1,
                department_id=1,
                name="Streetlight Malfunction",
                sla_days=3,
                base_priority="Medium",
            ),
        ],
    )
    logger.info("Structural lookup seed staged.")


def seed_simulator_personas(session) -> None:
    logger.info("Seeding simulator citizen and officer personas.")
    add_records(
        session,
        [
            Citizen(
                id=1,
                name="Pransh Sharma",
                phone="9999999999",
                otp_hash="demo_hash",
            ),
            Officer(
                id=1,
                name="Officer Rajesh Kumar",
                department_id=1,
                ward_id=1,
                role="Officer",
                email="rajesh.kumar@gov.delhi.example",
                password_hash="demo_password_hash",
                is_active=True,
            ),
            Officer(
                id=2,
                name="Officer Amit Mishra",
                department_id=2,
                ward_id=1,
                role="Officer",
                email="amit.mishra@gov.delhi.example",
                password_hash="demo_password_hash",
                is_active=True,
            ),
        ],
    )
    logger.info("Simulator personas staged.")


def build_pwd_sla_breach_rows(now: datetime) -> list[Grievance]:
    past_date = now - timedelta(days=10)
    sla_due_date = past_date + timedelta(days=3)
    rows = []

    for index in range(1, 16):
        rows.append(
            Grievance(
                id=index,
                ticket_id=f"DL-2026-PWD-SLA-{index:03d}",
                citizen_id=1,
                category_id=1,
                subcategory_id=3,
                department_id=1,
                assigned_officer_id=1,
                latitude=decimal_coord(28.6139 + (index * 0.00001)),
                longitude=decimal_coord(77.2090 + (index * 0.00001)),
                district_id=2,
                ward_id=1,
                title=f"Delayed streetlight repair cluster #{index:02d}",
                description=(
                    "Historical PWD grievance seeded to demonstrate active "
                    "departmental SLA breach pressure."
                ),
                intake_photo_url=(
                    "https://example.com/evidence/pwd-sla-breach.jpg"
                ),
                status="In Progress",
                priority="Critical",
                is_escalated_to_supervisor=True,
                is_escalated_to_dm=False,
                is_flagged_to_cmo=True,
                reopened_count=0,
                sla_due_date=sla_due_date,
                created_at=past_date,
                updated_at=past_date,
            )
        )

    return rows


def build_djb_cluster_surge_rows(now: datetime) -> list[Grievance]:
    created_at = now - timedelta(hours=4)
    sla_due_date = created_at + timedelta(days=2)
    rows = []

    for offset in range(55):
        index = offset + 1
        rows.append(
            Grievance(
                id=15 + index,
                ticket_id=f"DL-2026-DJB-WTR-{index:03d}",
                citizen_id=1,
                category_id=2,
                subcategory_id=2,
                department_id=2,
                assigned_officer_id=2,
                latitude=decimal_coord(28.6150 + (offset * 0.0001)),
                longitude=decimal_coord(77.2060 + (offset * 0.0001)),
                district_id=2,
                ward_id=1,
                title=f"Localized water quality emergency #{index:02d}",
                description=(
                    "Recent overlapping DJB grievance seeded to demonstrate "
                    "a geographic ward cluster surge in Rohini Ward 11."
                ),
                intake_photo_url=(
                    "https://example.com/evidence/djb-water-surge.jpg"
                ),
                status="Pending",
                priority="Critical",
                is_escalated_to_supervisor=False,
                is_escalated_to_dm=False,
                is_flagged_to_cmo=True,
                reopened_count=0,
                sla_due_date=sla_due_date,
                created_at=created_at,
                updated_at=created_at,
            )
        )

    return rows


def seed_anomaly_transactions(session) -> None:
    logger.info("Seeding high-density operational anomaly transactions.")
    now = datetime.utcnow().replace(microsecond=0)
    pwd_breach_rows = build_pwd_sla_breach_rows(now)
    djb_cluster_rows = build_djb_cluster_surge_rows(now)

    add_records(session, pwd_breach_rows)
    add_records(session, djb_cluster_rows)
    logger.info("Staged %s PWD SLA breach grievances.", len(pwd_breach_rows))
    logger.info("Staged %s DJB ward cluster grievances.", len(djb_cluster_rows))


def repair_sequences(session) -> None:
    logger.info("Resetting PostgreSQL serial sequences after explicit IDs.")
    for table_name in SEQUENCE_TABLES:
        reset_serial_sequence(session, table_name)


def seed_database() -> int:
    session = SessionLocal()
    try:
        logger.info("Ensuring database schema exists.")
        Base.metadata.create_all(bind=engine)

        clear_database(session)

        logger.info("Beginning fresh seed insert transaction.")
        seed_structural_data(session)
        seed_simulator_personas(session)
        session.flush()

        seed_anomaly_transactions(session)
        session.flush()

        repair_sequences(session)
        session.commit()

        logger.info("High-density database seed completed successfully.")
        logger.info("Inserted 15 PWD SLA breach anomaly grievances.")
        logger.info("Inserted 55 DJB geographic cluster surge grievances.")
        return 0

    except SQLAlchemyError:
        session.rollback()
        logger.exception(
            "Database seed failed. Transaction was rolled back cleanly."
        )
        return 1
    except Exception:
        session.rollback()
        logger.exception(
            "Unexpected seed failure. Transaction was rolled back cleanly."
        )
        return 1
    finally:
        session.close()


if __name__ == "__main__":
    sys.exit(seed_database())
