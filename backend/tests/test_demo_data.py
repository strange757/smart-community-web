from datetime import UTC, datetime, time, timedelta, timezone
from decimal import Decimal
from importlib import import_module, util

import pytest
from sqlalchemy import event, func, select, text

from app.models.entities import (
    AppUser, Bill, Community, House, Notice, ParkingReservation, ParkingSpace,
    PaymentRecord, RepairEvent, RepairOrder, ResidentHouse,
)
from app.services.billing_service import list_bills
from app.services.parking_service import list_mine
from app.services.repair_service import ALLOWED, list_repairs


MODELS = (AppUser, House, ResidentHouse, Notice, RepairOrder, RepairEvent,
          Bill, PaymentRecord, ParkingSpace, ParkingReservation)


def populate(session, community_id=1):
    assert util.find_spec("app.db.demo_data") is not None, "Demo data generator is not implemented"
    return import_module("app.db.demo_data").populate_demo_data(session, community_id)


def counts(session, community_id=1):
    return {model.__tablename__: session.scalar(
        select(func.count()).select_from(model).where(model.community_id == community_id)
    ) for model in MODELS}


def snapshot(session, community_id=1):
    return {model.__tablename__: [
        tuple(getattr(row, column.name) for column in model.__table__.columns)
        for row in session.scalars(select(model).where(model.community_id == community_id).order_by(model.id))
    ] for model in MODELS}


def test_demo_data_reaches_community_scale_and_is_visible_to_default_accounts(client):
    with client.app.state.session_factory() as session:
        result = populate(session)
        totals = counts(session)
        assert totals["house"] >= 192
        assert session.scalar(select(func.count(func.distinct(House.building))).where(House.community_id == 1)) == 8
        assert session.scalar(select(func.count()).select_from(AppUser).where(AppUser.role == "OWNER")) >= 150
        assert session.scalar(select(func.count()).select_from(AppUser).where(AppUser.role == "MAINTENANCE")) >= 12
        assert totals["parking_space"] >= 96
        assert totals["repair_order"] >= 200
        assert totals["bill"] >= 1150
        assert totals["parking_reservation"] >= 80
        assert totals["notice"] >= 24
        owner = session.get(AppUser, 1)
        owner_bills = list_bills(session, owner)
        owner_repairs = list_repairs(session, owner)
        owner_bookings = list_mine(session, owner)
        assert len(owner_bills) >= 18
        assert len(owner_repairs) >= 14
        assert len(owner_bookings) >= 8
        assert session.scalar(select(func.count()).select_from(ResidentHouse).where(ResidentHouse.user_id == 1)) >= 3
        assert {bill["status"] for bill in owner_bills} == {"PAID", "UNPAID"}
        assert len({bill["type"] for bill in owner_bills}) >= 6
        assert {repair["status"] for repair in owner_repairs} == set(ALLOWED)
        assert {booking["status"] for booking in owner_bookings} == {"PENDING", "ACTIVE", "REJECTED", "CANCELLED"}
        maintenance_repairs = list_repairs(session, session.get(AppUser, 3))
        assert {repair["status"] for repair in maintenance_repairs} >= {"ASSIGNED", "IN_PROGRESS", "COMPLETED", "CONFIRMED", "RATED", "CANCELLED"}
        assert result["already_populated"] is False
        assert result["totals"] == totals
        assert result["owner_visible"]["bills"] == len(owner_bills)


def test_repeat_population_preserves_original_and_user_edited_records(client):
    with client.app.state.session_factory() as session:
        baseline = snapshot(session)
        populate(session)
        for model in MODELS:
            for row in baseline[model.__tablename__]:
                assert tuple(getattr(session.get(model, row[0]), c.name) for c in model.__table__.columns) == row
        bill = session.scalar(select(Bill).where(Bill.id > 2, Bill.status == "UNPAID"))
        bill.status = "PAID"
        bill.paid_at = datetime.now(UTC)
        reservation = session.scalar(select(ParkingReservation).where(ParkingReservation.status == "PENDING"))
        reservation.status = "CANCELLED"
        repair = session.scalar(select(RepairOrder).where(RepairOrder.id > 1))
        repair.description = "Resident edited description"
        notice = session.scalar(select(Notice).where(Notice.id > 3))
        notice.title = "Property edited title"
        session.commit()
        before_repeat = snapshot(session)
        result = populate(session)
        assert result["already_populated"] is True
        assert all(value == 0 for value in result["added"].values())
        assert snapshot(session) == before_repeat


def test_population_stays_in_requested_community(client):
    with client.app.state.session_factory() as session:
        session.add(Community(id=2, name="Synthetic second community", address="Demo only"))
        session.flush()
        session.add_all([
            AppUser(community_id=2, username="other_owner", password_hash="unused", display_name="Synthetic owner", role="OWNER"),
            AppUser(community_id=2, username="other_property", password_hash="unused", display_name="Synthetic property", role="PROPERTY"),
        ])
        session.commit()
        baseline = snapshot(session, 1)
        result = populate(session, 2)
        assert result["community_id"] == 2
        assert snapshot(session, 1) == baseline
        assert counts(session, 2)["house"] >= 192
        assert session.execute(text("PRAGMA foreign_key_check")).all() == []
        for model, field in [(ResidentHouse, "user_id"), (RepairOrder, "creator_id"), (ParkingReservation, "user_id"), (PaymentRecord, "payer_id")]:
            for row in session.scalars(select(model).where(model.community_id == 2)):
                assert session.get(AppUser, getattr(row, field)).community_id == 2


