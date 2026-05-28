"""HTML + plaintext templates for transactional emails.

Hand-written inline-styled HTML — keeps zero new deps (no Jinja2, no
premailer) and works across Gmail / Apple Mail / Outlook. If template
count grows past 2 we should switch to premailer + external CSS; one
template is small enough to be tractable here.
"""

from datetime import date

from app.schemas.task import TaskPriority


def _format_due(due_date: date) -> str:
    # "May 24" not "May 24, 2026" — recipients are mid-week, the year is noise.
    # %-d strips zero padding; fine on Mac/Linux where the API runs.
    return due_date.strftime("%b %-d")


# Inline pill colors for each priority. Match the frontend's priority
# palette so the email reads consistent with the in-app card.
_PRIORITY_PILL: dict[TaskPriority, tuple[str, str, str]] = {
    # (bg, border, text)
    "urgent": ("#fee2e2", "#fecaca", "#b91c1c"),
    "high": ("#ffedd5", "#fed7aa", "#c2410c"),
    "medium": ("#fef9c3", "#fef08a", "#a16207"),
    "low": ("#f1f5f9", "#e2e8f0", "#475569"),
    "no_priority": ("#f1f5f9", "#e2e8f0", "#94a3b8"),
}

_PRIORITY_LABEL: dict[TaskPriority, str] = {
    "urgent": "Urgent",
    "high": "High",
    "medium": "Medium",
    "low": "Low",
    "no_priority": "No priority",
}


def _priority_pill_html(priority: TaskPriority) -> str:
    bg, border, fg = _PRIORITY_PILL[priority]
    label = _PRIORITY_LABEL[priority]
    return (
        f'<span style="display:inline-block;background:{bg};border:1px solid {border};'
        f'color:{fg};font-size:11px;font-weight:600;padding:2px 8px;border-radius:999px;'
        f'text-transform:uppercase;letter-spacing:0.04em;">{label}</span>'
    )


def render_assignment_email(
    *,
    assignee_name: str,
    actor_name: str,
    project_name: str,
    task_identifier: str,
    task_title: str,
    task_priority: TaskPriority,
    due_date: date | None,
    task_url: str,
    settings_url: str,
) -> tuple[str, str]:
    """Return (html, plaintext) for a task-assignment email."""

    due_line_html = (
        f'<p style="margin:8px 0 0;color:#64748b;font-size:13px;">Due {_format_due(due_date)}</p>'
        if due_date else ""
    )
    due_line_text = f"\n  Due {_format_due(due_date)}" if due_date else ""

    html = f"""<!doctype html>
<html><body style="margin:0;padding:0;background:#f8fafc;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
<table role="presentation" cellpadding="0" cellspacing="0" border="0" align="center" width="560" style="max-width:560px;margin:32px auto;background:#ffffff;border:1px solid #e2e8f0;border-radius:12px;">
  <tr><td style="padding:32px 32px 8px;">
    <p style="margin:0;color:#0f172a;font-size:14px;line-height:1.5;">Hi {assignee_name},</p>
    <p style="margin:8px 0 24px;color:#0f172a;font-size:14px;line-height:1.5;"><strong>{actor_name}</strong> assigned you a task in <strong>{project_name}</strong>.</p>
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;margin-bottom:24px;">
      <tr><td style="padding:16px;">
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
          <tr>
            <td style="color:#64748b;font-size:12px;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;">{task_identifier}</td>
            <td align="right">{_priority_pill_html(task_priority)}</td>
          </tr>
        </table>
        <p style="margin:6px 0 0;color:#0f172a;font-size:16px;font-weight:600;line-height:1.4;">{task_title}</p>
        {due_line_html}
      </td></tr>
    </table>
    <a href="{task_url}" style="display:inline-block;background:#2563eb;color:#ffffff;text-decoration:none;padding:10px 22px;border-radius:8px;font-size:14px;font-weight:600;">Open task</a>
  </td></tr>
  <tr><td style="padding:0 32px 32px;">
    <hr style="border:none;border-top:1px solid #e2e8f0;margin:32px 0 16px;">
    <p style="margin:0;color:#94a3b8;font-size:12px;line-height:1.5;">You're receiving this because assignment emails are enabled for <strong>{project_name}</strong>. Project admins can manage notifications in <a href="{settings_url}" style="color:#64748b;text-decoration:underline;">Project Settings</a>.</p>
  </td></tr>
</table>
</body></html>"""

    text = f"""Hi {assignee_name},

{actor_name} assigned you a task in {project_name}:

  {task_identifier}  ·  [{_PRIORITY_LABEL[task_priority]}]  {task_title}{due_line_text}

Open task: {task_url}

---
You're receiving this because assignment emails are enabled for {project_name}.
Project admins can manage notifications in Project Settings:
{settings_url}
"""

    return html, text


def render_workspace_invite_email(
    *,
    invitee_name: str,
    inviter_name: str,
    workspace_name: str,
    accept_url: str,
) -> tuple[str, str]:
    """Return (html, plaintext) for a workspace-invitation email sent to an
    ALREADY-REGISTERED user. New users get Supabase's signup invite instead;
    this is the Resend "notify-only" path for people who already have an
    account and just need to open the app to accept."""

    html = f"""<!doctype html>
<html><body style="margin:0;padding:0;background:#f8fafc;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
<table role="presentation" cellpadding="0" cellspacing="0" border="0" align="center" width="560" style="max-width:560px;margin:32px auto;background:#ffffff;border:1px solid #e2e8f0;border-radius:12px;">
  <tr><td style="padding:32px 32px 8px;">
    <p style="margin:0;color:#0f172a;font-size:14px;line-height:1.5;">Hi {invitee_name},</p>
    <p style="margin:8px 0 24px;color:#0f172a;font-size:14px;line-height:1.5;"><strong>{inviter_name}</strong> invited you to a workspace.</p>
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;margin-bottom:24px;">
      <tr><td style="padding:16px;">
        <p style="margin:0;color:#0f172a;font-size:16px;font-weight:600;line-height:1.4;">{workspace_name}</p>
        <p style="margin:6px 0 0;color:#64748b;font-size:13px;">invited by {inviter_name}</p>
      </td></tr>
    </table>
    <a href="{accept_url}" style="display:inline-block;background:#2563eb;color:#ffffff;text-decoration:none;padding:10px 22px;border-radius:8px;font-size:14px;font-weight:600;">Accept invitation</a>
  </td></tr>
  <tr><td style="padding:0 32px 32px;">
    <hr style="border:none;border-top:1px solid #e2e8f0;margin:32px 0 16px;">
    <p style="margin:0;color:#94a3b8;font-size:12px;line-height:1.5;">You already have a Trackly account, so just open the app to accept or decline this invitation.</p>
  </td></tr>
</table>
</body></html>"""

    text = f"""Hi {invitee_name},

{inviter_name} invited you to join the workspace {workspace_name} on Trackly.

Accept invitation: {accept_url}

---
You already have a Trackly account, so just open the app to accept or
decline this invitation.
"""

    return html, text
