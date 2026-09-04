from pydantic import Field

from app.schemas.common import ApiModel


class NoticeCreate(ApiModel):
    title: str = Field(min_length=2, max_length=160)
    content: str = Field(min_length=2, max_length=4000)
