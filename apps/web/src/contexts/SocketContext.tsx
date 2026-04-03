"use client";

import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { getSocket, type Socket } from "@/lib/socket";
import { DEMO_MERCHANT_ID } from "@/lib/constants";

interface SocketContextValue {
  socket: Socket | null;
  isConnected: boolean;
}

const SocketContext = createContext<SocketContextValue>({
  socket: null,
  isConnected: false,
});

export function SocketProvider({
  children,
  merchantId = DEMO_MERCHANT_ID,
}: {
  children: ReactNode;
  merchantId?: string;
}) {
  // Use state (not ref) so context consumers re-render when socket becomes available
  const [socket, setSocket] = useState<Socket | null>(null);
  const [isConnected, setIsConnected] = useState(false);

  useEffect(() => {
    // Only connect in browser, not during SSR
    if (typeof window === "undefined") return;

    try {
      const s = getSocket();
      if (!s) {
        console.warn("MunimAI: Socket unavailable, running in offline mode");
        return;
      }

      setSocket(s);

      function onConnect() {
        setIsConnected(true);
        s!.emit("join_merchant", { merchant_id: merchantId });
      }

      function onDisconnect() {
        setIsConnected(false);
      }

      function onConnectError() {
        // Don't block UI if backend is unreachable
        console.warn("MunimAI: Socket connection failed, running in offline mode");
        setIsConnected(false);
      }

      s.on("connect", onConnect);
      s.on("disconnect", onDisconnect);
      s.on("connect_error", onConnectError);

      // Connect — don't block UI
      s.connect();

      return () => {
        s.off("connect", onConnect);
        s.off("disconnect", onDisconnect);
        s.off("connect_error", onConnectError);
        s.disconnect();
      };
    } catch (err) {
      console.warn("MunimAI: Socket setup failed", err);
    }
  }, [merchantId]);

  return (
    <SocketContext value={{ socket, isConnected }}>
      {children}
    </SocketContext>
  );
}

export function useSocketContext() {
  return useContext(SocketContext);
}
