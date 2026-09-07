from fastapi import APIRouter, Depends, Request
from sqlalchemy.orm import Session

from app.api.dependencies import Role, get_current_user, get_session, require_roles
from app.api.v1.auth import envelope
from app.models.entities import AppUser
from app.schemas.ai import AssistantRequest, NoticeDraftRequest, RepairDraftRequest
from app.services.ai_service import AIService, model_status
from app.services.assistant_context import DESTINATIONS, SOURCE_LABELS, build_assistant_context


router = APIRouter(prefix="/api/v1/ai", tags=["ai"])


async def get_ai_service(request: Request) -> AIService:
    if not hasattr(request.app.state, "ai_service"):
        request.app.state.ai_service = AIService(request.app.state.settings)
    return request.app.state.ai_service


@router.get("/status")
def status(request: Request, user: AppUser = Depends(get_current_user)):
    return envelope(request, model_status(request.app.state.settings))


@router.post("/assistant")
async def assistant(
    body: AssistantRequest,
    request: Request,
    user: AppUser = Depends(require_roles(Role.OWNER)),
    session: Session = Depends(get_session),
    service: AIService = Depends(get_ai_service),
):
    user_id = user.id
    context = build_assistant_context(session, user)
    session.close()
    draft = await service.answer_question(body, context, user_id)
    return envelope(request, {
        "answer": draft.answer,
        "links": [DESTINATIONS[key] for key in dict.fromkeys(draft.destinations)],
        "sources": [{"label": SOURCE_LABELS[key], "kind": key} for key in dict.fromkeys(draft.sources)],
        "model": service.settings.ai_model,
        "dataAsOf": context["asOf"],
    })


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
