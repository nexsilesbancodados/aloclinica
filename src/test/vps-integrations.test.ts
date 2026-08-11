import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// ── CompreFace ──────────────────────────────────────────────────────────────
describe("CompreFace — src/lib/compreface.ts", () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it("verificarFace é uma função exportada", async () => {
    const { verificarFace } = await import("@/lib/compreface");
    expect(typeof verificarFace).toBe("function");
  });

  it("detectarFace é uma função exportada", async () => {
    const { detectarFace } = await import("@/lib/compreface");
    expect(typeof detectarFace).toBe("function");
  });

  it("dataUrlToFile converte data URL em File corretamente", async () => {
    const { dataUrlToFile } = await import("@/lib/compreface");
    // Use a minimal valid data URL (jsdom doesn't support canvas.toDataURL)
    const dataUrl =
      "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAgGBg==";
    const file = dataUrlToFile(dataUrl, "selfie.jpg");
    expect(file).toBeInstanceOf(File);
    expect(file.name).toBe("selfie.jpg");
    expect(file.type).toBe("image/jpeg");
    expect(file.size).toBeGreaterThan(0);
  });

  it("verificarFace retorna aprovado=false quando similarity < 0.85", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        result: [{ face_matches: [{ similarity: 0.72 }] }],
      }),
    });
    const { verificarFace } = await import("@/lib/compreface");
    const file = new File(["test"], "test.jpg", { type: "image/jpeg" });
    const result = await verificarFace(file, file);
    expect(result.aprovado).toBe(false);
    expect(result.similarity).toBe(0.72);
  });

  it("verificarFace retorna aprovado=true quando similarity >= 0.85", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        result: [{ face_matches: [{ similarity: 0.93 }] }],
      }),
    });
    const { verificarFace } = await import("@/lib/compreface");
    const file = new File(["test"], "test.jpg", { type: "image/jpeg" });
    const result = await verificarFace(file, file);
    expect(result.aprovado).toBe(true);
    expect(result.similarity).toBe(0.93);
  });

  it("verificarFace lança erro quando API retorna status não-ok", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      text: async () => "Internal Server Error",
    });
    const { verificarFace } = await import("@/lib/compreface");
    const file = new File(["test"], "test.jpg", { type: "image/jpeg" });
    await expect(verificarFace(file, file)).rejects.toThrow(
      "CompreFace verify error 500"
    );
  });

  it("detectarFace retorna faceDetected=true quando há rostos", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ result: [{ age: 30 }, { age: 25 }] }),
    });
    const { detectarFace } = await import("@/lib/compreface");
    const file = new File(["test"], "test.jpg", { type: "image/jpeg" });
    const result = await detectarFace(file);
    expect(result.faceDetected).toBe(true);
    expect(result.facesCount).toBe(2);
  });

  it("detectarFace retorna faceDetected=false quando não há rostos", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ result: [] }),
    });
    const { detectarFace } = await import("@/lib/compreface");
    const file = new File(["test"], "test.jpg", { type: "image/jpeg" });
    const result = await detectarFace(file);
    expect(result.faceDetected).toBe(false);
    expect(result.facesCount).toBe(0);
  });
});

