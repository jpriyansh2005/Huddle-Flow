"""Application entry point: ``uvicorn app.main:app``."""

from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from fastapi import APIRouter, FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.api.routes import auth, health, meetings
from app.api.routes.auth import clear_session_cookie
from app.core.config import get_settings
from app.core.exceptions import DomainError, NotAuthenticatedError
from app.db.migrate import upgrade_to_latest
from app.db.seed import seed_database
from app.db.session import SessionLocal, engine
from app.realtime import socket


@asynccontextmanager
async def lifespan(_app: FastAPI) -> AsyncIterator[None]:
    """Runs once at startup: migrate the schema, then seed if empty.

    Free hosting tiers can wipe the disk on every deploy, so the app has to
    be able to build its database from nothing.
    """
    settings = get_settings()
    if settings.migrate_on_startup:
        upgrade_to_latest(engine)
    if settings.seed_on_startup:
        with SessionLocal() as db:
            seed_database(db)
    yield


def create_app() -> FastAPI:
    settings = get_settings()
    app = FastAPI(title=settings.app_name, version="2.0.0", lifespan=lifespan)

    # The frontend calls the API through its own address (a Next.js rewrite),
    # so browsers see one site. CORS still allows direct calls from the
    # frontend's origin, which the WebSocket and local tools use.
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins,
        allow_origin_regex=settings.cors_origin_regex,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    @app.exception_handler(DomainError)
    async def handle_domain_error(request: Request, error: DomainError) -> JSONResponse:
        # Same shape as FastAPI's own errors, so the frontend reads one format.
        response = JSONResponse(status_code=error.status_code, content={"detail": error.message})
        had_cookie = settings.session_cookie_name in request.cookies
        if isinstance(error, NotAuthenticatedError) and had_cookie:
            # The cookie holds an expired or unknown session; drop it so the
            # browser stops sending it.
            clear_session_cookie(response)
        return response

    api = APIRouter(prefix=settings.api_prefix)
    api.include_router(health.router)
    api.include_router(auth.router)
    api.include_router(meetings.router)
    app.include_router(api)
    app.include_router(socket.router)

    return app


app = create_app()
