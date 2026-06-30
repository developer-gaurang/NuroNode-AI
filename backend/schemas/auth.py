from pydantic import BaseModel, Field


class RegisterRequest(BaseModel):
    email: str
    password: str = Field(min_length=8)
    display_name: str = Field(min_length=1, max_length=120)


class LoginRequest(BaseModel):
    email: str
    password: str
    remember_me: bool = False


class AuthResponse(BaseModel):
    uid: str
    email: str
    email_verified: bool = False
    id_token: str | None = None
    refresh_token: str | None = None
    expires_in: str | None = None


class PasswordResetRequest(BaseModel):
    email: str


class EmailVerificationRequest(BaseModel):
    id_token: str


class UserProfileUpdate(BaseModel):
    display_name: str | None = None
    phone: str | None = None
    role: str | None = "patient"
