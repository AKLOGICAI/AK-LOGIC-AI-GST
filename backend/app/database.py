from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine
from sqlalchemy.orm import DeclarativeBase

from .config import settings

engine = create_async_engine(
    settings.database_url,
    echo=False,
    future=True,
    pool_size=5,
    max_overflow=10,
    pool_recycle=300,
    pool_pre_ping=True
)
SessionLocal = async_sessionmaker(engine, expire_on_commit=False)


class Base(DeclarativeBase):
    pass


async def get_db():
    async with SessionLocal() as session:
        yield session