// ── Jitsi Meet ──────────────────────────────────────────────────────────────
describe("Jitsi Meet — src/lib/jitsi.ts", () => {
  it("JITSI_BASE_URL aponta para o servidor correto", async () => {
    const { JITSI_BASE_URL } = await import("@/lib/jitsi");
    expect(JITSI_BASE_URL).toBe("https://meet.telemedicinaaloclinica.sbs");
  });

  it("gerarRoomId cria ID baseado no appointmentId", async () => {
    const { gerarRoomId } = await import("@/lib/jitsi");
    const id = gerarRoomId("abc-123");
    expect(id).toContain("abc-123");
    expect(id).toMatch(/^consulta-/);
  });

  it("gerarRoomId gera IDs diferentes para appointments diferentes", async () => {
    const { gerarRoomId } = await import("@/lib/jitsi");
    const id1 = gerarRoomId("appt-1");
    const id2 = gerarRoomId("appt-2");
    expect(id1).not.toBe(id2);
  });

  it("getJitsiUrl retorna URL válida com o domínio correto", async () => {
    const { getJitsiUrl, gerarRoomId } = await import("@/lib/jitsi");
    const roomId = gerarRoomId("test-123");
    const url = getJitsiUrl(roomId, "Dr. João Silva");
    expect(url).toContain("meet.telemedicinaaloclinica.sbs");
    expect(url).toContain(roomId);
  });

  it("getJitsiUrl inclui o displayName encoded na URL", async () => {
    const { getJitsiUrl, gerarRoomId } = await import("@/lib/jitsi");
    const url = getJitsiUrl(gerarRoomId("test"), "Dr. Maria");
    // Pós-migração Jitsi → MiroTalk: URLSearchParams codifica espaço como '+'
    expect(url).toMatch(/name=Dr\.(%20|\+)Maria/);
  });

  it("getJitsiUrl inclui parâmetros de configuração da videochamada", async () => {
    // Após migração Jitsi → MiroTalk, params mudaram para audio/video/screen/notify.
    const { getJitsiUrl, gerarRoomId } = await import("@/lib/jitsi");
    const url = getJitsiUrl(gerarRoomId("test"), "Paciente");
    expect(url).toContain("audio=1");
    expect(url).toContain("video=1");
    expect(url).toContain("screen=0");
    expect(url).toContain("notify=0");
  });

  it("getJitsiUrl monta endpoint /join/<roomId>", async () => {
    const { getJitsiUrl, gerarRoomId } = await import("@/lib/jitsi");
    const roomId = gerarRoomId("test-xyz");
    const url = getJitsiUrl(roomId, "User");
    expect(url).toContain(`/join/${encodeURIComponent(roomId)}`);
  });

  it("JITSI_BASE_URL não aponta para localhost", async () => {
    const { JITSI_BASE_URL } = await import("@/lib/jitsi");
    expect(JITSI_BASE_URL).not.toContain("localhost");
    expect(JITSI_BASE_URL).not.toContain("example.com");
  });
});

// ── DocuSeal ────────────────────────────────────────────────────────────────
const mockInvoke = vi.fn();
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    auth: {
      getSession: vi.fn().mockResolvedValue({ data: { session: { access_token: "test-access-token" } } }),
    },
    functions: {
      invoke: (...args: any[]) => mockInvoke(...args),
    },
  },
}));

describe("DocuSeal — src/lib/docuseal.ts", () => {
  beforeEach(() => {
    mockInvoke.mockReset();
  });

  it("criarDocumentoParaAssinar retorna template_id quando sucesso", async () => {
    mockInvoke.mockResolvedValue({
      data: { template_id: 42 },
      error: null,
    });
    const { criarDocumentoParaAssinar } = await import("@/lib/docuseal");
    const id = await criarDocumentoParaAssinar("base64pdf", "Atestado Médico");
    expect(id).toBe(42);
    expect(mockInvoke).toHaveBeenCalledWith("docuseal-proxy", {
      body: {
        action: "create_template",
        pdf_base64: "base64pdf",
        nome_doc: "Atestado Médico",
      },
    });
  });

  it("criarDocumentoParaAssinar lança erro quando template_id não retornado", async () => {
    mockInvoke.mockResolvedValue({ data: {}, error: null });
    const { criarDocumentoParaAssinar } = await import("@/lib/docuseal");
    await expect(
      criarDocumentoParaAssinar("pdf", "Atestado")
    ).rejects.toThrow("Template ID não retornado");
  });

  it("criarDocumentoParaAssinar lança erro quando edge function falha", async () => {
    mockInvoke.mockResolvedValue({
      data: null,
      error: { message: "Edge function error" },
    });
    const { criarDocumentoParaAssinar } = await import("@/lib/docuseal");
    await expect(
      criarDocumentoParaAssinar("pdf", "Atestado")
    ).rejects.toThrow("Edge function error");
  });

  it("enviarParaAssinatura retorna submission_id e signing_url", async () => {
    mockInvoke.mockResolvedValue({
      data: {
        submission_id: 99,
        signing_url: "https://docuseal.exemplo.com/sign/abc",
      },
      error: null,
    });
    const { enviarParaAssinatura } = await import("@/lib/docuseal");
    const result = await enviarParaAssinatura(42, "medico@teste.com", "Dr. Teste");
    expect(result.submission_id).toBe(99);
    expect(result.signing_url).toContain("docuseal");
    expect(mockInvoke).toHaveBeenCalledWith("docuseal-proxy", {
      body: {
        action: "create_submission",
        template_id: 42,
        email: "medico@teste.com",
        nome: "Dr. Teste",
      },
    });
  });

  it("verificarAssinatura retorna status completed quando assinado", async () => {
    mockInvoke.mockResolvedValue({
      data: {
        status: "completed",
        completed: true,
        documents: [
          { url: "https://example.com/doc.pdf", filename: "atestado.pdf" },
        ],
      },
      error: null,
    });
    const { verificarAssinatura } = await import("@/lib/docuseal");
    const result = await verificarAssinatura(99);
    expect(result.completed).toBe(true);
    expect(result.status).toBe("completed");
    expect(result.documents[0].url).toContain("pdf");
    expect(mockInvoke).toHaveBeenCalledWith("docuseal-proxy", {
      body: { action: "check_submission", submission_id: 99 },
    });
  });
});


