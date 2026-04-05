"""WebSocket connection manager for real-time telemetry streaming."""

import json
from datetime import datetime, timezone

import structlog
from fastapi import WebSocket

logger = structlog.get_logger(component="websocket")

# Active connections: loco_id -> set of WebSocket connections
_connections: dict[str, set[WebSocket]] = {}


async def connect(ws: WebSocket, loco_id: str):
    await ws.accept()
    if loco_id not in _connections:
        _connections[loco_id] = set()
    _connections[loco_id].add(ws)
    logger.info("ws_connected", loco_id=loco_id, total=len(_connections[loco_id]))


def disconnect(ws: WebSocket, loco_id: str):
    if loco_id in _connections:
        _connections[loco_id].discard(ws)
        if not _connections[loco_id]:
            del _connections[loco_id]
    logger.info("ws_disconnected", loco_id=loco_id)


def get_connection_count() -> int:
    return sum(len(conns) for conns in _connections.values())


async def broadcast_telemetry_update(
    loco_id: str,
    ts: str,
    parameters: dict[str, float],
    health_index: dict,
    new_alerts: list[dict],
):
    """Broadcast telemetry update to all connected clients for a loco_id."""
    conns = _connections.get(loco_id)
    if not conns:
        return

    message = json.dumps({
        "type": "telemetry_update",
        "data": {
            "ts": ts,
            "loco_id": loco_id,
            "parameters": parameters,
            "health_index": {
                "score": health_index.get("score", 0),
                "status": health_index.get("status", "Unknown"),
                "top_factors": health_index.get("top_factors", []),
                "subsystem_scores": health_index.get("subsystem_scores", {}),
            },
            "new_alerts": [
                {
                    "parameter": a["parameter"],
                    "severity": a["severity"],
                    "value": a["value"],
                    "threshold": a["threshold"],
                    "message": a["message"],
                }
                for a in new_alerts
            ],
        },
    })

    dead = []
    for ws in conns:
        try:
            await ws.send_text(message)
        except Exception:
            dead.append(ws)

    for ws in dead:
        conns.discard(ws)
