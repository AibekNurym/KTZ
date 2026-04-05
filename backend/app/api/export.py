import csv
import io
import json
from datetime import datetime, timezone, timedelta

from fastapi import APIRouter, Depends, Query
from fastapi.responses import StreamingResponse
from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.units import mm
from reportlab.platypus import SimpleDocTemplate, Table, TableStyle, Paragraph, Spacer
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont

# Register DejaVuSans for Cyrillic support
_FONT_REGISTERED = False

def _ensure_font():
    global _FONT_REGISTERED
    if _FONT_REGISTERED:
        return
    try:
        pdfmetrics.registerFont(TTFont("DejaVuSans", "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"))
        pdfmetrics.registerFont(TTFont("DejaVuSans-Bold", "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"))
        _FONT_REGISTERED = True
    except Exception:
        pass  # fallback to default font

from app.auth.jwt import get_current_user
from app.db.connection import get_pool

# Astana timezone UTC+5
TZ_ASTANA = timezone(timedelta(hours=5))

router = APIRouter(prefix="/api/v1/export", tags=["Export"])

# ── i18n for export files ──
_TRANSLATIONS: dict[str, dict[str, str]] = {
    "ru": {
        "report_title": "Отчёт Digital Twin",
        "period": "Период",
        "hi_summary": "Сводка индекса здоровья",
        "metric": "Метрика",
        "value": "Значение",
        "min": "Минимум",
        "avg": "Среднее",
        "max": "Максимум",
        "hi_history": "=== История индекса здоровья ===",
        "timestamp": "Время",
        "score": "Оценка",
        "status": "Статус",
        "alerts_section": "=== Оповещения ===",
        "alerts_title": "Оповещения",
        "total": "всего",
        "parameter": "Параметр",
        "severity": "Важность",
        "threshold": "Порог",
        "no_alerts": "Нет оповещений за данный период.",
        "from": "С",
        "to": "По",
        # parameter names
        "speed_kmh": "Скорость",
        "traction_motor_temp_c": "Темп. двигателя",
        "traction_motor_current_a": "Ток двигателя",
        "dc_bus_voltage_v": "Шина DC",
        "catenary_voltage_kv": "Контактная сеть",
        "onboard_voltage_v": "Борт. напряжение",
        "battery_voltage_v": "Батарея",
        "pantograph_current_a": "Пантограф",
        "brake_main_pressure_bar": "Тормоз осн.",
        "brake_reservoir_pressure_bar": "Тормоз рез.",
        "brake_cylinder_pressure_bar": "Тормоз цил.",
        "regen_braking_power_kw": "Рекуперация",
        "coolant_temp_c": "Охлаждающая ж.",
        "oil_temp_c": "Темп. масла",
        "oil_pressure_kpa": "Давл. масла",
        "engine_rpm": "Обороты",
        "exhaust_temp_c": "Выхлоп",
        "fuel_level_pct": "Уровень топлива",
        "fuel_consumption_g_kwh": "Расход топлива",
        "wheel_slip_pct": "Проскальз.",
        "ambient_temp_c": "Темп. среды",
        "oil_pressure_idle_kpa": "Масло хол. ход",
        # severities
        "critical": "Критическое",
        "warning": "Предупреждение",
        "info": "Информация",
        # statuses
        "Normal": "Норма",
        "Attention": "Внимание",
        "Critical": "Критично",
    },
    "kk": {
        "report_title": "Digital Twin есебі",
        "period": "Кезең",
        "hi_summary": "Денсаулық индексі жиынтығы",
        "metric": "Метрика",
        "value": "Мән",
        "min": "Минимум",
        "avg": "Орташа",
        "max": "Максимум",
        "hi_history": "=== Денсаулық индексі тарихы ===",
        "timestamp": "Уақыт",
        "score": "Баға",
        "status": "Күй",
        "alerts_section": "=== Хабарламалар ===",
        "alerts_title": "Хабарламалар",
        "total": "барлығы",
        "parameter": "Параметр",
        "severity": "Маңыздылық",
        "threshold": "Шек",
        "no_alerts": "Бұл кезеңде хабарлама жоқ.",
        "from": "Бастап",
        "to": "Дейін",
        # parameter names
        "speed_kmh": "Жылдамдық",
        "traction_motor_temp_c": "Қозғалт. темп.",
        "traction_motor_current_a": "Қозғалт. тогы",
        "dc_bus_voltage_v": "DC шина",
        "catenary_voltage_kv": "Байланыс желісі",
        "onboard_voltage_v": "Борт кернеуі",
        "battery_voltage_v": "Аккумулятор",
        "pantograph_current_a": "Пантограф",
        "brake_main_pressure_bar": "Негізгі тежегіш",
        "brake_reservoir_pressure_bar": "Резерв тежегіш",
        "brake_cylinder_pressure_bar": "Цилиндр тежегіш",
        "regen_braking_power_kw": "Рекуперация",
        "coolant_temp_c": "Салқындатқыш",
        "oil_temp_c": "Май темп.",
        "oil_pressure_kpa": "Май қысымы",
        "engine_rpm": "Айналым",
        "exhaust_temp_c": "Шығарынды",
        "fuel_level_pct": "Отын деңгейі",
        "fuel_consumption_g_kwh": "Отын шығыны",
        "wheel_slip_pct": "Сырғу",
        "ambient_temp_c": "Орта темп.",
        "oil_pressure_idle_kpa": "Май бос жүріс",
        # severities
        "critical": "Сыни",
        "warning": "Ескерту",
        "info": "Ақпарат",
        # statuses
        "Normal": "Қалыпты",
        "Attention": "Ескерту",
        "Critical": "Сыни",
    },
}


