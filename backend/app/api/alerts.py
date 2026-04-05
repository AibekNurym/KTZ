from datetime import datetime, timezone, timedelta

from fastapi import APIRouter, Depends, Query, HTTPException, Response
from pydantic import BaseModel

from app.auth.jwt import get_current_user
from app.db.connection import get_pool

router = APIRouter(prefix="/api/v1/alerts", tags=["Alerts"])


@router.get("/{loco_id}")
async def get_alerts(
    loco_id: str,
    severity: str = Query(None, description="Filter by severity: info|warning|critical"),
    from_ts: datetime = Query(None, alias="from"),
    to_ts: datetime = Query(None, alias="to"),
    limit: int = Query(50, ge=1, le=500),
    offset: int = Query(0, ge=0),
    response: Response = None,
    user: dict = Depends(get_current_user),
):
    """Get alerts for a locomotive with optional filters."""
    if from_ts is None:
        from_ts = datetime.now(timezone.utc) - timedelta(hours=1)
    if to_ts is None:
        to_ts = datetime.now(timezone.utc)

    pool = get_pool()
    async with pool.acquire() as conn:
        # Count total
        count_query = """
            SELECT count(*) FROM alerts
            WHERE loco_id = $1 AND ts >= $2 AND ts <= $3
        """
        params = [loco_id, from_ts, to_ts]

        if severity:
            count_query += " AND severity = $4"
            params.append(severity)

        total = await conn.fetchval(count_query, *params)

        # Fetch page
        data_query = """
            SELECT id, ts, loco_id, parameter, severity, value, threshold, message, acknowledged, annotation
            FROM alerts
            WHERE loco_id = $1 AND ts >= $2 AND ts <= $3
        """
        data_params = [loco_id, from_ts, to_ts]

        if severity:
            data_query += " AND severity = $4"
            data_params.append(severity)

        data_query += f" ORDER BY ts DESC LIMIT ${len(data_params) + 1} OFFSET ${len(data_params) + 2}"
        data_params.extend([limit, offset])

        rows = await conn.fetch(data_query, *data_params)

    if response:
        response.headers["X-Total-Count"] = str(total)

    return {
        "total": total,
        "limit": limit,
        "offset": offset,
        "data": [
            {
                "id": row["id"],
                "ts": row["ts"].isoformat(),
                "loco_id": row["loco_id"],
                "parameter": row["parameter"],
                "severity": row["severity"],
                "value": row["value"],
                "threshold": row["threshold"],
                "message": row["message"],
                "acknowledged": row["acknowledged"],
                "annotation": row["annotation"],
            }
            for row in rows
        ],
    }


@router.patch("/{alert_id}/acknowledge")
async def acknowledge_alert(alert_id: int, user: dict = Depends(get_current_user)):
    pool = get_pool()
    async with pool.acquire() as conn:
        result = await conn.execute(
            "UPDATE alerts SET acknowledged = TRUE WHERE id = $1", alert_id,
        )
    if result == "UPDATE 0":
        raise HTTPException(status_code=404, detail="Alert not found")
    return {"status": "acknowledged", "id": alert_id}


class AnnotateRequest(BaseModel):
    text: str


@router.patch("/{alert_id}/annotate")
async def annotate_alert(alert_id: int, body: AnnotateRequest, user: dict = Depends(get_current_user)):
    pool = get_pool()
    async with pool.acquire() as conn:
        result = await conn.execute(
            "UPDATE alerts SET annotation = $1 WHERE id = $2", body.text, alert_id,
        )
    if result == "UPDATE 0":
        raise HTTPException(status_code=404, detail="Alert not found")
    return {"status": "annotated", "id": alert_id}
