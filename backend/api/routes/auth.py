from fastapi import APIRouter, Depends, Response

from backend.auth.dependencies import get_current_user
from backend.database import get_store
from backend.schemas.auth import EmailVerificationRequest, LoginRequest, PasswordResetRequest, RegisterRequest, UserProfileUpdate
from backend.schemas.common import ApiMessage, CurrentUser
from backend.services.auth_service import AuthService
from backend.utils.config import settings

router = APIRouter()


@router.post("/register")
async def register(request: RegisterRequest, response: Response):
    result = await AuthService().register(request)
    if result.id_token:
        response.set_cookie(settings.session_cookie_name, result.id_token, httponly=True, secure=settings.app_env == "production", samesite="lax")
    return result


@router.post("/login")
async def login(request: LoginRequest, response: Response):
    result = await AuthService().login(request)
    if result.id_token:
        max_age = 60 * 60 * 24 * 30 if request.remember_me else None
        response.set_cookie(settings.session_cookie_name, result.id_token, httponly=True, secure=settings.app_env == "production", samesite="lax", max_age=max_age)
    return result


@router.post("/logout", response_model=ApiMessage)
async def logout(response: Response):
    response.delete_cookie(settings.session_cookie_name)
    return ApiMessage(message="Logged out")


@router.post("/password-reset", response_model=ApiMessage)
async def password_reset(request: PasswordResetRequest):
    await AuthService().send_password_reset(request.email)
    return ApiMessage(message="Password reset requested")


@router.post("/email-verification", response_model=ApiMessage)
async def email_verification(request: EmailVerificationRequest):
    await AuthService().send_email_verification(request.id_token)
    return ApiMessage(message="Email verification requested")


@router.get("/session", response_model=CurrentUser)
async def validate_session(user: CurrentUser = Depends(get_current_user)):
    return user


@router.put("/profile")
async def update_profile(request: UserProfileUpdate, user: CurrentUser = Depends(get_current_user)):
    return get_store().save_user_profile(user.uid, request.model_dump(exclude_none=True))


@router.get("/profile")
async def get_profile(user: CurrentUser = Depends(get_current_user)):
    return get_store().get_user_profile(user.uid) or {"uid": user.uid, "email": user.email}

