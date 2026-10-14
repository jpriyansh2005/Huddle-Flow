"""Application settings, read from environment variables (or a local .env file)."""

from functools import lru_cache
from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict

# The backend/ folder. Paths are anchored here so the app behaves the same
# no matter which directory it is started from.
BACKEND_DIR = Path(__file__).resolve().parents[2]


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=BACKEND_DIR / ".env", extra="ignore")

    app_name: str = "HuddleFlow API"
    api_prefix: str = "/api/v1"

    # SQLite file by default; in production a MySQL address such as
    # mysql+pymysql://user:password@host:3306/huddleflow?charset=utf8mb4
    database_url: str = f"sqlite:///{(BACKEND_DIR / 'huddleflow.db').as_posix()}"
    # Hosted databases usually require an encrypted connection. With no CA
    # file the operating system's certificate store is used.
    database_ssl: bool = False
    database_ssl_ca: str | None = None
    # Bring the schema up to date with the migrations when the app starts.
    migrate_on_startup: bool = True

    # Where the Next.js app is served: used for invite links and CORS.
    frontend_url: str = "http://localhost:3000"
    # Comma separated list of additional origins allowed to call the API.
    extra_cors_origins: str = ""
    # Optional pattern for origins that are not known in advance, such as
    # Vercel preview deployments: https://.*\.vercel\.app
    cors_origin_regex: str | None = None

    seed_on_startup: bool = True

    # How long an instant meeting stays open after the last person leaves.
    empty_room_grace_seconds: float = 60

    # Accounts. The session cookie is sent only over HTTPS when cookie_secure
    # is on, which it must be in production.
    session_cookie_name: str = "hf_session"
    session_days: int = 30
    cookie_secure: bool = False
    # After this many wrong passwords for one email, logins for that email
    # are refused for the lockout period.
    login_max_failures: int = 5
    login_lockout_minutes: int = 15

    # The demo account owns the sample meetings. "Try the demo" signs in to
    # it without a password; nobody knows its password.
    demo_enabled: bool = True
    demo_user_name: str = "Alex Morgan"
    demo_user_email: str = "demo@huddleflow.app"

    @property
    def cors_origins(self) -> list[str]:
        extras = [origin.strip() for origin in self.extra_cors_origins.split(",")]
        origins = [self.frontend_url, *extras]
        return [origin.rstrip("/") for origin in origins if origin]


@lru_cache
def get_settings() -> Settings:
    return Settings()
