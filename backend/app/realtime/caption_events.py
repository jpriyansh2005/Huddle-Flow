"""Room messages for live captions.

captions_set  (host)  ->  captions_updated   switch captions on or off for everyone
caption               ->  caption            text someone just said; "final" lines
                                             are saved to the transcript

Each browser turns its own speaker's voice into text and sends it here, so
nobody's audio passes through the server. Unfinished text ("final": false)
changes as the speaker talks and is only passed on, never saved.
"""

from typing import Annotated

from pydantic import BaseModel, ConfigDict, StringConstraints

from app.models.transcript_line import MAX_CAPTION_LENGTH
from app.realtime.context import EventContext, Handler, change_meeting, host_only, parse
from app.services import caption_service

CaptionText = Annotated[
    str, StringConstraints(strip_whitespace=True, min_length=1, max_length=MAX_CAPTION_LENGTH)
]


class CaptionsSetIn(BaseModel):
    model_config = ConfigDict(strict=True)
    enabled: bool


class CaptionIn(BaseModel):
    model_config = ConfigDict(strict=True)
    text: CaptionText
    final: bool


@host_only
async def handle_captions_set(ctx: EventContext, payload: dict) -> None:
    def change(db, meeting):
        enabled = parse(CaptionsSetIn, payload).enabled
        caption_service.set_captions(db, meeting, enabled)
        return {"type": "captions_updated", "enabled": enabled}

    await change_meeting(ctx, change)


async def handle_caption(ctx: EventContext, payload: dict) -> None:
    def change(db, meeting):
        data = parse(CaptionIn, payload)
        if not meeting.captions_on:
            # Sent just before the host switched captions off: drop it quietly.
            return None
        if data.final:
            caption_service.save_line(db, meeting, ctx.actor, data.text)
        return {
            "type": "caption",
            "participant_id": ctx.sender.participant_id,
            "speaker_name": ctx.sender.display_name,
            "text": data.text,
            "final": data.final,
        }

    await change_meeting(ctx, change)


HANDLERS: dict[str, Handler] = {
    "captions_set": handle_captions_set,
    "caption": handle_caption,
}
