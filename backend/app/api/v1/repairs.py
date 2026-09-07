from fastapi import APIRouter, Depends, Request, status
from fastapi.responses import FileResponse
from pydantic import ValidationError
from python_multipart.exceptions import MultipartParseError
from sqlalchemy.orm import Session
from starlette.concurrency import run_in_threadpool
from starlette.datastructures import UploadFile
from starlette.formparsers import MultiPartException, MultiPartParser

from app.api.dependencies import Role, get_current_user, get_session, require_roles
from app.api.v1.auth import envelope
from app.core.errors import AppError
from app.models.entities import AppUser
from app.schemas.repairs import RepairAssign, RepairComplete, RepairCreate, RepairRate
from app.services.repair_image_service import MAX_IMAGES, MAX_REQUEST_BYTES, create_repair_with_images, get_repair_image
from app.services.repair_service import action_repair, assign_repair, create_repair, get_repair, list_repairs, repair_view

router = APIRouter(prefix="/api/v1/repairs", tags=["repairs"])


@router.get("")
def repairs(request: Request, status_filter: str | None = None, status: str | None = None, user: AppUser = Depends(get_current_user), session: Session = Depends(get_session)):
    return envelope(request, list_repairs(session, user, status or status_filter))


@router.post("", status_code=status.HTTP_201_CREATED)
def create(body: RepairCreate, request: Request, user: AppUser = Depends(require_roles(Role.OWNER)), session: Session = Depends(get_session)):
    return envelope(request, create_repair(session, user, body.house_id, body.category, body.description, body.priority))


class RequestTooLarge(MultiPartException):
    pass


class RepairMultipartParser(MultiPartParser):
    complete = False

    def on_end(self) -> None:
        self.complete = True
        super().on_end()

    async def parse(self):
        try:
            form = await super().parse()
            # python-multipart.finalize() does not reject an unfinished body.
            if not self.complete:
                raise MultiPartException("Incomplete upload")
            return form
        except BaseException:
            for temporary_file in self._files_to_close_on_error:
                temporary_file.close()
            raise


@router.post("/with-images", status_code=status.HTTP_201_CREATED)
async def create_with_images(request: Request, user: AppUser = Depends(require_roles(Role.OWNER)), session: Session = Depends(get_session)):
    if request.headers.get("content-type", "").split(";", 1)[0].strip().lower() != "multipart/form-data":
        raise AppError("VALIDATION_ERROR", 422, "请使用图片上传表单")
    try:
        content_length = int(request.headers.get("content-length", "0"))
    except ValueError as exc:
        raise AppError("VALIDATION_ERROR", 422, "请求长度不合法") from exc
    if content_length > MAX_REQUEST_BYTES:
        raise AppError("REPAIR_IMAGE_TOO_LARGE", 413, "图片上传请求不能超过 32 MB")

    async def limited_stream():
        received = 0
        async for chunk in request.stream():
            received += len(chunk)
            if received > MAX_REQUEST_BYTES:
                raise RequestTooLarge("Request body exceeds 32 MB")
            yield chunk

    parser = RepairMultipartParser(request.headers, limited_stream(), max_files=MAX_IMAGES, max_fields=1, max_part_size=64 * 1024)
    try:
        form = await parser.parse()
    except RequestTooLarge as exc:
        raise AppError("REPAIR_IMAGE_TOO_LARGE", 413, "图片上传请求不能超过 32 MB") from exc
    except (MultiPartException, MultipartParseError) as exc:
        raise AppError("VALIDATION_ERROR", 422, "上传表单不合法，每个报修最多上传 6 张图片") from exc
    except OSError as exc:
        raise AppError("REPAIR_IMAGE_SAVE_FAILED", 500, "图片保存失败，请稍后重试") from exc
    try:
        data = form.get("data")
        images = form.getlist("images")
        if not isinstance(data, str) or any(key not in {"data", "images"} for key in form) or not all(isinstance(image, UploadFile) for image in images):
            raise AppError("VALIDATION_ERROR", 422, "报修内容或图片字段不合法")
        try:
            body = RepairCreate.model_validate_json(data)
        except ValidationError as exc:
            raise AppError("VALIDATION_ERROR", 422, "请求参数不合法") from exc
        result = await run_in_threadpool(create_repair_with_images, session, user, body, images, request.app.state.settings.repair_upload_dir)
        return envelope(request, result)
    finally:
        await form.close()


@router.get("/{repair_id}/images/{image_id}")
def image_detail(repair_id: int, image_id: int, request: Request, user: AppUser = Depends(get_current_user), session: Session = Depends(get_session)):
    image, path = get_repair_image(session, user, repair_id, image_id, request.app.state.settings.repair_upload_dir)
    return FileResponse(path, media_type=image.content_type, filename=image.file_name, content_disposition_type="inline", headers={"Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff"})


@router.get("/{repair_id}")
def detail(repair_id: int, request: Request, user: AppUser = Depends(get_current_user), session: Session = Depends(get_session)):
    return envelope(request, repair_view(session, get_repair(session, user, repair_id)))


@router.post("/{repair_id}/assign")
def assign(repair_id: int, body: RepairAssign, request: Request, user: AppUser = Depends(require_roles(Role.PROPERTY)), session: Session = Depends(get_session)):
    return envelope(request, assign_repair(session, user, repair_id, body.assignee_id))


@router.post("/{repair_id}/start")
def start(repair_id: int, request: Request, user: AppUser = Depends(require_roles(Role.MAINTENANCE)), session: Session = Depends(get_session)):
    return envelope(request, action_repair(session, user, repair_id, "start"))


@router.post("/{repair_id}/complete")
def complete(repair_id: int, request: Request, body: RepairComplete | None = None, user: AppUser = Depends(require_roles(Role.MAINTENANCE)), session: Session = Depends(get_session)):
    return envelope(request, action_repair(session, user, repair_id, "complete", note=body.note if body else ""))


@router.post("/{repair_id}/confirm")
def confirm(repair_id: int, request: Request, user: AppUser = Depends(require_roles(Role.OWNER)), session: Session = Depends(get_session)):
    return envelope(request, action_repair(session, user, repair_id, "confirm"))


@router.post("/{repair_id}/rate")
def rate(repair_id: int, body: RepairRate, request: Request, user: AppUser = Depends(require_roles(Role.OWNER)), session: Session = Depends(get_session)):
    return envelope(request, action_repair(session, user, repair_id, "rate", rating=body.rating, comment=body.comment))


@router.post("/{repair_id}/cancel")
def cancel(repair_id: int, request: Request, user: AppUser = Depends(require_roles(Role.OWNER)), session: Session = Depends(get_session)):
    return envelope(request, action_repair(session, user, repair_id, "cancel"))
