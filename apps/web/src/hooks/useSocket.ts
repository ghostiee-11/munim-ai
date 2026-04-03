"use client";

import { useSocketContext } from "@/contexts/SocketContext";

/**
 * React hook for accessing the Socket.IO connection.
 * Must be used within a SocketProvider.
 */
export function useSocket() {
  const { socket, isConnected } = useSocketContext();
  return { socket, isConnected };
}
