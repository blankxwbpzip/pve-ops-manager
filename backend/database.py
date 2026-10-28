import os
from sqlalchemy import create_engine
from sqlalchemy.orm import declarative_base, sessionmaker

DB_URL = os.getenv("DB_URL", "sqlite:///./pve_manager.db")

engine = create_engine(
    DB_URL, connect_args={"check_same_thread": False} if "sqlite" in DB_URL else {}
)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()