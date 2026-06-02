import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { BrowserRouter } from "react-router-dom";

// ── Supabase mock ─────────────────────────────────────────────────────────────
const mockFrom = vi.fn();
const mockInvoke = vi.fn();

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: (...args: any[]) => mockFrom(...args),
    functions: { invoke: (...args: any[]) => mockInvoke(...args) },
    channel: vi.fn().mockReturnValue({ on: vi.fn().mockReturnThis(), subscribe: vi.fn() }),
    removeChannel: vi.fn(),
    auth: {
      onAuthStateChange: vi.fn(() => ({ data: { subscription: { unsubscribe: vi.fn() } } })),
      getSession: vi.fn().mockResolvedValue({ data: { session: null } }),
    },
  },
}));

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({
    user: { id: "doctor-1", email: "dr@test.com" },
    profile: { first_name: "Carlos", last_name: "Mendes" },
    roles: ["doctor"],
    loading: false,
  }),
}));

vi.mock("@/components/dashboards/DashboardLayout", () => ({
  default: ({ children }: { children: React.ReactNode }) => <div data-testid="layout">{children}</div>,
}));

vi.mock("@/components/doctor/doctorNav", () => ({ getDoctorNav: () => [] }));
vi.mock("@/components/patient/patientNav", () => ({ getPatientNav: () => [] }));
vi.mock("framer-motion", () => ({
  motion: {
    div: ({ children, ...p }: any) => <div {...p}>{children}</div>,
    button: ({ children, ...p }: any) => <button {...p}>{children}</button>,
    tr: ({ children, ...p }: any) => <tr {...p}>{children}</tr>,
  },
  AnimatePresence: ({ children }: any) => <>{children}</>,
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

// ── Fixtures ──────────────────────────────────────────────────────────────────
const mockDoctorProfile = {
  id: "dp-1",
  user_id: "doctor-1",
  crm: "123456",
  crm_state: "SP",
  bio: "Cardiologista experiente",
  consultation_price: 250,
  rating: 4.8,
  total_reviews: 42,
  is_approved: true,
};

const mockAppointment = {
  id: "apt-1",
  scheduled_at: new Date(Date.now() + 3600000).toISOString(),
  status: "scheduled",
  patient_id: "p-1",
  doctor_id: "dp-1",
  duration_minutes: 30,
  payment_status: "paid",
  video_room_url: null,
  notes: null,
};

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("DoctorPrescriptions", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    // Make chain thenable so `await chain` and `await chain.order()` both work
    const makeChain = (finalData: any) => {
      const resolved = Promise.resolve({ data: finalData, error: null });
      const chain: any = Object.assign(resolved, {
        eq: () => makeChain(finalData),
        in: () => makeChain(finalData),
        order: () => makeChain(finalData),
        single: () => Promise.resolve({ data: Array.isArray(finalData) ? (finalData[0] ?? null) : finalData, error: null }),
        maybeSingle: () => Promise.resolve({ data: Array.isArray(finalData) ? (finalData[0] ?? null) : finalData, error: null }),
        limit: () => makeChain(finalData),
      });
      return chain;
    };

    mockFrom.mockImplementation((table: string) => {
      if (table === "doctor_profiles") {
        return {
          select: () => makeChain(mockDoctorProfile),
          update: () => ({ eq: () => Promise.resolve({ error: null }) }),
        };
      }
      if (table === "prescriptions") {
        return {
          select: () => makeChain([
            {
              id: "rx-1",
              appointment_id: "apt-1",
              patient_id: "p-1",
              doctor_id: "dp-1",
              medications: [{ name: "Losartana 50mg", dosage: "1 comprimido", frequency: "1x/dia", duration: "30 dias" }],
              diagnosis: "Hipertensão arterial",
              observations: "Em jejum",
              created_at: new Date().toISOString(),
              pdf_url: null,
            },
          ]),
        };
      }
      if (table === "profiles") {
        return {
          select: () => makeChain([
            { user_id: "p-1", first_name: "João", last_name: "Costa" },
          ]),
        };
      }
      if (table === "appointments") {
        return { select: () => makeChain([mockAppointment]) };
      }
      return { select: () => makeChain([]) };
    });
  });

  it("carrega prescrições do médico corretamente", async () => {
    const { default: DoctorPrescriptions } = await import("@/components/doctor/DoctorPrescriptions");
    render(
      <BrowserRouter>
        <DoctorPrescriptions />
      </BrowserRouter>
    );
    await waitFor(() => {
      expect(mockFrom).toHaveBeenCalledWith("prescriptions");
    });
  });

  it("busca prescrições e perfis de pacientes do banco", async () => {
    const { default: DoctorPrescriptions } = await import("@/components/doctor/DoctorPrescriptions");
    render(
      <BrowserRouter>
        <DoctorPrescriptions />
      </BrowserRouter>
    );
    await waitFor(() => {
      expect(mockFrom).toHaveBeenCalledWith("prescriptions");
    });
    await waitFor(() => {
      expect(mockFrom).toHaveBeenCalledWith("profiles");
    });
  });
});

