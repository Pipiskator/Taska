from __future__ import annotations

from functools import lru_cache

from pydantic import BaseModel, Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class RetryConfig(BaseModel):
    max_retries: int = Field(default=0, ge=0)
    retry_delay_seconds: float = Field(default=1.0, ge=0.0)


class AsyncConfig(BaseModel):
    max_concurrency: int = Field(default=3, gt=0)


class LLMConfig(BaseModel):
    model: str = Field(default="deepseek-chat")
    base_url: str = Field(default="https://api.deepseek.com")
    api_key: str

    temperature: float = Field(default=0.2)
    max_tokens: int = Field(default=2000, gt=0)
    timeout: float = Field(default=60.0, gt=0)

    retry: RetryConfig = Field(default_factory=RetryConfig)
    async_config: AsyncConfig = Field(default_factory=AsyncConfig)


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    llm_model: str = Field(default="deepseek-chat")
    llm_base_url: str = Field(default="https://api.deepseek.com")
    llm_api_key: str

    llm_temperature: float = Field(default=0.2)
    llm_max_tokens: int = Field(default=2000)
    llm_timeout: float = Field(default=60.0)

    llm_max_retries: int = Field(default=0)
    llm_retry_delay_seconds: float = Field(default=1.0)

    llm_max_concurrency: int = Field(default=3)

    def get_llm_config(self) -> LLMConfig:
        return LLMConfig(
            model=self.llm_model,
            base_url=self.llm_base_url,
            api_key=self.llm_api_key,
            temperature=self.llm_temperature,
            max_tokens=self.llm_max_tokens,
            timeout=self.llm_timeout,
            retry=RetryConfig(
                max_retries=self.llm_max_retries,
                retry_delay_seconds=self.llm_retry_delay_seconds,
            ),
            async_config=AsyncConfig(
                max_concurrency=self.llm_max_concurrency,
            ),
        )


@lru_cache
def get_settings() -> Settings:
    return Settings()