def _t(lang: str, key: str) -> str:
    """Translate key, fallback to key itself."""
    return _TRANSLATIONS.get(lang, _TRANSLATIONS["ru"]).get(key, key)


@router.get("/{loco_id}")
async def export_report(
    loco_id: str,
    format: str = Query("csv", description="csv or pdf"),
    lang: str = Query("ru", description="ru or kk"),
    from_ts: datetime = Query(None, alias="from"),
    to_ts: datetime = Query(None, alias="to"),
    user: dict = Depends(get_current_user),
):
    if lang not in ("ru", "kk"):
        lang = "ru"
    if from_ts is None:
        from_ts = datetime.now(timezone.utc) - timedelta(hours=1)
    if to_ts is None:
        to_ts = datetime.now(timezone.utc)

    pool = get_pool()

    # Fetch HI data
    async with pool.acquire() as conn:
        hi_rows = await conn.fetch(
            "SELECT ts, score, status FROM health_index_history WHERE loco_id=$1 AND ts>=$2 AND ts<=$3 ORDER BY ts",
            loco_id, from_ts, to_ts,
        )
        alert_rows = await conn.fetch(
            "SELECT ts, parameter, severity, value, threshold, message FROM alerts WHERE loco_id=$1 AND ts>=$2 AND ts<=$3 ORDER BY ts DESC LIMIT 100",
            loco_id, from_ts, to_ts,
        )

    # Compute summary
    scores = [r["score"] for r in hi_rows] if hi_rows else [0]
    hi_min = min(scores)
    hi_max = max(scores)
    hi_avg = sum(scores) / len(scores)

    if format == "pdf":
        return _generate_pdf(loco_id, from_ts, to_ts, hi_min, hi_avg, hi_max, alert_rows, lang)
    else:
        return _generate_csv(loco_id, from_ts, to_ts, hi_rows, alert_rows, lang)


def _generate_csv(loco_id, from_ts, to_ts, hi_rows, alert_rows, lang="ru"):
    t = lambda key: _t(lang, key)
    output = io.StringIO()
    # UTF-8 BOM so Excel recognizes encoding
    output.write("\ufeff")
    writer = csv.writer(output)

    from_local = from_ts.astimezone(TZ_ASTANA)
    to_local = to_ts.astimezone(TZ_ASTANA)
    writer.writerow([t("report_title"), loco_id])
    writer.writerow([t("from"), from_local.isoformat(), t("to"), to_local.isoformat()])
    writer.writerow([])

    writer.writerow([t("hi_history")])
    writer.writerow([t("timestamp"), t("score"), t("status")])
    for r in hi_rows:
        ts_local = r["ts"].astimezone(TZ_ASTANA) if r["ts"].tzinfo else r["ts"]
        writer.writerow([ts_local.isoformat(), r["score"], t(r["status"])])

    writer.writerow([])
    writer.writerow([t("alerts_section")])
    writer.writerow([t("timestamp"), t("parameter"), t("severity"), t("value"), t("threshold")])
    for r in alert_rows:
        ts_local = r["ts"].astimezone(TZ_ASTANA) if r["ts"].tzinfo else r["ts"]
        writer.writerow([ts_local.isoformat(), t(r["parameter"]), t(r["severity"]), r["value"], r["threshold"]])

    output.seek(0)
    return StreamingResponse(
        iter([output.getvalue()]),
        media_type="text/csv; charset=utf-8",
        headers={"Content-Disposition": f"attachment; filename=report_{loco_id}.csv"},
    )


