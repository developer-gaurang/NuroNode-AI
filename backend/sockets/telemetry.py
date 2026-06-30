from fastapi import APIRouter, WebSocket, WebSocketDisconnect

router = APIRouter()


class TelemetryHub:
    def __init__(self) -> None:
        self.connections: set[WebSocket] = set()

    async def connect(self, websocket: WebSocket) -> None:
        await websocket.accept()
        self.connections.add(websocket)

    def disconnect(self, websocket: WebSocket) -> None:
        self.connections.discard(websocket)

    async def broadcast(self, message: dict) -> None:
        stale: list[WebSocket] = []
        for websocket in self.connections:
            try:
                await websocket.send_json(message)
            except RuntimeError:
                stale.append(websocket)
        for websocket in stale:
            self.disconnect(websocket)


hub = TelemetryHub()


@router.websocket("/ws/nurosync")
async def nurosync_socket(websocket: WebSocket):
    await hub.connect(websocket)
    try:
        while True:
            payload = await websocket.receive_json()
            await hub.broadcast(payload)
    except WebSocketDisconnect:
        hub.disconnect(websocket)
