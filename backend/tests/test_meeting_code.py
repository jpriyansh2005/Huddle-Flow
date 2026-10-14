import pytest

from app.services.meeting_code import CODE_LENGTH, generate_meeting_code, normalize_meeting_code


def test_generated_code_is_eleven_digits_without_leading_zero(db):
    code = generate_meeting_code(db)

    assert len(code) == CODE_LENGTH
    assert code.isdigit()
    assert code[0] != "0"


def test_generated_codes_differ(db):
    codes = {generate_meeting_code(db) for _ in range(50)}

    assert len(codes) == 50


@pytest.mark.parametrize(
    "raw",
    [
        "86412345678",
        "864 1234 5678",
        "864-1234-5678",
        "  86412345678  ",
        "http://localhost:3000/j/86412345678",
        "https://huddleflow.vercel.app/j/86412345678?from=invite",
    ],
)
def test_normalize_accepts_ids_and_invite_links(raw):
    assert normalize_meeting_code(raw) == "86412345678"
