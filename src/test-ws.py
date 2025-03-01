import asyncio
import websockets
import flet as ft
import requests
from threading import Thread

# WebSocketサーバーのURI
URI = "ws://localhost:5010/api/v1/websocket"
token = requests.post("http://localhost:5010/api/v1/login", json={"username": "amania", "password": "7216114asa"}).json()["token"]
# WebSocketクライアント
class WebSocketClient:
    def __init__(self, uri, update_ui_callback):
        self.uri = uri
        self.websocket = None
        self.update_ui_callback = update_ui_callback
        self.connected = False
        self.headers = {
            "Authorization": f"Bearer {token}"
        }

    def connect(self):
        self.loop = asyncio.new_event_loop()
        Thread(target=self._start_loop, daemon=True).start()

    def _start_loop(self):
        asyncio.set_event_loop(self.loop)
        self.loop.run_until_complete(self._connect())

    async def _connect(self):
        try:
            self.websocket = await websockets.connect(self.uri)
            self.connected = True
            self.update_ui_callback("Connected to server.")
            await self.receive_messages()
        except Exception as e:
            self.update_ui_callback(f"Connection failed: {str(e)}")

    async def receive_messages(self):
        try:
            while True:
                message = await self.websocket.recv()
                self.update_ui_callback(f"Server: {message}")
        except websockets.ConnectionClosed as e:
            print(e)
            self.update_ui_callback("Connection closed.")
            self.connected = False

    def send_message(self, message):
        if self.connected:
            asyncio.run_coroutine_threadsafe(self._send_message(message), self.loop)

    async def _send_message(self, message):
        if self.websocket is not None and self.connected:
            await self.websocket.send(message)
            self.update_ui_callback(f"Client: {message}")

# Flet UI
def main(page: ft.Page):
    page.title = "WebSocket Client Interface"
    page.vertical_alignment = ft.MainAxisAlignment.CENTER

    messages_log = ft.TextField(value="", width=400, height=300, read_only=True, multiline=True)
    message_input = ft.TextField(label="Your Message", width=400)

    client = WebSocketClient(URI, lambda msg: append_message(msg, messages_log, page))

    def append_message(msg, messages_log, page):
        messages_log.value += msg + "\n"
        page.update()

    def connect_click(e):
        client.connect()

    def send_message_click(e):
        if message_input.value:
            client.send_message(message_input.value)
            message_input.value = ""
            page.update()

    connect_button = ft.ElevatedButton(text="Connect to Server", on_click=connect_click)
    send_button = ft.ElevatedButton(text="Send Message", on_click=send_message_click)

    page.add(
        connect_button,
        message_input,
        send_button,
        messages_log,
    )

if __name__ == "__main__":
    ft.app(target=main)