def test_generated_payments_and_repair_events_match_business_history(client):
    with client.app.state.session_factory() as session:
        populate(session)
        for bill in session.scalars(select(Bill).where(Bill.id > 2)):
            payment = session.scalar(select(PaymentRecord).where(PaymentRecord.bill_id == bill.id))
            if bill.status == "PAID":
                assert payment is not None
                assert payment.amount == bill.amount > Decimal("0")
                assert payment.paid_at == bill.paid_at
                assert bill.created_at <= payment.paid_at <= datetime.now(UTC).replace(tzinfo=None)
                assert session.scalar(select(ResidentHouse.id).where(
                    ResidentHouse.user_id == payment.payer_id, ResidentHouse.house_id == bill.house_id,
                    ResidentHouse.community_id == bill.community_id,
                )) is not None
            else:
                assert payment is None
        for repair in session.scalars(select(RepairOrder).where(RepairOrder.id > 1)):
            events = session.scalars(select(RepairEvent).where(RepairEvent.repair_id == repair.id).order_by(RepairEvent.created_at, RepairEvent.id)).all()
            assert events[0].from_status is None and events[0].to_status == "SUBMITTED"
            assert events[0].actor_id == repair.creator_id
            for previous, current in zip(events, events[1:]):
                assert current.from_status == previous.to_status
                assert current.to_status in ALLOWED[previous.to_status]
                assert current.created_at >= previous.created_at
                actor = session.get(AppUser, current.actor_id)
                expected_role = {"ASSIGN": "PROPERTY", "START": "MAINTENANCE", "COMPLETE": "MAINTENANCE", "CONFIRM": "OWNER", "RATE": "OWNER", "CANCEL": "OWNER"}[current.action]
                assert actor.role == expected_role
            assert events[-1].to_status == repair.status
            assert events[-1].created_at == repair.updated_at
            assert (repair.rating is not None) == (repair.status == "RATED")


def test_generated_parking_avoids_existing_conflicts_and_has_future_variety(client):
    shanghai = timezone(timedelta(hours=8))
    today = datetime.now(shanghai).date()
    with client.app.state.session_factory() as session:
        existing = ParkingReservation(community_id=1, user_id=1, parking_space_id=1,
            booking_date=today + timedelta(days=1), start_time=time(0), end_time=time(23, 59), status="ACTIVE")
        session.add(existing)
        session.commit()
        populate(session)
        reservations = session.scalars(select(ParkingReservation)).all()
        blocking = [item for item in reservations if item.status in {"PENDING", "ACTIVE"}]
        for index, left in enumerate(blocking):
            for right in blocking[index + 1:]:
                assert not (left.parking_space_id == right.parking_space_id and left.booking_date == right.booking_date
                            and left.start_time < right.end_time and left.end_time > right.start_time)
        generated = [item for item in reservations if item.id != existing.id]
        assert all(item.booking_date > today for item in generated)
        assert len({item.booking_date for item in generated}) >= 7
        assert len({(item.start_time, item.end_time) for item in generated}) >= 3
        assert session.get(ParkingSpace, 1).enabled is True
        assert session.scalar(select(func.count()).select_from(ParkingSpace).where(ParkingSpace.enabled.is_(False))) > 0
        for item in generated:
            if item.status in {"ACTIVE", "REJECTED"}:
                assert item.reviewed_by is not None and item.reviewed_at is not None
                assert session.get(AppUser, item.reviewed_by).role == "PROPERTY"
            if item.status in {"ACTIVE", "PENDING"}:
                assert session.get(ParkingSpace, item.parking_space_id).enabled


def test_population_rejects_unknown_community_without_creating_business_rows(client):
    with client.app.state.session_factory() as session:
        baseline = snapshot(session)
        with pytest.raises(ValueError, match="community"):
            populate(session, 999)
        assert snapshot(session) == baseline


def test_demo_batch_marker_is_part_of_the_managed_schema():
    from app.db.base import Base

    assert "demo_data_batch" in Base.metadata.tables


def test_failed_batch_rolls_back_all_generated_rows(client):
    from app.models.entities import DemoDataBatch

    def reject_marker(_mapper, _connection, _target):
        raise ValueError("Simulated batch marker failure")

    with client.app.state.session_factory() as session:
        baseline = snapshot(session)
        event.listen(DemoDataBatch, "before_insert", reject_marker)
        try:
            with pytest.raises(ValueError, match="Simulated batch marker failure"):
                populate(session)
        finally:
            event.remove(DemoDataBatch, "before_insert", reject_marker)
        assert snapshot(session) == baseline
        assert session.scalar(select(func.count()).select_from(DemoDataBatch)) == 0
        assert populate(session)["already_populated"] is False


@pytest.mark.parametrize("expanded", [False, True])
def test_runner_only_expands_data_when_opted_in(tmp_path, monkeypatch, expanded):
    import run

    frontend_dist = tmp_path / "dist"
    frontend_dist.mkdir()
    (frontend_dist / "index.html").write_text("<!doctype html><title>Demo test</title>", encoding="utf-8")
    arguments = ["run.py", "--database", str(tmp_path / "runner.db")]
    if expanded:
        arguments.append("--demo-data")
    monkeypatch.setattr("sys.argv", arguments)
    monkeypatch.setattr(run, "FRONTEND_DIST", frontend_dist)
    observed = {}

    def inspect_app_without_starting_server(app, *, host, port):
        with app.state.session_factory() as session:
            observed.update(counts(session))

    monkeypatch.setattr(run.uvicorn, "run", inspect_app_without_starting_server)
    run.main()
    assert observed["house"] == (192 if expanded else 2)
    assert observed["parking_space"] == (96 if expanded else 4)
