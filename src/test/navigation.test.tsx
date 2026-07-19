import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

// Mock supabase
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    auth: {
      onAuthStateChange: vi.fn(() => ({ data: { subscription: { unsubscribe: vi.fn() } } })),
      getSession: vi.fn(() => Promise.resolve({ data: { session: null } })),
      signOut: vi.fn(),
    },
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          single: vi.fn(() => Promise.resolve({ data: null })),
          maybeSingle: vi.fn(() => Promise.resolve({ data: null })),
        })),
      })),
    })),
  },
}));

// Mock framer-motion
vi.mock("framer-motion", () => ({
  motion: new Proxy({}, {
    get: () => ({ children, ...props }: any) => {
      const { initial, animate, exit, whileInView, whileHover, whileTap, transition, viewport, variants, ...rest } = props;
      return <div {...rest}>{children}</div>;
    },
  }),
  AnimatePresence: ({ children }: any) => <>{children}</>,
  useMotionValue: () => ({ set: vi.fn() }),
  useTransform: () => ({ set: vi.fn() }),
  useSpring: (v: any) => v,
  useInView: () => true,
}));

// Mock all image assets
vi.mock("@/assets/logo.png", () => ({ default: "logo.png" }));
vi.mock("@/assets/hero-doctor.png", () => ({ default: "hero.png" }));
vi.mock("@/assets/mascot-wave.png", () => ({ default: "wave.png" }));
vi.mock("@/assets/mascot-thumbsup.png", () => ({ default: "t.png" }));
vi.mock("@/assets/mascot-reading.png", () => ({ default: "r.png" }));
vi.mock("@/assets/mascot-welcome.png", () => ({ default: "w.png" }));
vi.mock("@/assets/mascot.png", () => ({ default: "m.png" }));
vi.mock("@/assets/mascot-animated.mp4", () => ({ default: "m.mp4" }));
vi.mock("@/assets/patient-virtual-assistant.png", () => ({ default: "p.png" }));
vi.mock("@/assets/devices-mascot.jpg", () => ({ default: "d.png" }));
vi.mock("@/assets/support-section.png", () => ({ default: "s.png" }));
vi.mock("@/assets/clinic-receptionist.png", () => ({ default: "c.png" }));
vi.mock("@/assets/clinic-patient-chat.png", () => ({ default: "c2.png" }));
vi.mock("@/assets/how-it-works-signup.png", () => ({ default: "h1.png" }));
vi.mock("@/assets/how-it-works-booking.png", () => ({ default: "h2.png" }));
vi.mock("@/assets/how-it-works-consultation.png", () => ({ default: "h3.png" }));
vi.mock("@/assets/how-it-works-prescription.png", () => ({ default: "h4.png" }));
vi.mock("@/assets/doctor-premium-1.png", () => ({ default: "dp1.png" }));
vi.mock("@/assets/doctor-premium-2.png", () => ({ default: "dp2.png" }));
vi.mock("@/assets/doctor-signup-1.png", () => ({ default: "ds1.png" }));
vi.mock("@/assets/doctor-signup-2.png", () => ({ default: "ds2.png" }));
vi.mock("@/assets/avatar-ana.png", () => ({ default: "a.png" }));
vi.mock("@/assets/avatar-carlos.png", () => ({ default: "a2.png" }));
vi.mock("@/assets/avatar-maria.png", () => ({ default: "a3.png" }));
vi.mock("@/assets/card-ai.png", () => ({ default: "c1.png" }));
vi.mock("@/assets/card-multidisciplinary.png", () => ({ default: "c2.png" }));
vi.mock("@/assets/card-specialties.png", () => ({ default: "c3.png" }));
vi.mock("@/assets/card-trained.png", () => ({ default: "c4.png" }));
vi.mock("@/assets/spec-cardiology.jpg", () => ({ default: "sp.png" }));
vi.mock("@/assets/spec-dermatology.jpg", () => ({ default: "sp.png" }));
vi.mock("@/assets/spec-endocrinology.png", () => ({ default: "sp.png" }));
vi.mock("@/assets/spec-general.png", () => ({ default: "sp.png" }));
vi.mock("@/assets/spec-neurology.png", () => ({ default: "sp.png" }));
vi.mock("@/assets/spec-orthopedics.png", () => ({ default: "sp.png" }));
vi.mock("@/assets/spec-pediatrics.png", () => ({ default: "sp.png" }));
vi.mock("@/assets/spec-acupuntura.png", () => ({ default: "sp.png" }));
vi.mock("@/assets/spec-alergia.jpg", () => ({ default: "sp.png" }));
vi.mock("@/assets/spec-angiologia.jpg", () => ({ default: "sp.png" }));
vi.mock("@/assets/spec-cirurgia.jpg", () => ({ default: "sp.png" }));
vi.mock("@/assets/spec-coloproctologia.jpg", () => ({ default: "sp.png" }));
vi.mock("@/assets/spec-gastro.png", () => ({ default: "sp.png" }));
vi.mock("@/assets/spec-geriatria.png", () => ({ default: "sp.png" }));
vi.mock("@/assets/spec-ginecologia.png", () => ({ default: "sp.png" }));
vi.mock("@/assets/spec-hematologia.jpg", () => ({ default: "sp.png" }));
vi.mock("@/assets/spec-infectologia.png", () => ({ default: "sp.png" }));
vi.mock("@/assets/spec-mastologia.jpg", () => ({ default: "sp.png" }));
vi.mock("@/assets/spec-familia.png", () => ({ default: "sp.png" }));
vi.mock("@/assets/spec-esporte.jpg", () => ({ default: "sp.png" }));
vi.mock("@/assets/spec-nefrologia.png", () => ({ default: "sp.png" }));
vi.mock("@/assets/spec-nutrologia.png", () => ({ default: "sp.png" }));
vi.mock("@/assets/spec-oncologia.png", () => ({ default: "sp.png" }));
vi.mock("@/assets/spec-otorrino.png", () => ({ default: "sp.png" }));
vi.mock("@/assets/spec-pneumologia.png", () => ({ default: "sp.png" }));
vi.mock("@/assets/spec-psiquiatria.png", () => ({ default: "sp.png" }));
vi.mock("@/assets/spec-radiologia.jpg", () => ({ default: "sp.png" }));
vi.mock("@/assets/spec-reumatologia.png", () => ({ default: "sp.png" }));
vi.mock("@/assets/spec-urologia.png", () => ({ default: "sp.png" }));
vi.mock("@/assets/spec-anestesiologia.jpg", () => ({ default: "sp.png" }));
vi.mock("@/assets/spec-endoscopia.jpg", () => ({ default: "sp.png" }));
vi.mock("@/assets/spec-genetica.jpg", () => ({ default: "sp.png" }));
vi.mock("@/assets/spec-homeopatia.png", () => ({ default: "sp.png" }));
vi.mock("@/assets/spec-plastica.png", () => ({ default: "sp.png" }));
vi.mock("@/assets/spec-cirurgia-cardio.jpg", () => ({ default: "sp.png" }));
vi.mock("@/assets/spec-intensiva.jpg", () => ({ default: "sp.png" }));
vi.mock("@/assets/spec-cabeca-pescoco.jpg", () => ({ default: "sp.png" }));
vi.mock("@/assets/spec-cirurgia-vascular.jpg", () => ({ default: "sp.png" }));

// Mock Sentry
vi.mock("@/lib/sentry", () => ({
  initSentry: vi.fn(),
  Sentry: { init: vi.fn() },
}));

describe("Route Navigation", () => {
  it("renders NotFound for unknown routes", async () => {
    const NotFound = (await import("@/pages/NotFound")).default;
    render(
      <MemoryRouter initialEntries={["/rota-inexistente"]} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <NotFound />
      </MemoryRouter>
    );
    expect(screen.getByText("404")).toBeInTheDocument();
  });

  it("renderiza a página Auth com cards de seleção de perfil", async () => {
    const Auth = (await import("@/pages/Auth")).default;
    render(
      <MemoryRouter initialEntries={["/paciente"]} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <Auth />
      </MemoryRouter>
    );
    // A página Auth pós-redesign mostra cards de perfil por padrão
    expect(screen.getByText("Sou paciente")).toBeInTheDocument();
    expect(screen.getByText("Sou médico")).toBeInTheDocument();
  });
});
