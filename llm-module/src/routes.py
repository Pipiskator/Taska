from __future__ import annotations

from datetime import date
from typing import Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel

try:
    from config import Settings, get_settings
    from llm import agenerate_chat_response, agenerate_encouragement_response
    from schemas import ChatRequest, EncouragementRequest, LLMContext, LLMResponse, ProjectContext, ChatMessage
except ImportError:
    from src.config import Settings, get_settings
    from src.llm import agenerate_chat_response, agenerate_encouragement_response
    from src.schemas import ChatRequest, EncouragementRequest, LLMContext, LLMResponse, ProjectContext, ChatMessage


router = APIRouter(prefix="/llm", tags=["llm"])


class NotificationEncouragementRequest(BaseModel):
    notification_type: str
    notification_title: str
    notification_message: Optional[str] = None
    task_title: Optional[str] = None
    project_name: Optional[str] = None


@router.get("/health")
async def healthcheck() -> dict[str, str]:
    return {"status": "ok"}


@router.post("/chat", response_model=LLMResponse)
async def chat(
    request: ChatRequest,
    settings: Settings = Depends(get_settings),
) -> LLMResponse:
    try:
        return await agenerate_chat_response(
            request,
            settings.get_llm_config(),
        )
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail={
                "message": "Ошибка обработки ответа LLM для chat-запроса",
                "error": str(exc),
            },
        ) from exc
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail={
                "message": "Ошибка при вызове LLM для chat-запроса",
                "error": str(exc),
            },
        ) from exc


@router.post("/encouragement", response_model=LLMResponse)
async def encouragement(
    request: EncouragementRequest,
    settings: Settings = Depends(get_settings),
) -> LLMResponse:
    try:
        return await agenerate_encouragement_response(
            request,
            settings.get_llm_config(),
        )
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail={
                "message": "Ошибка обработки ответа LLM для encouragement-запроса",
                "error": str(exc),
            },
        ) from exc
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail={
                "message": "Ошибка при вызове LLM для encouragement-запроса",
                "error": str(exc),
            },
        ) from exc


@router.post("/encouragement-for-notification")
async def encouragement_for_notification(
    req: NotificationEncouragementRequest,
    settings: Settings = Depends(get_settings),
) -> dict:
    type_prompts = {
        "task_created": f"Пользователь только что создал задачу «{req.task_title}». Напиши короткое подбадривающее сообщение, пожелай удачи.",
        "status_changed": f"Пользователь изменил статус задачи «{req.task_title}»: {req.notification_message}. Поддержи его.",
        "due_today": f"Сегодня последний день для выполнения задачи «{req.task_title}». Мотивируй завершить задачу сегодня.",
        "due_date_overdue": f"Задача «{req.task_title}» просрочена. Поддержи пользователя, не осуждай, мотивируй не сдаваться.",
        "subtask_completed": f"Пользователь завершил подзадачу в задаче «{req.task_title}». Похвали за прогресс.",
        "due_date_changed": f"Пользователь изменил дедлайн задачи «{req.task_title}». Поддержи его.",
    }

    user_message = type_prompts.get(
        req.notification_type,
        f"Событие: {req.notification_title}. {req.notification_message or ''}. Поддержи пользователя.",
    )

    encouragement_request = EncouragementRequest(
        context=LLMContext(
            project=ProjectContext(
                project_id=UUID("00000000-0000-0000-0000-000000000000"),
                project_name=req.project_name or "Проект",
            ),
            current_date=date.today(),
            chat_history=[
                ChatMessage(role="user", content=user_message)
            ],
        )
    )

    try:
        llm_response = await agenerate_encouragement_response(
            encouragement_request,
            settings.get_llm_config(),
        )
        return {"motivation": llm_response.message_to_user or "Ты справишься!"}
    except Exception:
        return {"motivation": "Ты справишься! Удачи!"}