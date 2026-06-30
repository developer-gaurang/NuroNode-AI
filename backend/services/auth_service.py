from fastapi import HTTPException, status

from backend.database import get_store
from backend.firebase.client import FirebaseUnavailable, firebase_auth
from backend.schemas.auth import AuthResponse, LoginRequest, RegisterRequest
from backend.utils.config import settings


class AuthService:
    def __init__(self) -> None:
        self.store = get_store()

    async def register(self, request: RegisterRequest) -> AuthResponse:
        try:
            user = firebase_auth().create_user(
                email=request.email,
                password=request.password,
                display_name=request.display_name,
                email_verified=False,
            )
            self.store.save_user_profile(user.uid, {"email": request.email, "display_name": request.display_name, "role": "patient"})
            return AuthResponse(uid=user.uid, email=request.email, email_verified=False)
        except FirebaseUnavailable as exc:
            raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail="Firebase is not configured") from exc
        except Exception as exc:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc

    async def login(self, request: LoginRequest) -> AuthResponse:
        if not settings.firebase_web_api_key:
            raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail="Firebase web API key is not configured")

        try:
            import httpx
        except ImportError as exc:
            raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail="httpx is required for Firebase password login") from exc

        url = f"https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key={settings.firebase_web_api_key}"
        async with httpx.AsyncClient(timeout=10) as client:
            response = await client.post(
                url,
                json={"email": request.email, "password": request.password, "returnSecureToken": True},
            )
        if response.status_code >= 400:
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid email or password")
        payload = response.json()
        return AuthResponse(
            uid=payload["localId"],
            email=payload["email"],
            email_verified=bool(payload.get("emailVerified", False)),
            id_token=payload["idToken"],
            refresh_token=payload.get("refreshToken"),
            expires_in=payload.get("expiresIn"),
        )

    async def send_password_reset(self, email: str) -> dict:
        return await self._firebase_accounts_action("accounts:sendOobCode", {"requestType": "PASSWORD_RESET", "email": email})

    async def send_email_verification(self, id_token: str) -> dict:
        return await self._firebase_accounts_action("accounts:sendOobCode", {"requestType": "VERIFY_EMAIL", "idToken": id_token})

    async def _firebase_accounts_action(self, action: str, payload: dict) -> dict:
        if not settings.firebase_web_api_key:
            raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail="Firebase web API key is not configured")
        try:
            import httpx
        except ImportError as exc:
            raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail="httpx is required for Firebase email actions") from exc
        url = f"https://identitytoolkit.googleapis.com/v1/{action}?key={settings.firebase_web_api_key}"
        async with httpx.AsyncClient(timeout=10) as client:
            response = await client.post(url, json=payload)
        if response.status_code >= 400:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=response.text)
        return {"ok": True, "message": "Firebase email action requested"}
