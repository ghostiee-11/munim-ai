"use client";

import { useCallback, useEffect, useState } from "react";
import { useSocket } from "./useSocket";
import type {
  DashboardState,
  Transaction,
  Udhari,
  Alert,
  PayScore,
  Forecast,
  Event,
} from "@/types";

const initialState: DashboardState = {
  todayIncome: 0,
  todayExpense: 0,
  todayProfit: 0,
  profitMargin: 0,
  udhariList: [],
  totalUdhari: 0,
  events: [],
  payScore: {
    score: 0,
    grade: "F",
    factors: [],
    lastUpdated: new Date().toISOString(),
  },
  alerts: [],
  recentTransactions: [],
  forecast: null,
  gstStatus: null,
};

/**
 * Central reactive dashboard state powered by WebSocket events.
 * Listens to all real-time events and maintains the full dashboard state.
 */
export function useDashboardState() {
  const { socket, isConnected } = useSocket();
  const [state, setState] = useState<DashboardState>(initialState);

  const updateState = useCallback(
    (updater: (prev: DashboardState) => Partial<DashboardState>) => {
      setState((prev) => ({ ...prev, ...updater(prev) }));
    },
    []
  );

  useEffect(() => {
    if (!socket) return;

    // Full dashboard snapshot
    function onDashboardUpdate(data: DashboardState) {
      setState(data);
    }

    // Incremental updates
    function onNewTransaction(tx: Transaction) {
      updateState((prev) => {
        const isIncome = tx.type === "income";
        const newIncome = prev.todayIncome + (isIncome ? tx.amount : 0);
        const newExpense = prev.todayExpense + (!isIncome ? tx.amount : 0);
        const newProfit = newIncome - newExpense;
        return {
          todayIncome: newIncome,
          todayExpense: newExpense,
          todayProfit: newProfit,
          profitMargin: newIncome > 0 ? (newProfit / newIncome) * 100 : 0,
          recentTransactions: [tx, ...prev.recentTransactions].slice(0, 20),
        };
      });
    }

    function onUdhariUpdate(udhari: Udhari) {
      updateState((prev) => {
        const existing = prev.udhariList.findIndex((u) => u.id === udhari.id);
        const list =
          existing >= 0
            ? prev.udhariList.map((u) => (u.id === udhari.id ? udhari : u))
            : [udhari, ...prev.udhariList];
        return {
          udhariList: list,
          totalUdhari: list.reduce((sum, u) => sum + u.amount, 0),
        };
      });
    }

    function onUdhariCollected(data: {
      udhariId: string;
      amount: number;
      remaining: number;
    }) {
      updateState((prev) => {
        const list = prev.udhariList.map((u) =>
          u.id === data.udhariId
            ? {
                ...u,
                amount: data.remaining,
                status: (data.remaining <= 0 ? "paid" : "partial") as Udhari["status"],
              }
            : u
        );
        return {
          udhariList: list,
          totalUdhari: list.reduce((sum, u) => sum + u.amount, 0),
        };
      });
    }

    function onNewAlert(alert: Alert) {
      updateState((prev) => ({
        alerts: [alert, ...prev.alerts].slice(0, 50),
      }));
    }

    function onPayScoreUpdate(payScore: PayScore) {
      updateState(() => ({ payScore }));
    }

    function onForecastUpdate(forecast: Forecast) {
      updateState(() => ({ forecast }));
    }

    function onNewEvent(event: Event) {
      updateState((prev) => ({
        events: [event, ...prev.events].slice(0, 100),
      }));
    }

    socket.on("dashboard_update", onDashboardUpdate);
    socket.on("new_transaction", onNewTransaction);
    socket.on("udhari_update", onUdhariUpdate);
    socket.on("udhari_collected", onUdhariCollected);
    socket.on("new_alert", onNewAlert);
    socket.on("pay_score_update", onPayScoreUpdate);
    socket.on("forecast_update", onForecastUpdate);
    socket.on("new_event", onNewEvent);

    return () => {
      socket.off("dashboard_update", onDashboardUpdate);
      socket.off("new_transaction", onNewTransaction);
      socket.off("udhari_update", onUdhariUpdate);
      socket.off("udhari_collected", onUdhariCollected);
      socket.off("new_alert", onNewAlert);
      socket.off("pay_score_update", onPayScoreUpdate);
      socket.off("forecast_update", onForecastUpdate);
      socket.off("new_event", onNewEvent);
    };
  }, [socket, updateState]);

  return {
    ...state,
    isConnected,
  };
}
