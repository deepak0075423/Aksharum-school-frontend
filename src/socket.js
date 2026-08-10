import { io } from 'socket.io-client';

// Gateway runs on a separate port/service from the API backend.
// VITE_WS_GATEWAY_URL defaults to port 4000 in local dev.
const GATEWAY_URL = import.meta.env.VITE_WS_GATEWAY_URL || 'http://localhost:4000';

let socket = null;

export function connectSocket(token) {
    // Idempotent: multiple providers (Header, ChatNotify, Chat) all ensure the
    // socket — return the existing singleton whether it's connected or still
    // handshaking, so we never open a second connection.
    if (socket) return socket;
    socket = io(GATEWAY_URL, {
        auth:               { token },
        transports:         ['websocket', 'polling'],
        reconnectionAttempts: 10,
        reconnectionDelay:    2000,
    });
    return socket;
}

export function disconnectSocket() {
    if (socket) {
        socket.disconnect();
        socket = null;
    }
}

export function getSocket() {
    return socket;
}
