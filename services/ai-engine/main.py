import socketio
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager

from config import get_settings
from routers import voice, transactions, udhari, dashboard, forecast, payscore, gst, customers, schemes, employees, whatsapp, briefing, demo, paytm, recurring, vendors

settings = get_settings()

# Socket.IO server
sio = socketio.AsyncServer(
    async_mode="asgi",
    cors_allowed_origins=settings.cors_origins,
    logger=settings.debug,
)


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Startup and shutdown events"""
    print("🚀 MunimAI Backend Starting...")
    print(f"   Environment: {settings.environment}")
    print(f"   Groq Model: {settings.groq_model}")
    # Initialize services
    from models.db import init_supabase
    init_supabase()
    print("   ✅ Supabase connected")
    yield
    print("👋 MunimAI Backend Shutting Down...")


# FastAPI app
app = FastAPI(
    title="MunimAI API",
    description="Agentic AI Business Operating System for Indian SMBs",
    version="1.0.0",
    lifespan=lifespan,
)

# CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins + ["*"],  # Permissive for development
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Mount routers
app.include_router(voice.router, prefix="/api/voice", tags=["Voice"])
app.include_router(transactions.router, prefix="/api/transactions", tags=["Transactions"])
app.include_router(udhari.router, prefix="/api/udhari", tags=["Udhari"])
app.include_router(dashboard.router, prefix="/api/dashboard", tags=["Dashboard"])
app.include_router(forecast.router, prefix="/api/forecast", tags=["Forecast"])
app.include_router(payscore.router, prefix="/api/payscore", tags=["PayScore"])
app.include_router(gst.router, prefix="/api/gst", tags=["GST"])
app.include_router(customers.router, prefix="/api/customers", tags=["Customers"])
app.include_router(schemes.router, prefix="/api/schemes", tags=["Schemes"])
app.include_router(employees.router, prefix="/api/employees", tags=["Employees"])
app.include_router(whatsapp.router, prefix="/api/whatsapp", tags=["WhatsApp"])
app.include_router(briefing.router, prefix="/api/briefing", tags=["Briefing"])
app.include_router(demo.router, prefix="/api/demo", tags=["Demo"])
app.include_router(paytm.router, prefix="/api/paytm", tags=["Paytm"])
app.include_router(recurring.router, prefix="/api/recurring", tags=["Recurring"])
app.include_router(vendors.router)

# Mount Socket.IO on FastAPI
socket_app = socketio.ASGIApp(sio, other_asgi_app=app)


# Socket.IO events
@sio.event
async def connect(sid, environ):
    print(f"🔌 Client connected: {sid}")


@sio.event
async def disconnect(sid):
    print(f"🔌 Client disconnected: {sid}")


@sio.event
async def join_merchant(sid, data):
    """Subscribe to a merchant's real-time updates"""
    merchant_id = data.get("merchant_id")
    if merchant_id:
        await sio.enter_room(sid, f"merchant_{merchant_id}")
        print(f"📡 {sid} joined room: merchant_{merchant_id}")


@app.get("/")
async def root():
    return {
        "name": "MunimAI API",
        "version": "1.0.0",
        "status": "running",
        "tagline": "The Agentic AI That Runs Your Business",
    }


@app.get("/health")
async def health():
    # Check Supabase
    supabase_status = "connected"
    try:
        from models.db import get_client
        get_client().table("merchants").select("id").limit(1).execute()
    except Exception:
        supabase_status = "disconnected"

    # Check Groq
    groq_status = "connected"
    try:
        if settings.groq_api_key:
            groq_status = "connected"
        else:
            groq_status = "disconnected"
    except Exception:
        groq_status = "disconnected"

    return {
        "status": "healthy",
        "supabase": supabase_status,
        "database": supabase_status,
        "groq": groq_status,
        "llm": groq_status,
    }


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(
        "main:socket_app",
        host=settings.api_host,
        port=settings.api_port,
        reload=settings.debug,
    )
