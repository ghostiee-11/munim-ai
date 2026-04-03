import type {
  DashboardState,
  Transaction,
  Udhari,
  Customer,
  VoiceResponse,
  AgenticVoiceResponse,
  SchemeMatch,
  GSTStatus,
  Forecast,
  WhatsAppMessage,
} from "@/types";

const BASE_URL =
  process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000/api";

class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public data?: unknown
  ) {
    super(message);
    this.name = "ApiError";
  }
}

async function request<T>(
  endpoint: string,
  options: RequestInit = {}
): Promise<T> {
  const url = `${BASE_URL}${endpoint}`;

  const config: RequestInit = {
    headers: {
      "Content-Type": "application/json",
      ...options.headers,
    },
    ...options,
  };

  const response = await fetch(url, config);

  if (!response.ok) {
    const errorData = await response.json().catch(() => null);
    throw new ApiError(
      response.status,
      errorData?.message || `Request failed with status ${response.status}`,
      errorData
    );
  }

  return response.json() as Promise<T>;
}

export const api = {
  dashboard: {
    get(merchantId: string) {
      return request<DashboardState>(`/dashboard/${merchantId}`);
    },
  },

  voice: {
    async process(merchantId: string, audioBlob: Blob) {
      const formData = new FormData();
      formData.append("audio", audioBlob, "recording.webm");
      formData.append("merchantId", merchantId);

      const url = `${BASE_URL}/voice/process`;
      const response = await fetch(url, {
        method: "POST",
        body: formData,
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => null);
        throw new ApiError(
          response.status,
          errorData?.message || "Voice processing failed",
          errorData
        );
      }

      return response.json() as Promise<VoiceResponse>;
    },

    /** Full multi-agent pipeline — uses LangGraph orchestrator with all specialist agents */
    async processAgentic(merchantId: string, audioBlob: Blob) {
      const formData = new FormData();
      formData.append("audio", audioBlob, "recording.webm");
      formData.append("merchant_id", merchantId);

      const url = `${BASE_URL}/voice/process-agentic`;
      const response = await fetch(url, {
        method: "POST",
        body: formData,
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => null);
        throw new ApiError(
          response.status,
          errorData?.message || "Agentic voice processing failed",
          errorData
        );
      }

      return response.json() as Promise<AgenticVoiceResponse>;
    },

    /** Text input → full multi-agent pipeline */
    async textAgentic(merchantId: string, text: string) {
      return request<AgenticVoiceResponse>("/voice/text-agentic", {
        method: "POST",
        body: JSON.stringify({ merchant_id: merchantId, text, language: "hi" }),
      });
    },
  },

  transactions: {
    list(merchantId: string, params?: { from?: string; to?: string; type?: string }) {
      const query = params ? "?" + new URLSearchParams(params as Record<string, string>).toString() : "";
      return request<Transaction[]>(`/transactions/${merchantId}${query}`);
    },
    create(merchantId: string, data: Partial<Transaction>) {
      return request<Transaction>(`/transactions/${merchantId}`, {
        method: "POST",
        body: JSON.stringify(data),
      });
    },
  },

  udhari: {
    list(merchantId: string) {
      return request<Udhari[]>(`/udhari/${merchantId}`);
    },
    create(merchantId: string, data: Partial<Udhari>) {
      return request<Udhari>(`/udhari/${merchantId}`, {
        method: "POST",
        body: JSON.stringify(data),
      });
    },
    collect(udhariId: string, amount: number) {
      return request<Udhari>(`/udhari/${udhariId}/collect`, {
        method: "POST",
        body: JSON.stringify({ amount }),
      });
    },
    sendReminder(udhariId: string, channel: "whatsapp" | "sms") {
      return request<{ success: boolean }>(`/udhari/${udhariId}/remind`, {
        method: "POST",
        body: JSON.stringify({ channel }),
      });
    },
  },

  customers: {
    list(merchantId: string) {
      return request<Customer[]>(`/customers/${merchantId}`);
    },
    get(customerId: string) {
      return request<Customer>(`/customers/detail/${customerId}`);
    },
  },

  schemes: {
    match(merchantId: string) {
      return request<SchemeMatch[]>(`/schemes/${merchantId}`);
    },
  },

  gst: {
    status(merchantId: string) {
      return request<GSTStatus>(`/gst/${merchantId}`);
    },
  },

  forecast: {
    get(merchantId: string, period: "daily" | "weekly" | "monthly" = "daily") {
      return request<Forecast>(`/forecast/${merchantId}?period=${period}`);
    },
  },

  whatsapp: {
    messages(merchantId: string) {
      return request<WhatsAppMessage[]>(`/whatsapp/${merchantId}/messages`);
    },
    send(merchantId: string, phone: string, message: string) {
      return request<WhatsAppMessage>(`/whatsapp/${merchantId}/send`, {
        method: "POST",
        body: JSON.stringify({ phone, message }),
      });
    },
  },
} as const;

export { ApiError };
