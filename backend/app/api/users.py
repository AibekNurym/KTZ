import bcrypt
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from app.auth.jwt import require_admin
from app.db.connection import get_pool

router = APIRouter(prefix="/api/v1/users", tags=["Users"])


class UserOut(BaseModel):
    id: int
    username: str
    role: str


class CreateUserRequest(BaseModel):
    username: str
    password: str
    role: str


class UpdateUserRequest(BaseModel):
    role: str | None = None
    password: str | None = None


@router.get("", response_model=list[UserOut])
async def list_users(user: dict = Depends(require_admin)):
    pool = get_pool()
    async with pool.acquire() as conn:
        rows = await conn.fetch("SELECT id, username, role FROM users ORDER BY id")
    return [UserOut(**dict(r)) for r in rows]


@router.post("", response_model=UserOut)
async def create_user(body: CreateUserRequest, user: dict = Depends(require_admin)):
    hashed = bcrypt.hashpw(body.password.encode(), bcrypt.gensalt(rounds=12)).decode()
    pool = get_pool()
    async with pool.acquire() as conn:
        try:
            row = await conn.fetchrow(
                "INSERT INTO users (username, password_hash, role) VALUES ($1, $2, $3) RETURNING id, username, role",
                body.username, hashed, body.role,
            )
        except Exception:
            raise HTTPException(status_code=400, detail="Username already exists")
    return UserOut(**dict(row))


@router.patch("/{user_id}", response_model=UserOut)
async def update_user(user_id: int, body: UpdateUserRequest, user: dict = Depends(require_admin)):
    pool = get_pool()
    async with pool.acquire() as conn:
        if body.password:
            hashed = bcrypt.hashpw(body.password.encode(), bcrypt.gensalt(rounds=12)).decode()
            await conn.execute("UPDATE users SET password_hash=$1 WHERE id=$2", hashed, user_id)
        if body.role:
            await conn.execute("UPDATE users SET role=$1 WHERE id=$2", body.role, user_id)
        row = await conn.fetchrow("SELECT id, username, role FROM users WHERE id=$1", user_id)
    if not row:
        raise HTTPException(status_code=404, detail="User not found")
    return UserOut(**dict(row))


@router.delete("/{user_id}")
async def delete_user(user_id: int, user: dict = Depends(require_admin)):
    pool = get_pool()
    async with pool.acquire() as conn:
        result = await conn.execute("DELETE FROM users WHERE id=$1", user_id)
    if result == "DELETE 0":
        raise HTTPException(status_code=404, detail="User not found")
    return {"status": "deleted", "id": user_id}
