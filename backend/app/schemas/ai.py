from typing import Annotated, Literal

from pydantic import BaseModel, ConfigDict, Field, StringConstraints


RepairDescription = Annotated[str, StringConstraints(strip_whitespace=True, min_length=4, max_length=500)]
NoticeContent = Annotated[str, StringConstraints(strip_whitespace=True, min_length=4, max_length=4000)]
MissingDetail = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=160)]


class AIModel(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True, str_strip_whitespace=True)


class RepairDraftRequest(AIModel):
    description: RepairDescription


class NoticeDraftRequest(AIModel):
    title: str = Field(default="", max_length=160)
    content: NoticeContent


class RepairDraft(AIModel):
    category: Literal["公共设施", "水电维修", "门窗维修", "其他问题"]
    description: RepairDescription
    priority: Literal["NORMAL", "URGENT"]
    missingInfo: list[MissingDetail] = Field(max_length=4)


class NoticeDraft(AIModel):
    title: str = Field(min_length=2, max_length=160)
    content: str = Field(min_length=2, max_length=4000)
    missingInfo: list[MissingDetail] = Field(max_length=4)


class AssistantMessage(AIModel):
    role: Literal["user", "assistant"]
    content: Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=8000)]


class AssistantRequest(AIModel):
    message: Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=2000)]
    history: list[AssistantMessage] = Field(default_factory=list, max_length=12)


AssistantDestination = Literal["repairs", "bills", "parking", "notices", "progress", "profile"]
AssistantSource = Literal["guide", "houses", "bills", "repairs", "parking", "notices"]


class AssistantDraft(AIModel):
    answer: Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=8000)]
    destinations: list[AssistantDestination] = Field(default_factory=list, max_length=4)
    sources: list[AssistantSource] = Field(default_factory=list, max_length=6)
