from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

try:
    from routes import router as llm_router
except ImportError:
    from src.routes import router as llm_router

from .notifications import router as notifications_router

app = FastAPI(title="Agile Board LLM API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(llm_router)
app.include_router(notifications_router)