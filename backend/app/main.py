import uuid

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException

from app.api.v1.auth import router as auth_router
from app.api.v1.notices import router as notices_router
from app.api.v1.repairs import router as repairs_router
from app.api.v1.billing import router as billing_router
from app.api.v1.dashboard import router as dashboard_router
from app.api.v1.parking import router as parking_router
from app.core.config import Settings
from app.core.errors import AppError
from app.db.base import Base
from app.db.seed import seed_database
from app.db.session import make_engine, make_session_factory
from app.models import entities  # noqa: F401


def create_app(database_url: str | None = None) -> FastAPI:
    settings = Settings(database_url=database_url) if database_url else Settings()
    engine = make_engine(settings.database_url)
    Base.metadata.create_all(engine)
    session_factory = make_session_factory(engine)
    with session_factory() as session:
        seed_database(session)

    app = FastAPI(title="和邻智慧社区", version="1.0.0")
    app.state.settings = settings
    app.state.session_factory = session_factory
    app.add_middleware(
        CORSMiddleware,
        allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    @app.middleware("http")
    async def request_id(request: Request, call_next):
        request.state.request_id = request.headers.get("X-Request-Id") or str(uuid.uuid4())
        response = await call_next(request)
        response.headers["X-Request-Id"] = request.state.request_id
        return response

    @app.exception_handler(AppError)
    async def app_error(request: Request, exc: AppError):
        return JSONResponse(
            status_code=exc.status_code,
            content={"code": exc.code, "message": exc.message, "requestId": request.state.request_id},
        )

    @app.exception_handler(RequestValidationError)
    async def validation_error(request: Request, exc: RequestValidationError):
        return JSONResponse(
            status_code=422,
            content={"code": "VALIDATION_ERROR", "message": "请求参数不合法", "requestId": request.state.request_id},
        )

    @app.exception_handler(StarletteHTTPException)
    async def framework_http_error(request: Request, exc: StarletteHTTPException):
        return JSONResponse(
            status_code=exc.status_code,
            headers=exc.headers,
            content={
                "code": f"HTTP_{exc.status_code}",
                "message": str(exc.detail),
                "requestId": request.state.request_id,
            },
        )

    app.include_router(auth_router)
    app.include_router(notices_router)
    app.include_router(repairs_router)
    app.include_router(billing_router)
    app.include_router(parking_router)
    app.include_router(dashboard_router)
    return app


app = create_app()
