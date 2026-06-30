from functools import lru_cache

from backend.utils.config import settings


class FirebaseUnavailable(RuntimeError):
    pass


@lru_cache
def firebase_app():
    try:
        import firebase_admin
        from firebase_admin import credentials
    except ImportError as exc:
        raise FirebaseUnavailable("firebase-admin is not installed") from exc

    if firebase_admin._apps:
        return firebase_admin.get_app()

    cred = None
    service_account = settings.firebase_service_account
    if service_account:
        cred = credentials.Certificate(service_account)
    elif settings.firebase_service_account_file:
        cred = credentials.Certificate(settings.firebase_service_account_file)
    else:
        raise FirebaseUnavailable("Firebase service account credentials are not configured")

    return firebase_admin.initialize_app(
        cred,
        {
            "projectId": settings.firebase_project_id or None,
            "storageBucket": settings.firebase_storage_bucket or None,
        },
    )


def firestore_client():
    try:
        from firebase_admin import firestore
    except ImportError as exc:
        raise FirebaseUnavailable("firebase-admin is not installed") from exc
    firebase_app()
    return firestore.client()


def firebase_auth():
    try:
        from firebase_admin import auth
    except ImportError as exc:
        raise FirebaseUnavailable("firebase-admin is not installed") from exc
    firebase_app()
    return auth
