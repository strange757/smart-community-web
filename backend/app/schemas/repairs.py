from typing import Literal

from pydantic import Field

from app.schemas.common import ApiModel


class RepairCreate(ApiModel):
    house_id: int
    category: str = Field(min_length=2, max_length=80)
    description: str = Field(min_length=4, max_length=500)
    priority: Literal["NORMAL", "URGENT"] = "NORMAL"


class RepairAssign(ApiModel):
    assignee_id: int


class RepairComplete(ApiModel):
    note: str = Field(default="维修完成", max_length=500)


class RepairRate(ApiModel):
    rating: int = Field(ge=1, le=5)
    comment: str = Field(default="", max_length=200)
