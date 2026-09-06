from fastapi import APIRouter, Depends, Request

from app.api.dependencies import Role, require_roles
from app.api.v1.auth import envelope
from app.models.entities import AppUser
from app.schemas.ai import NoticeDraftRequest, RepairDraftRequest
from app.services.ai_service import AIService


router = APIRouter(prefix="/api/v1/ai", tags=["ai"])


async def get_ai_service(request: Request) -> AIService:
    if not hasattr(request.app.state, "ai_service"):
        request.app.state.ai_service = AIService(request.app.state.settings)
    return request.app.state.ai_service


@router.post("/repair-draft")
async def repair_draft(
    body: RepairDraftRequest,
    request: Request,
    user: AppUser = Depends(require_roles(Role.OWNER)),
    service: AIService = Depends(get_ai_service),
):
    draft = await service.repair_draft(body, user.id)
    return envelope(request, draft.model_dump())


@router.post("/notice-draft")
async def notice_draft(
    body: NoticeDraftRequest,
    request: Request,
    user: AppUser = Depends(require_roles(Role.PROPERTY)),
    service: AIService = Depends(get_ai_service),
):
    draft = await service.notice_draft(body, user.id)
    return envelope(request, draft.model_dump())
