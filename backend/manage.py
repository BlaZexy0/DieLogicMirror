"""Verwaltungs-CLI: Organisationen, Einladungen, Benutzer.

Aufruf aus dem Repo-Root (DATABASE_URL wie beim Server, sonst SQLite):

    python -m backend.manage init
    python -m backend.manage create-org acme "ACME Druckguss GmbH"
    python -m backend.manage invite jane@acme.de --org acme [--admin] [--base-url https://dielogic.de]
    python -m backend.manage disable jane@acme.de
    python -m backend.manage set-role jane@acme.de admin

Offene Einladungen, Mitglieder und weitere Einladungen verwaltet die
Konto-Seite (/konto/); die CLI ist für den Start ohne Browser-Zugang.
"""

from __future__ import annotations

import argparse
import sys

from sqlalchemy import func, select

from .auth import create_invite, invite_url
from .db import AuthSession, Org, SessionLocal, User, init_db


def _org(db, slug: str) -> Org:
    org = db.scalar(select(Org).where(Org.slug == slug))
    if not org:
        sys.exit(f"Organisation '{slug}' gibt es nicht — erst create-org.")
    return org


def cmd_init(_args):
    init_db()
    print("Datenbank-Schema angelegt/aktuell.")


def cmd_create_org(args):
    with SessionLocal() as db:
        if db.scalar(select(Org).where(Org.slug == args.slug)):
            sys.exit(f"Slug '{args.slug}' ist vergeben.")
        org = Org(slug=args.slug.lower(), name=args.name)
        db.add(org)
        db.commit()
        print(f"Organisation {org.slug} ({org.name}) angelegt.")


def cmd_invite(args):
    with SessionLocal() as db:
        org = _org(db, args.org)
        try:
            inv = create_invite(db, org, args.email, "admin" if args.admin else "member")
        except ValueError as error:
            sys.exit(str(error))
        print(f"Einladung für {inv.email} ({inv.role}) in {org.slug}, gültig bis {inv.expires_at:%Y-%m-%d}:")
        print("  " + invite_url(args.base_url, inv.token))


def _guard_last_admin(db, user, was: str, force: bool = False) -> None:
    """Eine Organisation ohne aktiven Administrator ist eine Sackgasse.

    Ohne Admin lassen sich weder Mitglieder einladen noch Stammdaten pflegen
    noch Passwörter zurücksetzen — und es gibt keinen Weg zurück, denn dafür
    bräuchte es einen Admin. Über die HTTP-Schnittstelle ist der Fall nicht
    erreichbar (das eigene Konto ist ohnehin gesperrt); hier auf der
    Kommandozeile war er es. --force lässt es ausdrücklich zu.
    """
    if user.role != "admin" or user.disabled:
        return
    rest = db.scalar(select(func.count()).select_from(User).where(
        User.org_id == user.org_id, User.role == "admin",
        User.disabled.is_(False), User.id != user.id))
    if rest:
        return
    if force:
        print(f"WARNUNG: {user.email} ist der letzte aktive Administrator — "
              f"die Organisation bleibt ohne Verwaltung zurück.")
        return
    sys.exit(f"{user.email} ist der letzte aktive Administrator dieser Organisation. "
             f"Erst einen weiteren ernennen — oder mit --force ausdrücklich {was}.")


def cmd_disable(args):
    with SessionLocal() as db:
        user = db.scalar(select(User).where(User.email == args.email.lower()))
        if not user:
            sys.exit("Unbekannte E-Mail-Adresse.")
        _guard_last_admin(db, user, "deaktivieren", args.force)
        user.disabled = True
        for sess in db.scalars(select(AuthSession).where(AuthSession.user_id == user.id)).all():
            db.delete(sess)
        db.commit()
        print(f"{user.email} deaktiviert, Sitzungen beendet.")


def cmd_set_role(args):
    with SessionLocal() as db:
        user = db.scalar(select(User).where(User.email == args.email.lower()))
        if not user:
            sys.exit("Unbekannte E-Mail-Adresse.")
        if args.role != "admin":
            _guard_last_admin(db, user, "herabstufen", args.force)
        user.role = args.role
        db.commit()
        print(f"{user.email} ist jetzt {user.role}.")


def main(argv=None):
    ap = argparse.ArgumentParser(prog="backend.manage", description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = ap.add_subparsers(dest="cmd", required=True)
    sub.add_parser("init").set_defaults(fn=cmd_init)

    p = sub.add_parser("create-org")
    p.add_argument("slug")
    p.add_argument("name")
    p.set_defaults(fn=cmd_create_org)

    p = sub.add_parser("invite")
    p.add_argument("email")
    p.add_argument("--org", required=True)
    p.add_argument("--admin", action="store_true")
    p.add_argument("--base-url", default="http://127.0.0.1:8000")
    p.set_defaults(fn=cmd_invite)

    p = sub.add_parser("disable")
    p.add_argument("email")
    p.add_argument("--force", action="store_true",
                   help="auch den letzten aktiven Administrator deaktivieren")
    p.set_defaults(fn=cmd_disable)

    p = sub.add_parser("set-role")
    p.add_argument("email")
    p.add_argument("role", choices=["admin", "member"])
    p.add_argument("--force", action="store_true",
                   help="auch den letzten aktiven Administrator herabstufen")
    p.set_defaults(fn=cmd_set_role)

    args = ap.parse_args(argv)
    init_db()
    args.fn(args)


if __name__ == "__main__":
    main()
