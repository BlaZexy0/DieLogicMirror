"""Datenbankschicht: Engine, Session und ORM-Modelle.

Mandantenmodell (B2B): eine Organisation (Gießerei, Büro) hat Benutzer und
besitzt die Projekte — Projekte gehören der Firma, nicht der Person.
Jede Speicherung eines Projekts ist eine neue, unveränderliche Revision
(Autor + Zeitstempel): nachvollziehbar und jederzeit wiederherstellbar.

Verbindung über DATABASE_URL (Postgres auf Render, z. B.
postgresql+psycopg://…); ohne Variable eine lokale SQLite-Datei unter
data/dielogic.db — für Entwicklung und Tests.
"""

from __future__ import annotations

import os
import secrets
import uuid
from datetime import datetime, timezone
from pathlib import Path

from sqlalchemy import (JSON, Boolean, DateTime, ForeignKey, Integer, String, Text,
                        UniqueConstraint, create_engine, event)
from sqlalchemy.orm import (DeclarativeBase, Mapped, Session, mapped_column,
                            relationship, sessionmaker)

ROOT = Path(__file__).resolve().parent.parent


def database_url() -> str:
    url = os.environ.get("DATABASE_URL", "").strip()
    if not url:
        data_dir = ROOT / "data"
        data_dir.mkdir(exist_ok=True)
        return f"sqlite:///{data_dir / 'dielogic.db'}"
    # Render/Heroku liefern postgres:// — SQLAlchemy 2 will den Treiber im Schema.
    if url.startswith("postgres://"):
        url = "postgresql+psycopg://" + url[len("postgres://"):]
    elif url.startswith("postgresql://"):
        url = "postgresql+psycopg://" + url[len("postgresql://"):]
    return url


def make_engine(url: str | None = None):
    url = url or database_url()
    kwargs = {}
    if url.startswith("sqlite"):
        kwargs["connect_args"] = {"check_same_thread": False}
    engine = create_engine(url, future=True, **kwargs)
    if url.startswith("sqlite"):
        @event.listens_for(engine, "connect")
        def _fk_on(dbapi_conn, _record):  # Fremdschlüssel in SQLite aktivieren
            dbapi_conn.execute("PRAGMA foreign_keys=ON")
    return engine


engine = make_engine()
SessionLocal = sessionmaker(bind=engine, expire_on_commit=False, future=True)


def now() -> datetime:
    return datetime.now(timezone.utc)


def aware(dt: datetime) -> datetime:
    """dt mit Zeitzone — SQLite gibt naive (UTC-)Zeitstempel zurück, die
    sonst als Ortszeit gelesen werden (Browser) oder sich nicht mit
    now() vergleichen lassen (naiv vs. bewusst wirft TypeError)."""
    return dt if dt.tzinfo is not None else dt.replace(tzinfo=timezone.utc)


def iso(dt: datetime | None) -> str | None:
    """ISO-8601 mit Zeitzone, None bleibt None."""
    return aware(dt).isoformat() if dt is not None else None


def new_id() -> str:
    return uuid.uuid4().hex


def new_token() -> str:
    return secrets.token_urlsafe(32)


class Base(DeclarativeBase):
    pass


class Org(Base):
    __tablename__ = "orgs"
    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=new_id)
    slug: Mapped[str] = mapped_column(String(64), unique=True, nullable=False)
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)

    users: Mapped[list["User"]] = relationship(back_populates="org")


class User(Base):
    __tablename__ = "users"
    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=new_id)
    org_id: Mapped[str] = mapped_column(ForeignKey("orgs.id"), nullable=False, index=True)
    email: Mapped[str] = mapped_column(String(320), unique=True, nullable=False)
    name: Mapped[str] = mapped_column(String(200), nullable=False, default="")
    pw_hash: Mapped[str] = mapped_column(String(400), nullable=False)
    role: Mapped[str] = mapped_column(String(16), nullable=False, default="member")  # admin | member
    disabled: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)

    org: Mapped[Org] = relationship(back_populates="users")


class Invite(Base):
    """Einladung per Link: nur wer einen gültigen Token hat, kann ein Konto
    anlegen — keine offene Registrierung."""
    __tablename__ = "invites"
    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=new_id)
    org_id: Mapped[str] = mapped_column(ForeignKey("orgs.id"), nullable=False, index=True)
    email: Mapped[str] = mapped_column(String(320), nullable=False)
    token: Mapped[str] = mapped_column(String(64), unique=True, nullable=False, default=new_token)
    role: Mapped[str] = mapped_column(String(16), nullable=False, default="member")
    created_by: Mapped[str | None] = mapped_column(ForeignKey("users.id"), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)
    expires_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    used_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    org: Mapped[Org] = relationship()


class AuthSession(Base):
    __tablename__ = "sessions"
    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=new_id)
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    token: Mapped[str] = mapped_column(String(64), unique=True, nullable=False, default=new_token)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)

    user: Mapped[User] = relationship()


class Project(Base):
    __tablename__ = "projects"
    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=new_id)
    org_id: Mapped[str] = mapped_column(ForeignKey("orgs.id"), nullable=False, index=True)
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    description: Mapped[str] = mapped_column(Text, nullable=False, default="")
    customer: Mapped[str] = mapped_column(String(200), nullable=False, default="")
    part_no: Mapped[str] = mapped_column(String(100), nullable=False, default="")
    head_rev: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    # Arbeitsstand: wird vom Client laufend synchronisiert (Autosave); eine
    # Revision ist ein bewusst benannter Schnappschuss davon.
    draft: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    draft_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_by: Mapped[str | None] = mapped_column(ForeignKey("users.id"), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)
    archived_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    revisions: Mapped[list["ProjectRevision"]] = relationship(
        back_populates="project", cascade="all, delete-orphan", order_by="ProjectRevision.rev")


class ProjectRevision(Base):
    """Unveränderlicher Stand eines Projekts (alle Werkzeug-Abschnitte als JSON)."""
    __tablename__ = "project_revisions"
    __table_args__ = (UniqueConstraint("project_id", "rev"),)
    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=new_id)
    project_id: Mapped[str] = mapped_column(ForeignKey("projects.id", ondelete="CASCADE"), nullable=False, index=True)
    rev: Mapped[int] = mapped_column(Integer, nullable=False)
    data: Mapped[dict] = mapped_column(JSON, nullable=False)
    note: Mapped[str] = mapped_column(String(500), nullable=False, default="")
    created_by: Mapped[str | None] = mapped_column(ForeignKey("users.id"), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)

    project: Mapped[Project] = relationship(back_populates="revisions")
    author: Mapped[User | None] = relationship()


class OrgSetting(Base):
    """Stammdaten der Organisation: je Schlüssel (machines, alloys, parts,
    kosten) ein JSON-Dokument — die Presets der Firma statt der Beispiele
    aus web/shared/examples/*.js."""
    __tablename__ = "org_settings"
    __table_args__ = (UniqueConstraint("org_id", "key"),)
    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=new_id)
    org_id: Mapped[str] = mapped_column(ForeignKey("orgs.id"), nullable=False, index=True)
    key: Mapped[str] = mapped_column(String(32), nullable=False)
    data: Mapped[dict] = mapped_column(JSON, nullable=False)
    updated_by: Mapped[str | None] = mapped_column(ForeignKey("users.id"), nullable=True)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)


def init_db(bind=None) -> None:
    Base.metadata.create_all(bind or engine)


def get_db():
    """FastAPI-Dependency: eine Session je Request."""
    db: Session = SessionLocal()
    try:
        yield db
    finally:
        db.close()
