from datetime import date, time
from typing import Annotated, Literal

from pydantic import StringConstraints, field_validator, model_validator

from app.schemas.common import ApiModel

ReservationStatus = Literal["PENDING", "ACTIVE", "REJECTED", "CANCELLED"]
ReviewNote = Annotated[str, StringConstraints(strip_whitespace=True, max_length=500)]


class ReservationCreate(ApiModel):
    parking_space_id: int
    date: date
    start: time
    end: time
    plate_number: Annotated[str, StringConstraints(max_length=20)] | None = None

    @field_validator("plate_number", mode="before")
    @classmethod
    def normalize_plate(cls, value):
        if isinstance(value, str):
            return value.strip().upper() or None
        return value

    @model_validator(mode="after")
    def validate_interval(self):
        if self.start.tzinfo is not None or self.end.tzinfo is not None:
            raise ValueError("请使用本地时间，不要附加时区")
        if self.end <= self.start:
            raise ValueError("结束时间必须晚于开始时间")
        return self


class ReservationApprove(ApiModel):
    note: ReviewNote | None = None


class ReservationReject(ApiModel):
    note: Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=500)]
