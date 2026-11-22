"""
Раздача фронтенда (HTML + JS + CSS) через FastAPI.
Чтобы не запускать отдельный Node.js-сервер.

Как использовать:
    В main.py бэкендера добавить:
        from app.frontend_serve import setup_frontend
        setup_frontend(app)
    
После этого фронт будет доступен по адресу:
    http://localhost:8000/
"""
from pathlib import Path
from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse


def setup_frontend(app: FastAPI, static_dir: str = "static"):
    """
    Подключает раздачу статики к FastAPI-приложению.
    
    Параметры:
        app: FastAPI-приложение
        static_dir: путь к папке с файлами фронта (HTML/JS/CSS)
    """
    # Путь к папке со статикой
    static_path = Path(static_dir)
    
    # Создаём папку, если её нет
    static_path.mkdir(parents=True, exist_ok=True)
    
    # Монтируем папку /static для JS и CSS файлов
    app.mount("/static", StaticFiles(directory=static_path), name="static")
    
    # Главная страница — отдаём index.html
    @app.get("/")
    async def serve_index():
        index_file = static_path / "index.html"
        if not index_file.exists():
            return {
                "status": "ok",
                "message": "Cyber Garden Backend is running",
                "docs": "/docs",
                "frontend": "Положи index.html в папку static/"
            }
        return FileResponse(index_file)
    
    # Favicon (опционально)
    @app.get("/favicon.ico")
    async def favicon():
        favicon_file = static_path / "favicon.ico"
        if favicon_file.exists():
            return FileResponse(favicon_file)
        return {"status": "no favicon"}