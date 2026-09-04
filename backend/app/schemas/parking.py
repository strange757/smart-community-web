from datetime import date, time

from pydantic import model_validator

from app.schemas.common import ApiModel


class ReservationCreate(ApiModel):
    parking_space_id: int
    date: date
    start: time
    end: time

    @model_validator(mode="after")
    def validate_interval(self):
        if self.end <= self.start:
            raise ValueError("结束时间必须晚于开始时间")
        return self
