from typing import Literal

from app.schemas.common import ApiModel


class BillListQuery(ApiModel):
    status: Literal["UNPAID", "PAID"] | None = None
