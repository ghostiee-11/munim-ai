from pydantic_settings import BaseSettings
from functools import lru_cache


class Settings(BaseSettings):
    # API
    api_host: str = "0.0.0.0"
    api_port: int = 8000
    cors_origins: list[str] = ["http://localhost:3000", "https://*.vercel.app"]

    # Groq
    groq_api_key: str = ""
    groq_model: str = "llama-3.3-70b-versatile"
    groq_whisper_model: str = "whisper-large-v3"

    # Supabase
    supabase_url: str = ""
    supabase_key: str = ""

    # Redis
    redis_url: str = "redis://localhost:6379"

    # OpenAI (Whisper STT fallback)
    openai_api_key: str = ""

    # ElevenLabs (Scribe v2 STT)
    elevenlabs_api_key: str = ""

    # Gemini
    gemini_api_key: str = ""

    # Sarvam AI (TTS)
    sarvam_api_key: str = ""

    # Twilio (WhatsApp + SMS + Voice)
    twilio_account_sid: str = ""
    twilio_auth_token: str = ""
    twilio_whatsapp_number: str = "whatsapp:+14155238886"
    twilio_phone_number: str = ""

    # Tavily (Web Search for schemes)
    tavily_api_key: str = ""

    # WhatsApp Business API (legacy - replaced by Twilio)
    whatsapp_token: str = ""
    whatsapp_phone_id: str = ""
    whatsapp_verify_token: str = "munim-ai-verify"

    # App
    environment: str = "development"
    debug: bool = True

    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"


@lru_cache()
def get_settings() -> Settings:
    return Settings()
