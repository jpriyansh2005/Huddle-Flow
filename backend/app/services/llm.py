"""Talking to a large language model through an OpenAI-compatible API.

Groq, OpenAI and several other providers accept the same Chat Completions
requests, so one client covers them all; the provider is chosen by settings
(``LLM_BASE_URL``, ``LLM_API_KEY``, ``LLM_MODEL``), not by code.

The rest of the app depends only on the small ``JsonModel`` protocol, which is
what lets the tests use a fake model instead of calling a real service.
"""

import logging
import threading
from typing import TYPE_CHECKING, Protocol

import openai
from openai import OpenAI

from app.core.config import Settings, get_settings
from app.core.exceptions import DomainError

if TYPE_CHECKING:
    import httpx2  # installed with the openai package

logger = logging.getLogger(__name__)


class LLMUnavailableError(DomainError):
    status_code = 503
    message = "The summary service can't be reached right now. Try again later."


class LLMBusyError(DomainError):
    status_code = 429
    message = (
        "The summary service is busy (its plan allows a few requests a minute). "
        "Try again in a minute."
    )


class LLMBadOutputError(DomainError):
    status_code = 502
    message = "The summary service sent back something unexpected. Try again."


class JsonModel(Protocol):
    """A model that answers with JSON matching a schema."""

    name: str

    def complete_json(self, *, system: str, user: str, schema_name: str, schema: dict) -> str:
        """Return the model's answer: a JSON document, as text."""
        ...


class OpenAICompatibleModel:
    def __init__(
        self,
        settings: Settings,
        *,
        max_retries: int = 1,
        http_client: "httpx2.Client | None" = None,
    ) -> None:
        """``http_client`` lets the tests answer requests without a network."""
        assert settings.llm_api_key is not None
        self.name = settings.llm_model
        self._max_tokens = settings.llm_max_output_tokens
        self._reasoning_effort = settings.llm_reasoning_effort.strip() or None
        self._client = OpenAI(
            api_key=settings.llm_api_key.get_secret_value(),
            # Empty means the library's default, which is OpenAI itself.
            base_url=settings.llm_base_url.strip() or None,
            timeout=settings.llm_timeout_seconds,
            # One retry for a dropped connection; more would only wait longer
            # on a rate limit, which is better reported to the user.
            max_retries=max_retries,
            http_client=http_client,
        )

    def complete_json(self, *, system: str, user: str, schema_name: str, schema: dict) -> str:
        options = {"reasoning_effort": self._reasoning_effort} if self._reasoning_effort else {}
        try:
            response = self._client.chat.completions.create(
                model=self.name,
                messages=[
                    {"role": "system", "content": system},
                    {"role": "user", "content": user},
                ],
                response_format={
                    "type": "json_schema",
                    "json_schema": {"name": schema_name, "strict": True, "schema": schema},
                },
                max_completion_tokens=self._max_tokens,
                **options,
            )
        except openai.RateLimitError:
            raise LLMBusyError() from None
        except openai.APIConnectionError as error:  # includes timeouts
            logger.warning("LLM request did not reach the provider: %s", error)
            raise LLMUnavailableError() from None
        except openai.APIStatusError as error:
            # A wrong key, an unknown model, a provider outage... The details
            # are for the server log, not for the person in the meeting.
            logger.warning("LLM request failed with %s: %s", error.status_code, error.message)
            raise LLMUnavailableError() from None

        choice = response.choices[0] if response.choices else None
        content = choice.message.content if choice else None
        if not content or choice.finish_reason == "length":
            # A cut-off answer is not valid JSON; say so instead of failing later.
            logger.warning(
                "LLM answer was empty or cut off (finish_reason=%s)",
                choice and choice.finish_reason,
            )
            raise LLMBadOutputError()
        return content


_lock = threading.Lock()
_cached: tuple[tuple, OpenAICompatibleModel] | None = None


def get_json_model() -> JsonModel | None:
    """The configured model, or None when no API key is set (feature off).

    The client is created once and reused, so its connections are pooled.
    """
    global _cached
    settings = get_settings()
    if not settings.summaries_enabled:
        return None
    key = (
        settings.llm_api_key.get_secret_value(),
        settings.llm_base_url,
        settings.llm_model,
        settings.llm_reasoning_effort,
    )
    with _lock:
        if _cached is None or _cached[0] != key:
            _cached = (key, OpenAICompatibleModel(settings))
        return _cached[1]
