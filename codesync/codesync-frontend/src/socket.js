import { io } from "socket.io-client";

const BACKEND =
  process.env.REACT_APP_BACKEND_URL || "http://localhost:5000";

let socket = null;

export function initSocket(token) {
  if (socket) socket.disconnect();

  socket = io(BACKEND, {
    auth: { token },
    transports: ["websocket"], // production best practice
    withCredentials: true,
    reconnection: true,
    reconnectionAttempts: 10,
  });

  return socket;
}

export function disconnectSocket() {
  if (socket) {
    socket.disconnect();
    socket = null;
  }
}

export const EVENTS = {
  JOIN: "join",
  CODE_CHANGE: "code_change",
  LANG_CHANGE: "lang_change",
};