def _generate_pdf(loco_id, from_ts, to_ts, hi_min, hi_avg, hi_max, alert_rows, lang="ru"):
    _ensure_font()
    t = lambda key: _t(lang, key)
    buf = io.BytesIO()
    doc = SimpleDocTemplate(buf, pagesize=A4, topMargin=20*mm, bottomMargin=20*mm)

    # Build styles with DejaVuSans for Cyrillic support
    styles = getSampleStyleSheet()
    font_name = "DejaVuSans" if _FONT_REGISTERED else "Helvetica"
    font_name_bold = "DejaVuSans-Bold" if _FONT_REGISTERED else "Helvetica-Bold"

    s_title = ParagraphStyle("CyrTitle", parent=styles["Title"], fontName=font_name_bold)
    s_normal = ParagraphStyle("CyrNormal", parent=styles["Normal"], fontName=font_name)
    s_heading = ParagraphStyle("CyrHeading", parent=styles["Heading2"], fontName=font_name_bold)

    elements = []

    # Title
    elements.append(Paragraph(f"{t('report_title')} — {loco_id}", s_title))
    from_local = from_ts.astimezone(TZ_ASTANA)
    to_local = to_ts.astimezone(TZ_ASTANA)
    elements.append(Paragraph(
        f"{t('period')}: {from_local.strftime('%Y-%m-%d %H:%M')} — {to_local.strftime('%Y-%m-%d %H:%M')} (UTC+5)",
        s_normal,
    ))
    elements.append(Spacer(1, 10*mm))

    # HI Summary
    elements.append(Paragraph(t("hi_summary"), s_heading))
    hi_data = [
        [t("metric"), t("value")],
        [t("min"), f"{hi_min:.1f}"],
        [t("avg"), f"{hi_avg:.1f}"],
        [t("max"), f"{hi_max:.1f}"],
    ]
    hi_table = Table(hi_data, colWidths=[60*mm, 40*mm])
    hi_table.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#27272a")),
        ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
        ("FONTNAME", (0, 0), (-1, -1), font_name),
        ("FONTSIZE", (0, 0), (-1, -1), 9),
        ("GRID", (0, 0), (-1, -1), 0.5, colors.HexColor("#52525b")),
        ("ALIGN", (1, 0), (1, -1), "RIGHT"),
    ]))
    elements.append(hi_table)
    elements.append(Spacer(1, 8*mm))

    # Alerts
    elements.append(Paragraph(f"{t('alerts_title')} ({len(alert_rows)} {t('total')})", s_heading))
    if alert_rows:
        alert_data = [[t("timestamp"), t("parameter"), t("severity"), t("value"), t("threshold")]]
        for r in alert_rows[:30]:
            ts_local = r["ts"].astimezone(TZ_ASTANA) if r["ts"].tzinfo else r["ts"]
            alert_data.append([
                ts_local.strftime("%H:%M:%S"),
                t(r["parameter"]),
                t(r["severity"]),
                f"{r['value']:.1f}",
                f"{r['threshold']:.1f}",
            ])
        a_table = Table(alert_data, colWidths=[22*mm, 40*mm, 35*mm, 22*mm, 22*mm])
        a_table.setStyle(TableStyle([
            ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#27272a")),
            ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
            ("FONTNAME", (0, 0), (-1, -1), font_name),
            ("FONTSIZE", (0, 0), (-1, -1), 8),
            ("GRID", (0, 0), (-1, -1), 0.5, colors.HexColor("#52525b")),
        ]))
        elements.append(a_table)
    else:
        elements.append(Paragraph(t("no_alerts"), s_normal))

    doc.build(elements)
    buf.seek(0)
    return StreamingResponse(
        buf,
        media_type="application/pdf",
        headers={"Content-Disposition": f"attachment; filename=report_{loco_id}.pdf"},
    )
