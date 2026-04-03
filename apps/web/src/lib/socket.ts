import { io, type Socket } from "socket.io-client";

const SOCKET_URL =
  process.env.NEXT_PUBLIC_SOCKET_URL ||
  process.env.NEXT_PUBLIC_API_URL ||
  "http://localhost:8000";

let socket: Socket | null = null;

/**
 * Returns a singleton Socket.IO client instance.
 * Returns null if socket creation fails (e.g. during SSR or if library errors).
 * Auto-reconnects with exponential backoff.
 */
export function getSocket(): Socket | null {
  if (typeof window === "undefined") return null;

  if (!socket) {
    try {
      socket = io(SOCKET_URL, {
        autoConnect: false,
        reconnection: true,
        reconnectionAttempts: 5,
        reconnectionDelay: 2000,
        reconnectionDelayMax: 10000,
        randomizationFactor: 0.5,
        timeout: 5000,
        transports: ["websocket", "polling"],
      });
    } catch (err) {
      console.warn("MunimAI: Failed to create socket", err);
      return null;
    }
  }
  return socket;
}

export { type Socket };
