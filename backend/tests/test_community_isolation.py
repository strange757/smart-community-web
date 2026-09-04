from decimal import Decimal

import pytest
from sqlalchemy.exc import IntegrityError

from app.models.entities import Community, House, ResidentHouse

from .conftest import login


def test_cross_community_house_link_is_rejected_before_it_can_expose_a_house(client):
    with client.app.state.session_factory() as session:
        session.add(Community(id=2, name="第二社区", address="测试路 2 号"))
        session.add(
            House(
                id=3,
                community_id=2,
                building="2号楼",
                unit_name="2单元",
                room_no="201",
                area=Decimal("88.00"),
            )
        )
        session.commit()
        session.add(ResidentHouse(community_id=1, user_id=1, house_id=3, relation_type="OWNER"))
        with pytest.raises(IntegrityError):
            session.commit()
        session.rollback()

    headers = login(client, "owner")
    houses = client.get("/api/v1/me/houses", headers=headers)
    repair = client.post(
        "/api/v1/repairs",
        headers=headers,
        json={
            "houseId": 3,
            "category": "公共设施",
            "description": "跨社区楼道灯不亮",
            "priority": "NORMAL",
        },
    )

    assert [house["id"] for house in houses.json()["data"]] == [1]
    assert repair.status_code == 403
    assert repair.json()["code"] == "FORBIDDEN"
