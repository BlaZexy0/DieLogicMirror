"""E-Mail-Versand mit austauschbarem Transport, nur Standardbibliothek.

DIELOGIC_MAIL wählt den Weg:
  off      (Standard) es wird nichts verschickt; Einladungslinks werden zum
           Kopieren angezeigt, „Passwort vergessen" bleibt aus
  log      die Mail landet nur im Server-Log (Entwicklung: der Link steht im
           Terminal und lässt sich lokal durchspielen)
  memory   wie log, zusätzlich in OUTBOX gesammelt (Tests)
  smtp     über ein Postfach: DIELOGIC_SMTP_HOST, _PORT (587), _USER,
           _PASSWORD, _STARTTLS (1)
  resend   über resend.com: DIELOGIC_RESEND_KEY
Absender: DIELOGIC_MAIL_FROM (z. B. „DieLogic <no-reply@dielogic.de>").

send() wirft nie in den Aufrufer hinein: ein gescheiterter Versand steht im
Log, die Antwort der API sagt „nicht verschickt", die Site läuft weiter.
"""

from __future__ import annotations

import json
import logging
import os
import smtplib
import urllib.request
from email.message import EmailMessage

log = logging.getLogger("uvicorn.error")

OUTBOX: list[dict] = []          # nur für DIELOGIC_MAIL=memory


def transport() -> str:
    return os.environ.get("DIELOGIC_MAIL", "off").strip().lower() or "off"


def enabled() -> bool:
    """Gibt es einen Weg, Mails zu verschicken? Steuert, ob die Site
    „Passwort vergessen" und den Versand von Einladungen anbietet."""
    return transport() in ("log", "memory", "smtp", "resend")


def sender() -> str:
    return os.environ.get("DIELOGIC_MAIL_FROM", "").strip() or "DieLogic <no-reply@dielogic.de>"


def send(to: str, subject: str, text: str, html: str | None = None) -> bool:
    """Eine Mail verschicken. True, wenn der Transport sie angenommen hat."""
    kind = transport()
    if kind == "off":
        return False
    try:
        if kind in ("log", "memory"):
            log.info("MAIL an %s | %s\n%s", to, subject, text)
            if kind == "memory":
                OUTBOX.append({"to": to, "subject": subject, "text": text, "html": html})
            return True
        if kind == "smtp":
            return _smtp(to, subject, text, html)
        if kind == "resend":
            return _resend(to, subject, text, html)
        log.warning("DIELOGIC_MAIL=%r ist unbekannt; nichts verschickt.", kind)
        return False
    except Exception:
        log.exception("Mail an %s (%s) konnte nicht verschickt werden.", to, subject)
        return False


def _smtp(to: str, subject: str, text: str, html: str | None) -> bool:
    host = os.environ.get("DIELOGIC_SMTP_HOST", "").strip()
    if not host:
        log.warning("DIELOGIC_MAIL=smtp, aber DIELOGIC_SMTP_HOST fehlt.")
        return False
    port = int(os.environ.get("DIELOGIC_SMTP_PORT", "587") or 587)
    user = os.environ.get("DIELOGIC_SMTP_USER", "")
    password = os.environ.get("DIELOGIC_SMTP_PASSWORD", "")
    starttls = os.environ.get("DIELOGIC_SMTP_STARTTLS", "1").strip() not in ("0", "false", "no")
    msg = EmailMessage()
    msg["From"], msg["To"], msg["Subject"] = sender(), to, subject
    msg.set_content(text)
    if html:
        msg.add_alternative(html, subtype="html")
    with smtplib.SMTP(host, port, timeout=15) as s:
        if starttls:
            s.starttls()
        if user:
            s.login(user, password)
        s.send_message(msg)
    return True


def _resend(to: str, subject: str, text: str, html: str | None) -> bool:
    key = os.environ.get("DIELOGIC_RESEND_KEY", "").strip()
    if not key:
        log.warning("DIELOGIC_MAIL=resend, aber DIELOGIC_RESEND_KEY fehlt.")
        return False
    body = {"from": sender(), "to": [to], "subject": subject, "text": text}
    if html:
        body["html"] = html
    req = urllib.request.Request("https://api.resend.com/emails", data=json.dumps(body).encode(),
                                 headers={"Authorization": "Bearer " + key, "Content-Type": "application/json"},
                                 method="POST")
    with urllib.request.urlopen(req, timeout=15) as r:
        return 200 <= r.status < 300


# ── Vorlagen (deutsch, Text + schlichtes HTML) ────────────────────────

def _wrap_html(title: str, lines: list[str], link: str | None, button: str | None) -> str:
    body = "".join(f'<p style="margin:0 0 .8em">{ln}</p>' for ln in lines)
    btn = ""
    if link:
        btn = (f'<p style="margin:1.2em 0"><a href="{link}" style="background:#008c82;color:#fff;'
               f'padding:.6em 1.1em;border-radius:8px;text-decoration:none;font-weight:600">{button}</a></p>'
               f'<p style="font-size:.85em;color:#4c6870">Oder diesen Link öffnen: <a href="{link}">{link}</a></p>')
    return (f'<div style="font-family:Inter,Segoe UI,Arial,sans-serif;font-size:15px;line-height:1.5;color:#002733;'
            f'max-width:560px"><h2 style="font-size:1.2em;margin:0 0 .8em">{title}</h2>{body}{btn}</div>')


def invite_mail(org_name: str, inviter: str, url: str, days: int) -> tuple[str, str, str]:
    subject = f"Einladung zu DieLogic: {org_name}"
    lines = [f"{inviter} hat Sie in die Organisation {org_name} bei DieLogic eingeladen.",
             f"Mit dem Link legen Sie Namen und Passwort fest; er gilt {days} Tage und lässt sich einmal einlösen.",
             "Wenn Sie diese Einladung nicht erwartet haben, können Sie die Mail ignorieren."]
    text = "\n\n".join(lines) + "\n\n" + url + "\n"
    return subject, text, _wrap_html("Einladung zu DieLogic", lines, url, "Einladung annehmen")


def reset_mail(to: str, url: str, minutes: int) -> tuple[str, str, str]:
    subject = "DieLogic: Passwort zurücksetzen"
    lines = [f"Für das Konto {to} wurde ein neues Passwort angefordert.",
             f"Mit dem Link legen Sie ein neues fest; er gilt {minutes} Minuten und lässt sich einmal nutzen.",
             "Wenn Sie das nicht waren, ignorieren Sie diese Mail; das Passwort bleibt unverändert."]
    text = "\n\n".join(lines) + "\n\n" + url + "\n"
    return subject, text, _wrap_html("Passwort zurücksetzen", lines, url, "Neues Passwort festlegen")


def password_changed_mail(to: str) -> tuple[str, str, str]:
    subject = "DieLogic: Ihr Passwort wurde geändert"
    lines = [f"Das Passwort für das Konto {to} wurde soeben geändert; alle anderen Anmeldungen wurden beendet.",
             "Wenn Sie das nicht waren, setzen Sie das Passwort sofort über „Passwort vergessen\" neu und "
             "informieren Sie den Administrator Ihrer Organisation."]
    return subject, "\n\n".join(lines) + "\n", _wrap_html("Passwort geändert", lines, None, None)
