from __future__ import annotations

import asyncio
import json
import time
from collections.abc import Callable
from typing import Any

from openai import AsyncOpenAI, OpenAI
from pydantic import ValidationError

try:
    from config import LLMConfig
    from schemas import ChatRequest, EncouragementRequest, LLMResponse
except ImportError:  # pragma: no cover
    from src.config import LLMConfig
    from src.schemas import ChatRequest, EncouragementRequest, LLMResponse


RetryDelay = float | Callable[[float], float]


def _json_dumps(data: Any) -> str:
    return json.dumps(data, ensure_ascii=False, indent=2, sort_keys=True)


def _resolve_retry_delay(
    retry_delay: RetryDelay,
    current_delay: float,
) -> float:
    if callable(retry_delay):
        next_delay = float(retry_delay(current_delay))
    else:
        next_delay = float(retry_delay)

    if next_delay < 0:
        raise ValueError("Задержка между retry не может быть отрицательной.")

    return next_delay


def build_prompt(request: ChatRequest) -> list[dict[str, str]]:
    response_schema = LLMResponse.model_json_schema()
    request_payload = request.model_dump(mode="json")

    system_prompt = (
        "Ты — LLM-модуль внутри agile-доски задач.\n"
        "Твоя задача — анализировать сообщение пользователя и контекст проекта, "
        "после чего возвращать строго валидный JSON-объект.\n\n"
        "Обязательные правила:\n"
        "1. Верни только JSON без markdown, без пояснений, без префиксов, без ```.\n"
        "2. JSON должен соответствовать указанной ниже JSON Schema.\n"
        "3. Не добавляй поля, которых нет в схеме.\n"
        "4. Если какое-то действие не требуется, используй пустой список или null в соответствии со схемой.\n"
        "5. Поле message_to_user должно быть на языке пользователя.\n"
        "6. Учитывай текущую дату и контекст проекта.\n"
        "7. Не выдумывай задачи и изменения без оснований.\n"
        "8. При удалении задач в delete_tasks сначала указывай дочерние, потом родительские.\n"
        "9. Значение column_name должно быть одним из названий колонок, переданных в context.columns. "
        "Не придумывай новые названия колонок.\n"
        "10. Значение task_type_name должно быть одним из названий типов задач, переданных в context.task_types. "
        "Не придумывай новые типы задач.\n\n"
        "JSON Schema ожидаемого ответа:\n"
        f"{_json_dumps(response_schema)}"
    )

    user_prompt = (
        "Ниже передан входной запрос для обработки.\n"
        "Верни только JSON, соответствующий схеме из system message.\n\n"
        "Структура входных данных:\n"
        f"{_json_dumps(request_payload)}"
    )

    return [
        {"role": "system", "content": system_prompt},
        {"role": "user", "content": user_prompt},
    ]


def build_encouragement_prompt(request: EncouragementRequest) -> list[dict[str, str]]:
    response_schema = LLMResponse.model_json_schema()
    request_payload = request.model_dump(mode="json")

    system_prompt = (
        "Ты — LLM-модуль внутри agile-доски задач.\n"
        "Твоя задача — сгенерировать короткое, уместное и дружелюбное подбадривающее сообщение.\n\n"
        "Обязательные правила:\n"
        "1. Верни только JSON без markdown, без пояснений и без ```.\n"
        "2. JSON должен соответствовать указанной ниже JSON Schema.\n"
        "3. Не добавляй поля, которых нет в схеме.\n"
        "4. Если не нужно менять задачи, верни пустые add_tasks, change_tasks и delete_tasks.\n"
        "5. Поле message_to_user должно быть на языке пользователя.\n"
        "6. Не упоминай, что ты ИИ или модель.\n"
        "7. Не придумывай факты, которых нет в контексте.\n"
        "8. Если упоминаешь колонку задачи, используй только названия из context.columns.\n"
        "9. Если упоминаешь тип задачи, используй только названия из context.task_types.\n\n"
        "JSON Schema ожидаемого ответа:\n"
        f"{_json_dumps(response_schema)}"
    )

    user_prompt = (
        "Ниже передан контекст для генерации подбадривающего сообщения.\n"
        "Верни только JSON, соответствующий схеме из system message.\n\n"
        "Структура входных данных:\n"
        f"{_json_dumps(request_payload)}"
    )

    return [
        {"role": "system", "content": system_prompt},
        {"role": "user", "content": user_prompt},
    ]


def _call_model_once(
    messages: list[dict[str, str]],
    *,
    config: LLMConfig,
) -> str:
    client = OpenAI(
        api_key=config.api_key,
        base_url=config.base_url,
        timeout=config.timeout,
    )

    completion = client.chat.completions.create(
        model=config.model,
        messages=messages,
        temperature=config.temperature,
        max_tokens=config.max_tokens,
        response_format={"type": "json_object"},
    )

    if not completion.choices:
        raise ValueError("Модель не вернула ни одного choice.")

    content = completion.choices[0].message.content
    if content is None or not str(content).strip():
        raise ValueError("Модель вернула пустой content.")

    return content


async def _acall_model_once(
    messages: list[dict[str, str]],
    *,
    config: LLMConfig,
) -> str:
    client = AsyncOpenAI(
        api_key=config.api_key,
        base_url=config.base_url,
        timeout=config.timeout,
    )

    completion = await client.chat.completions.create(
        model=config.model,
        messages=messages,
        temperature=config.temperature,
        max_tokens=config.max_tokens,
        response_format={"type": "json_object"},
    )

    if not completion.choices:
        raise ValueError("Модель не вернула ни одного choice.")

    content = completion.choices[0].message.content
    if content is None or not str(content).strip():
        raise ValueError("Модель вернула пустой content.")

    return content


