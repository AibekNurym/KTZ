"""WebSocket endpoint for real-time telemetry."""

import json

import structlog
from fastapi import APIRouter, WebSocket, WebSocketDisconnect, Query

from app.auth.jwt import decode_token
from app.ws.manager import connect, disconnect
from app.services.health_index import get_cached_hi

logger = structlog.get_logger(component="ws.telemetry")

router = APIRouter()


@router.websocket("/ws/telemetry/{loco_id}")
async def telemetry_websocket(ws: WebSocket, loco_id: str, token: str = Query(...)):
    # Authenticate
    try:
        payload = decode_token(token)
    except Exception:
        await ws.close(code=4001, reason="Invalid token")
        return

    username = payload.get("username", "unknown")
    role = payload.get("role", "unknown")
    logger.info("ws_auth_ok", loco_id=loco_id, username=username, role=role)

    await connect(ws, loco_id)

    # Send initial snapshot
    cached = get_cached_hi(loco_id)
    if cached:
        await ws.send_text(json.dumps({
            "type": "snapshot",
            "data": cached,
        }))

    try:
        while True:
            # Listen for client messages (ping/pong)
            data = await ws.receive_text()
            try:
                msg = json.loads(data)
                if msg.get("type") == "ping":
                    await ws.send_text(json.dumps({"type": "pong"}))
            except json.JSONDecodeError:
                pass
    except WebSocketDisconnect:
        disconnect(ws, loco_id)
    except Exception:
        disconnect(ws, loco_id)
