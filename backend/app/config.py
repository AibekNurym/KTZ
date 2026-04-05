from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    # Database
    postgres_user: str = "ktz"
    postgres_password: str = "ktz_secret_2026"
    postgres_db: str = "ktz"
    database_url: str = "postgresql+asyncpg://ktz:ktz_secret_2026@db:5432/ktz"

    # Redis
    redis_url: str = "redis://redis:6379/0"

    # JWT
    jwt_secret: str = "change-me-to-a-random-string-in-production"
    jwt_expiration_minutes: int = 480

    # Logging
    log_level: str = "INFO"

    # Data retention
    retention_hours: int = 72

    # Backend
    backend_host: str = "0.0.0.0"
    backend_port: int = 8000

    class Config:
        env_file = ".env"
        extra = "ignore"


settings = Settings()
