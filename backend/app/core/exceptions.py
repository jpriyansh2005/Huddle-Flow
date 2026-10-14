"""Domain errors raised by the service layer.

Services know nothing about HTTP. Each error carries the status code and
message the API should answer with, and one handler in ``main.py`` turns any
``DomainError`` into a JSON response.
"""


class DomainError(Exception):
    status_code = 400
    message = "The request could not be completed."

    def __init__(self, message: str | None = None) -> None:
        super().__init__(message or self.message)
        if message:
            self.message = message


class MeetingNotFoundError(DomainError):
    status_code = 404
    message = "This meeting ID is not valid. Please check and try again."


class MeetingEndedError(DomainError):
    status_code = 409
    message = "This meeting has been ended by the host."


class NotMeetingHostError(DomainError):
    status_code = 403
    message = "Only the host can do this."


class MeetingInProgressError(DomainError):
    status_code = 409
    message = "A meeting that is in progress cannot be changed."


class NotAuthenticatedError(DomainError):
    status_code = 401
    message = "Sign in to continue."


class InvalidCredentialsError(DomainError):
    status_code = 401
    message = "Incorrect email or password."


class EmailTakenError(DomainError):
    status_code = 409
    message = "An account with this email already exists. Sign in instead."


class TooManyAttemptsError(DomainError):
    status_code = 429
    message = "Too many failed sign-in attempts. Try again in a few minutes."


class FeatureDisabledError(DomainError):
    status_code = 404
    message = "This feature is not available."
