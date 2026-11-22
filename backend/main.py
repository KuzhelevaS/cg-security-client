from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from backend.frontend_serve import setup_frontend  # ← ДОБАВИТЬ

app = FastAPI(title="Cyber Garden Backend")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:8888",
        "http://127.0.0.1:8888",
        "http://localhost:3000",  # на всякий случай
        "http://127.0.0.1:3000",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ... остальные роуты бэкендера ...

@app.get("/api/health")
def health():
    return {"status": "ok"}

# Подключаем фронт (в самом конце!)
setup_frontend(app, static_dir="static")  # ← ДОБАВИТЬ