// ── WhatsApp ────────────────────────────────────────────────────────────────
describe("WhatsApp — src/lib/whatsapp.ts", () => {
  beforeEach(() => {
    mockInvoke.mockReset();
  });

  it("sendWhatsApp é uma função exportada", async () => {
    const { sendWhatsApp } = await import("@/lib/whatsapp");
    expect(typeof sendWhatsApp).toBe("function");
  });

  it("sendWhatsApp retorna success:true quando Edge Function sucede", async () => {
    mockInvoke.mockResolvedValue({
      data: { sent: true },
      error: null,
    });
    const { sendWhatsApp } = await import("@/lib/whatsapp");
    const result = await sendWhatsApp("5511999999999", "Olá, teste!");
    expect(result.success).toBe(true);
    expect(mockInvoke).toHaveBeenCalledWith("send-whatsapp", {
      body: { phone: "5511999999999", message: "Olá, teste!" },
    });
  });

  it("sendWhatsApp retorna success:false quando Edge Function falha", async () => {
    mockInvoke.mockResolvedValue({
      data: null,
      error: { message: "Function error" },
    });
    const { sendWhatsApp } = await import("@/lib/whatsapp");
    const result = await sendWhatsApp("5511999999999", "Teste");
    expect(result.success).toBe(false);
  });

  it("triggerAppointmentConfirmed dispara appointment-confirmed", async () => {
    mockInvoke.mockResolvedValue({
      data: { sent: true },
      error: null,
    });
    const { triggerAppointmentConfirmed } = await import("@/lib/whatsapp");
    const result = await triggerAppointmentConfirmed("appt-abc-123");
    expect(result.success).toBe(true);
    expect(mockInvoke).toHaveBeenCalledWith("appointment-confirmed", {
      body: { appointment_id: "appt-abc-123" },
    });
  });

  it("triggerAppointmentConfirmed retorna success:false quando falha", async () => {
    mockInvoke.mockResolvedValue({
      data: null,
      error: { message: "Not found" },
    });
    const { triggerAppointmentConfirmed } = await import("@/lib/whatsapp");
    const result = await triggerAppointmentConfirmed("appt-xyz");
    expect(result.success).toBe(false);
  });
});

// ── Integração geral — servidores VPS ───────────────────────────────────────
describe("Configuração dos servidores VPS", () => {
  it("todos os endpoints da VPS estão definidos corretamente", async () => {
    const compreface = await import("@/lib/compreface");
    expect(compreface.verificarFace).toBeDefined();
    expect(compreface.detectarFace).toBeDefined();
    expect(compreface.dataUrlToFile).toBeDefined();

    const docuseal = await import("@/lib/docuseal");
    expect(docuseal.criarDocumentoParaAssinar).toBeDefined();
    expect(docuseal.enviarParaAssinatura).toBeDefined();
    expect(docuseal.verificarAssinatura).toBeDefined();

    const jitsi = await import("@/lib/jitsi");
    expect(jitsi.JITSI_BASE_URL).toBe("https://meet.telemedicinaaloclinica.sbs");
    expect(jitsi.gerarRoomId).toBeDefined();
    expect(jitsi.getJitsiUrl).toBeDefined();

    const whatsapp = await import("@/lib/whatsapp");
    expect(whatsapp.sendWhatsApp).toBeDefined();
    expect(whatsapp.triggerAppointmentConfirmed).toBeDefined();
  });

  it("URLs da VPS não apontam para localhost ou exemplo", async () => {
    const jitsi = await import("@/lib/jitsi");
    expect(jitsi.JITSI_BASE_URL).not.toContain("localhost");
    expect(jitsi.JITSI_BASE_URL).not.toContain("example.com");
  });
});
