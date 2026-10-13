"""Authentication API endpoints for SDR-Recorder NVR."""
import sqlite3
from typing import Any, Dict, Optional

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials

from backend.auth import (
    create_access_token,
    get_current_user,
    revoke_token,
    security,
)
from backend.database import get_db
from backend.models import (
    ChangePasswordRequest,
    UserLogin,
    UserResponse,
    hash_password,
    verify_password,
)

router = APIRouter()


@router.post("/login")
def login(payload: UserLogin, db: sqlite3.Connection = Depends(get_db)) -> Dict[str, Any]:
    """Authenticate user with username and password, returns JWT token."""
    cursor = db.cursor()
    cursor.execute("SELECT id, username, password_hash FROM users WHERE username = ?", (payload.username,))
    user = cursor.fetchone()

    if not user or not verify_password(payload.password, user["password_hash"]):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid username or password",
            headers={"WWW-Authenticate": "Bearer"},
        )

    token = create_access_token({"sub": user["username"], "user_id": user["id"]})
    return {
        "token": token,
        "token_type": "bearer",
        "user": {
            "id": user["id"],
            "username": user["username"],
        },
    }


@router.get("/me", response_model=UserResponse)
def get_me(current_user: Dict[str, Any] = Depends(get_current_user)) -> Dict[str, Any]:
    """Return currently authenticated user information."""
    return current_user


@router.post("/logout")
def logout(
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(security),
    current_user: Dict[str, Any] = Depends(get_current_user),
) -> Dict[str, str]:
    """Log out current user by revoking token."""
    if credentials and credentials.credentials:
        revoke_token(credentials.credentials)
    return {"message": "Logged out successfully"}


@router.post("/change-password")
def change_password(
    payload: ChangePasswordRequest,
    current_user: Dict[str, Any] = Depends(get_current_user),
    db: sqlite3.Connection = Depends(get_db),
) -> Dict[str, str]:
    """Change password for currently authenticated user."""
    cursor = db.cursor()
    cursor.execute("SELECT password_hash FROM users WHERE id = ?", (current_user["id"],))
    row = cursor.fetchone()
    if not row or not verify_password(payload.old_password, row["password_hash"]):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Incorrect current password",
        )

    new_hash = hash_password(payload.new_password)
    cursor.execute("UPDATE users SET password_hash = ? WHERE id = ?", (new_hash, current_user["id"]))
    db.commit()

    return {"message": "Password changed successfully"}
