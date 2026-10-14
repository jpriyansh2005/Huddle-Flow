"""Shapes of what a meeting produces: notes, action items and chat messages."""

from datetime import date, datetime
from typing import Annotated

from pydantic import BaseModel, ConfigDict, Field, StringConstraints

from app.models.action_item import MAX_ACTION_TEXT_LENGTH
from app.models.chat_message import MAX_CHAT_LENGTH
from app.models.note import MAX_NOTE_LENGTH

NoteText = Annotated[
    str, StringConstraints(strip_whitespace=True, min_length=1, max_length=MAX_NOTE_LENGTH)
]
ActionText = Annotated[
    str, StringConstraints(strip_whitespace=True, min_length=1, max_length=MAX_ACTION_TEXT_LENGTH)
]
PersonName = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=64)]
ChatText = Annotated[
    str, StringConstraints(strip_whitespace=True, min_length=1, max_length=MAX_CHAT_LENGTH)
]


# --- notes ---------------------------------------------------------------------------


class NoteIn(BaseModel):
    text: NoteText


class NoteOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    author_participant_id: int | None
    author_name: str
    text: str
    created_at: datetime


# --- action items --------------------------------------------------------------------


class ActionItemIn(BaseModel):
    text: ActionText
    # Either someone in the meeting (by participant id) or any name.
    owner_participant_id: int | None = None
    owner_name: PersonName | None = None
    due_date: date | None = None


class ActionItemUpdate(BaseModel):
    """Only the fields that are sent change. Sending both owner fields as
    null removes the owner."""

    text: ActionText | None = None
    done: bool | None = None
    owner_participant_id: int | None = None
    owner_name: PersonName | None = None
    due_date: date | None = None


class ActionItemOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    text: str
    owner_name: str | None
    owner_user_id: int | None
    due_date: date | None
    done: bool
    created_by_participant_id: int | None
    created_at: datetime


class MeetingRef(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    code: str
    title: str
    started_at: datetime | None
    ended_at: datetime | None


class MyActionItemOut(ActionItemOut):
    """An action item on someone's own list, with the meeting it came from."""

    meeting: MeetingRef
    assigned_to_me: bool


class DoneIn(BaseModel):
    done: bool


# --- chat ----------------------------------------------------------------------------


class ChatIn(BaseModel):
    text: ChatText


class ChatMessageOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    sender_id: int | None = Field(validation_alias="participant_id")
    sender_name: str
    text: str
    sent_at: datetime
