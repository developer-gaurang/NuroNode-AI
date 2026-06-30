from backend.utils.config import settings


class TwilioNotConfigured(RuntimeError):
    pass


def get_twilio_client():
    if not (settings.twilio_account_sid and settings.twilio_auth_token and settings.twilio_from_number):
        raise TwilioNotConfigured("Twilio credentials are not configured")
    try:
        from twilio.rest import Client
    except ImportError as exc:
        raise TwilioNotConfigured("twilio package is not installed") from exc
    return Client(settings.twilio_account_sid, settings.twilio_auth_token)

