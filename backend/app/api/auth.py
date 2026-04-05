from fastapi import APIRouter, HTTPException, status, Depends
from pydantic import BaseModel

from app.auth.jwt import authenticate_user, create_token, get_current_user

router = APIRouter(prefix="/api/v1/auth", tags=["Authentication"])


class LoginRequest(BaseModel):
    username: str
    password: str


class LoginResponse(BaseModel):
    token: str
    role: str
    expires_at: str


class UserResponse(BaseModel):
    id: int
    username: str
    role: str


@router.post("/login", response_model=LoginResponse)
async def login(body: LoginRequest):
    user = await authenticate_user(body.username, body.password)
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid username or password",
        )
    token, expires = create_token(user["id"], user["username"], user["role"])
    return LoginResponse(
        token=token,
        role=user["role"],
        expires_at=expires.isoformat(),
    )


@router.get("/me", response_model=UserResponse)
async def get_me(user: dict = Depends(get_current_user)):
    return UserResponse(**user)