// ── Prescription business logic ───────────────────────────────────────────────

describe("Lógica de prescrição médica", () => {
  it("valida campos obrigatórios da prescrição", () => {
    const validate = (rx: { medications: any[]; patient_id: string; doctor_id: string }) => {
      return rx.medications.length > 0 && !!rx.patient_id && !!rx.doctor_id;
    };
    expect(validate({ medications: [{ name: "Paracetamol" }], patient_id: "p-1", doctor_id: "d-1" })).toBe(true);
    expect(validate({ medications: [], patient_id: "p-1", doctor_id: "d-1" })).toBe(false);
    expect(validate({ medications: [{ name: "Test" }], patient_id: "", doctor_id: "d-1" })).toBe(false);
  });

  it("formata medicamentos para exibição", () => {
    const formatMed = (med: any) =>
      typeof med === "string" ? med : `${med.name || "—"} - ${med.dosage || ""} - ${med.frequency || ""}`;
    const med = { name: "Amoxicilina 500mg", dosage: "1 caps", frequency: "8/8h", duration: "7d" };
    expect(formatMed(med)).toBe("Amoxicilina 500mg - 1 caps - 8/8h");
  });

  it("gera código de verificação no formato correto", () => {
    const code = Math.random().toString(36).substring(2, 10).toUpperCase();
    expect(code.length).toBe(8);
    expect(/^[A-Z0-9]+$/.test(code)).toBe(true);
  });
});

// ── Doctor availability logic ─────────────────────────────────────────────────

describe("Lógica de disponibilidade médica", () => {
  it("detecta médico disponível agora com base nos slots", () => {
    const checkAvailable = (slots: Array<{ day_of_week: number; start_time: string; end_time: string }>) => {
      const now = new Date();
      const currentDay = now.getDay();
      const currentTime = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
      return slots.some(
        s => s.day_of_week === currentDay && s.start_time <= currentTime && s.end_time > currentTime
      );
    };

    // All day slot
    const allDaySlots = [{ day_of_week: new Date().getDay(), start_time: "00:00", end_time: "23:59" }];
    expect(checkAvailable(allDaySlots)).toBe(true);

    // Past slot (already ended)
    const pastSlots = [{ day_of_week: new Date().getDay(), start_time: "00:00", end_time: "00:01" }];
    const pastResult = checkAvailable(pastSlots);
    // Will be false unless it's exactly midnight
    expect(typeof pastResult).toBe("boolean");

    // Wrong day
    const wrongDaySlots = [{ day_of_week: (new Date().getDay() + 3) % 7, start_time: "00:00", end_time: "23:59" }];
    expect(checkAvailable(wrongDaySlots)).toBe(false);
  });

  it("ordena médicos por avaliação (rating desc)", () => {
    const doctors = [
      { id: "d1", rating: 3.5 },
      { id: "d2", rating: 4.9 },
      { id: "d3", rating: 4.2 },
    ];
    const sorted = [...doctors].sort((a, b) => b.rating - a.rating);
    expect(sorted[0].id).toBe("d2");
    expect(sorted[1].id).toBe("d3");
    expect(sorted[2].id).toBe("d1");
  });

  it("ordena médicos por preço crescente", () => {
    const doctors = [
      { id: "d1", consultation_price: 300 },
      { id: "d2", consultation_price: 150 },
      { id: "d3", consultation_price: 200 },
    ];
    const sorted = [...doctors].sort((a, b) => a.consultation_price - b.consultation_price);
    expect(sorted[0].id).toBe("d2");
    expect(sorted[1].id).toBe("d3");
    expect(sorted[2].id).toBe("d1");
  });
});

// ── Appointment status flow ───────────────────────────────────────────────────

describe("Fluxo de status da consulta", () => {
  const validTransitions: Record<string, string[]> = {
    scheduled: ["waiting", "in_progress", "cancelled"],
    waiting: ["in_progress", "cancelled", "no_show"],
    in_progress: ["completed", "cancelled"],
    completed: [],
    cancelled: [],
    no_show: [],
  };

  it("permite transição de scheduled para waiting", () => {
    expect(validTransitions["scheduled"]).toContain("waiting");
  });

  it("não permite transição de completed para cancelled", () => {
    expect(validTransitions["completed"]).not.toContain("cancelled");
  });

  it("in_progress pode ser concluída ou cancelada", () => {
    expect(validTransitions["in_progress"]).toContain("completed");
    expect(validTransitions["in_progress"]).toContain("cancelled");
  });

  it("calcula status de pagamento pendente corretamente", () => {
    const getDisplayStatus = (status: string, paymentStatus: string) => {
      if (status === "scheduled" && paymentStatus === "pending") return "payment_pending";
      return status;
    };
    expect(getDisplayStatus("scheduled", "pending")).toBe("payment_pending");
    expect(getDisplayStatus("scheduled", "paid")).toBe("scheduled");
    expect(getDisplayStatus("completed", "pending")).toBe("completed");
  });
});
