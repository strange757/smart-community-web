import io
import logging
import re
from dataclasses import dataclass
from pathlib import Path
from uuid import uuid4

from PIL import Image, ImageOps, UnidentifiedImageError
from sqlalchemy.orm import Session
from starlette.datastructures import UploadFile

from app.core.errors import AppError
from app.models.entities import AppUser, RepairImage
from app.schemas.repairs import RepairCreate
from app.services.repair_service import create_repair_record, get_repair, repair_view, validate_repair_house


MAX_IMAGES = 6
MAX_IMAGE_BYTES = 5 * 1024 * 1024
MAX_REQUEST_BYTES = 32 * 1024 * 1024
MAX_IMAGE_PIXELS = 25_000_000
MAX_IMAGE_EDGE = 2560
FORMATS = {"JPEG": ("image/jpeg", ".jpg"), "PNG": ("image/png", ".png"), "WEBP": ("image/webp", ".webp")}
logger = logging.getLogger(__name__)


@dataclass(frozen=True)
class PreparedImage:
    content: bytes
    file_name: str
    content_type: str
    extension: str
    width: int
    height: int


def _prepare_image(upload: UploadFile) -> PreparedImage:
    if upload.size is not None and upload.size > MAX_IMAGE_BYTES:
        raise AppError("REPAIR_IMAGE_TOO_LARGE", 413, "每张图片不能超过 5 MB")
    upload.file.seek(0)
    content = upload.file.read(MAX_IMAGE_BYTES + 1)
    if len(content) > MAX_IMAGE_BYTES:
        raise AppError("REPAIR_IMAGE_TOO_LARGE", 413, "每张图片不能超过 5 MB")
    try:
        with Image.open(io.BytesIO(content), formats=list(FORMATS)) as source:
            image_format = source.format
            if source.width * source.height > MAX_IMAGE_PIXELS:
                raise AppError("REPAIR_IMAGE_TOO_LARGE", 413, "图片像素不能超过 2500 万")
            if getattr(source, "is_animated", False) or getattr(source, "n_frames", 1) != 1:
                raise AppError("REPAIR_IMAGE_INVALID", 422, "只支持静态 JPG、PNG 或 WEBP 图片")
            source.verify()
        with Image.open(io.BytesIO(content), formats=list(FORMATS)) as source:
            source.load()
            oriented = ImageOps.exif_transpose(source)
            oriented.thumbnail((MAX_IMAGE_EDGE, MAX_IMAGE_EDGE), Image.Resampling.LANCZOS)
            mode = "RGB" if image_format == "JPEG" else "RGBA" if "A" in oriented.getbands() or "transparency" in oriented.info else "RGB"
            # A fresh image removes EXIF, GPS, comments, and embedded profiles.
            clean = Image.new(mode, oriented.size)
            clean.paste(oriented.convert(mode))
            output = io.BytesIO()
            options = {"quality": 88} if image_format in {"JPEG", "WEBP"} else {}
            clean.save(output, format=image_format, **options)
            width, height = clean.size
    except Image.DecompressionBombError as exc:
        raise AppError("REPAIR_IMAGE_TOO_LARGE", 413, "图片像素不能超过 2500 万") from exc
    except (UnidentifiedImageError, OSError, ValueError, SyntaxError) as exc:
        raise AppError("REPAIR_IMAGE_INVALID", 422, "图片无法读取，请上传完整的 JPG、PNG 或 WEBP 图片") from exc
    content_type, extension = FORMATS[image_format]
    original_name = (upload.filename or "repair").replace("\\", "/").rsplit("/", 1)[-1]
    stem = re.sub(r"[\x00-\x1f\x7f]", "", Path(original_name).stem).strip(" .")[:120] or "repair"
    return PreparedImage(output.getvalue(), stem + extension, content_type, extension, width, height)


def create_repair_with_images(session: Session, user: AppUser, body: RepairCreate, uploads: list[UploadFile], upload_dir: Path) -> dict:
    written: list[Path] = []
    try:
        validate_repair_house(session, user, body.house_id)
        if len(uploads) > MAX_IMAGES:
            raise AppError("REPAIR_IMAGE_INVALID", 422, "每个报修最多上传 6 张图片")
        prepared = [_prepare_image(upload) for upload in uploads]
        repair = create_repair_record(session, user, body.house_id, body.category, body.description, body.priority)
        if prepared:
            upload_dir.mkdir(parents=True, exist_ok=True)
        for image in prepared:
            storage_key = uuid4().hex + image.extension
            path = upload_dir / storage_key
            with path.open("xb") as output:
                written.append(path)
                output.write(image.content)
            session.add(RepairImage(
                community_id=repair.community_id,
                repair_id=repair.id,
                uploader_id=user.id,
                storage_key=storage_key,
                file_name=image.file_name,
                content_type=image.content_type,
                size=len(image.content),
                width=image.width,
                height=image.height,
            ))
        session.flush()
        result = repair_view(session, repair)
        session.commit()
        return result
    except Exception as exc:
        try:
            session.rollback()
        except Exception:
            logger.exception("Could not roll back failed repair upload")
        for path in written:
            try:
                path.unlink(missing_ok=True)
            except OSError:
                logger.exception("Failed to remove uncommitted repair image: %s", path)
        if isinstance(exc, AppError):
            raise
        logger.exception("Could not save repair images")
        raise AppError("REPAIR_IMAGE_SAVE_FAILED", 500, "图片保存失败，请稍后重试") from exc


def get_repair_image(session: Session, user: AppUser, repair_id: int, image_id: int, upload_dir: Path) -> tuple[RepairImage, Path]:
    repair = get_repair(session, user, repair_id)
    image = session.get(RepairImage, image_id)
    if image is None or image.repair_id != repair.id or image.community_id != user.community_id:
        raise AppError("RESOURCE_NOT_FOUND", 404, "报修图片不存在")
    root = upload_dir.resolve()
    path = (root / image.storage_key).resolve()
    if not path.is_relative_to(root) or not path.is_file():
        raise AppError("RESOURCE_NOT_FOUND", 404, "报修图片不存在")
    return image, path
