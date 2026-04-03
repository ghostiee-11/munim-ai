// MunimAI TypeScript Interfaces

export interface Transaction {
  id: string;
  merchantId: string;
  type: "income" | "expense";
  amount: number;
  category: string;
  description: string;
  customerName?: string;
  paymentMode: "cash" | "upi" | "card" | "credit";
  timestamp: string;
  voiceTranscript?: string;
}

export interface Udhari {
  id: string;
  merchantId: string;
  customerName: string;
  customerId?: string;
  phone?: string;
  amount: number;
  originalAmount: number;
  dueDate: string;
  createdAt: string;
  status: "pending" | "partial" | "paid" | "overdue";
  reminders: UdhariReminder[];
}

export interface UdhariReminder {
  id: string;
  sentAt: string;
  channel: "whatsapp" | "sms";
  status: "sent" | "delivered" | "read";
}

export interface Customer {
  id: string;
  merchantId: string;
  name: string;
  phone?: string;
  totalSpent: number;
  visitCount: number;
  lastVisit: string;
  churnRisk: number; // 0 to 1
  preferredItems: string[];
  udhariBalance: number;
}

export interface DashboardState {
  todayIncome: number;
  todayExpense: number;
  todayProfit: number;
  profitMargin: number;
  udhariList: Udhari[];
  totalUdhari: number;
  events: Event[];
  payScore: PayScore;
  alerts: Alert[];
  recentTransactions: Transaction[];
  forecast: Forecast | null;
  gstStatus: GSTStatus | null;
}

export interface Alert {
  id: string;
  type: "info" | "warning" | "danger" | "success";
  title: string;
  message: string;
  timestamp: string;
  read: boolean;
}

export interface VoiceResponse {
  success: boolean;
  transcript: string;
  nluResult: NLUResult;
  transaction?: Transaction;
  reply: string;
  audioUrl?: string;
}

export interface NLUResult {
  intent: string;
  entities: Record<string, string | number>;
  confidence: number;
  language: "hi" | "en" | "hinglish";
  rawText: string;
}

export interface PayScore {
  score: number; // 0-100
  grade: "A" | "B" | "C" | "D" | "F";
  factors: PayScoreFactor[];
  lastUpdated: string;
}

export interface PayScoreFactor {
  name: string;
  score: number;
  weight: number;
  description: string;
}

export interface Forecast {
  merchantId: string;
  period: "daily" | "weekly" | "monthly";
  predictedIncome: number;
  predictedExpense: number;
  confidence: number;
  generatedAt: string;
}

export interface GSTStatus {
  merchantId: string;
  gstin?: string;
  filingStatus: "up_to_date" | "pending" | "overdue";
  nextDueDate: string;
  estimatedTax: number;
  lastFiled?: string;
}

export interface SchemeMatch {
  id: string;
  name: string;
  description: string;
  eligibility: string;
  benefit: string;
  deadline?: string;
  url?: string;
  matchScore: number; // 0-100
}

export interface Event {
  id: string;
  type:
    | "transaction"
    | "udhari_created"
    | "udhari_collected"
    | "alert"
    | "reminder_sent"
    | "customer_visit";
  title: string;
  description: string;
  amount?: number;
  timestamp: string;
  metadata?: Record<string, unknown>;
}

export interface WhatsAppMessage {
  id: string;
  merchantId: string;
  customerPhone: string;
  customerName?: string;
  direction: "incoming" | "outgoing";
  type: "text" | "template" | "media";
  content: string;
  timestamp: string;
  status: "sent" | "delivered" | "read" | "failed";
}

export interface Employee {
  id: string;
  merchantId: string;
  name: string;
  phone: string;
  role: string;
  salary: number;
  joinDate: string;
  attendance: EmployeeAttendance[];
}

export interface EmployeeAttendance {
  date: string;
  checkIn?: string;
  checkOut?: string;
  status: "present" | "absent" | "half_day" | "leave";
}

// WebSocket Event Types
export interface WSEvents {
  dashboard_update: DashboardState;
  new_transaction: Transaction;
  udhari_update: Udhari;
  udhari_collected: { udhariId: string; amount: number; remaining: number };
  new_alert: Alert;
  pay_score_update: PayScore;
  forecast_update: Forecast;
  new_event: Event;
  customer_visit: Customer;
  whatsapp_message: WhatsAppMessage;
}

export type WSEventName = keyof WSEvents;

/** Response from the full multi-agent orchestrator pipeline */
export interface AgenticVoiceResponse {
  success: boolean;
  transcript: string;
  intent: string;
  confidence: number;
  entities: Record<string, string | number>;
  response_hindi: string;
  response_audio_url?: string;
  agents_invoked: string[];
  agent_results: Record<string, unknown>;
  dashboard_delta: Record<string, unknown>;
  whatsapp_messages: Array<{
    recipient: string;
    phone?: string;
    message: string;
    payment_link?: string;
  }>;
  processing_time_ms: number;
  errors: string[];
  phase: string;
  needs_clarification?: boolean;
  clarification_prompt?: string;
}
