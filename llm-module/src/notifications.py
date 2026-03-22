from fastapi import APIRouter, Depends, HTTPException
from supabase import Client, create_client
from pydantic import BaseModel
from typing import List, Optional
from datetime import datetime
import os

SUPABASE_URL = os.getenv("SUPABASE_URL", "https://pyxwvharzhqhigvcryoq.supabase.co")
SUPABASE_KEY = os.getenv("SUPABASE_ANON_KEY", "sb_publishable_SKhVi_u9-AvL7sUEhom5yA_SxXtEBWO")
supabase_client = create_client(SUPABASE_URL, SUPABASE_KEY)

router = APIRouter(prefix="/notifications", tags=["notifications"])


class NotificationOut(BaseModel):
    id: int
    user_id: int
    task_id: Optional[int]
    type: str
    title: str
    message: Optional[str]
    is_read: bool
    created_at: datetime


@router.get("/", response_model=List[NotificationOut])
async def get_notifications(
    user_id: int,
    unread_only: bool = False,
    limit: int = 30,
    db: Client = Depends(lambda: supabase_client),
):
    query = (
        db.table("notifications")
        .select("*")
        .eq("user_id", user_id)
        .order("created_at", desc=True)
        .limit(limit)
    )
    if unread_only:
        query = query.eq("is_read", False)

    res = query.execute()
    return res.data


@router.patch("/{notif_id}/read")
async def mark_read(
    notif_id: int,
    user_id: int,
    db: Client = Depends(lambda: supabase_client),
):
    res = (
        db.table("notifications")
        .update({"is_read": True})
        .eq("id", notif_id)
        .eq("user_id", user_id)
        .execute()
    )
    if len(res.data) == 0:
        raise HTTPException(status_code=404, detail="Уведомление не найдено или не ваше")

    return {"status": "read"}