def _call_model(
    messages: list[dict[str, str]],
    *,
    config: LLMConfig,
    retry_delay: RetryDelay | None = None,
) -> str:
    max_retries = config.retry.max_retries
    if max_retries < 0:
        raise ValueError("max_retries не может быть отрицательным.")

    effective_retry_delay: RetryDelay = (
        retry_delay if retry_delay is not None else config.retry.retry_delay_seconds
    )
    current_delay = (
        config.retry.retry_delay_seconds
        if not callable(effective_retry_delay)
        else config.retry.retry_delay_seconds
    )

    last_exc: Exception | None = None

    for attempt in range(max_retries + 1):
        try:
            return _call_model_once(messages, config=config)
        except Exception as exc:
            last_exc = exc
            if attempt == max_retries:
                break

            sleep_for = _resolve_retry_delay(effective_retry_delay, current_delay)
            time.sleep(sleep_for)
            current_delay = sleep_for

    assert last_exc is not None
    raise last_exc


async def _acall_model(
    messages: list[dict[str, str]],
    *,
    config: LLMConfig,
    retry_delay: RetryDelay | None = None,
    semaphore: asyncio.Semaphore | None = None,
) -> str:
    max_retries = config.retry.max_retries
    if max_retries < 0:
        raise ValueError("max_retries не может быть отрицательным.")

    effective_retry_delay: RetryDelay = (
        retry_delay if retry_delay is not None else config.retry.retry_delay_seconds
    )
    current_delay = config.retry.retry_delay_seconds

    last_exc: Exception | None = None

    async def _run_once() -> str:
        return await _acall_model_once(messages, config=config)

    for attempt in range(max_retries + 1):
        try:
            if semaphore is None:
                return await _run_once()
            async with semaphore:
                return await _run_once()
        except Exception as exc:
            last_exc = exc
            if attempt == max_retries:
                break

            sleep_for = _resolve_retry_delay(effective_retry_delay, current_delay)
            await asyncio.sleep(sleep_for)
            current_delay = sleep_for

    assert last_exc is not None
    raise last_exc


def parse_llm_response(raw_text: str) -> LLMResponse:
    try:
        payload = json.loads(raw_text)
    except json.JSONDecodeError as exc:
        raise ValueError(f"LLM вернула невалидный JSON: {exc}") from exc

    try:
        return LLMResponse.model_validate(payload)
    except ValidationError as exc:
        raise ValueError(f"LLM вернула JSON, не соответствующий схеме: {exc}") from exc


def generate_chat_response(
    request: ChatRequest,
    config: LLMConfig,
    *,
    retry_delay: RetryDelay | None = None,
) -> LLMResponse:
    messages = build_prompt(request)
    raw_text = _call_model(messages, config=config, retry_delay=retry_delay)
    return parse_llm_response(raw_text)


def generate_encouragement_response(
    request: EncouragementRequest,
    config: LLMConfig,
    *,
    retry_delay: RetryDelay | None = None,
) -> LLMResponse:
    messages = build_encouragement_prompt(request)
    raw_text = _call_model(messages, config=config, retry_delay=retry_delay)
    return parse_llm_response(raw_text)


async def agenerate_chat_response(
    request: ChatRequest,
    config: LLMConfig,
    *,
    retry_delay: RetryDelay | None = None,
    semaphore: asyncio.Semaphore | None = None,
) -> LLMResponse:
    messages = build_prompt(request)
    raw_text = await _acall_model(
        messages,
        config=config,
        retry_delay=retry_delay,
        semaphore=semaphore,
    )
    return parse_llm_response(raw_text)


async def agenerate_encouragement_response(
    request: EncouragementRequest,
    config: LLMConfig,
    *,
    retry_delay: RetryDelay | None = None,
    semaphore: asyncio.Semaphore | None = None,
) -> LLMResponse:
    messages = build_encouragement_prompt(request)
    raw_text = await _acall_model(
        messages,
        config=config,
        retry_delay=retry_delay,
        semaphore=semaphore,
    )
    return parse_llm_response(raw_text)


async def agenerate_chat_responses(
    requests: list[ChatRequest],
    config: LLMConfig,
    *,
    retry_delay: RetryDelay | None = None,
    max_concurrency: int | None = None,
) -> list[LLMResponse]:
    effective_max_concurrency = (
        max_concurrency if max_concurrency is not None else config.async_config.max_concurrency
    )
    if effective_max_concurrency <= 0:
        raise ValueError("max_concurrency должен быть больше 0.")

    semaphore = asyncio.Semaphore(effective_max_concurrency)

    tasks = [
        agenerate_chat_response(
            request,
            config,
            retry_delay=retry_delay,
            semaphore=semaphore,
        )
        for request in requests
    ]
    return await asyncio.gather(*tasks)


async def agenerate_encouragement_responses(
    requests: list[EncouragementRequest],
    config: LLMConfig,
    *,
    retry_delay: RetryDelay | None = None,
    max_concurrency: int | None = None,
) -> list[LLMResponse]:
    effective_max_concurrency = (
        max_concurrency if max_concurrency is not None else config.async_config.max_concurrency
    )
    if effective_max_concurrency <= 0:
        raise ValueError("max_concurrency должен быть больше 0.")

    semaphore = asyncio.Semaphore(effective_max_concurrency)

    tasks = [
        agenerate_encouragement_response(
            request,
            config,
            retry_delay=retry_delay,
            semaphore=semaphore,
        )
        for request in requests
    ]
    return await asyncio.gather(*tasks)