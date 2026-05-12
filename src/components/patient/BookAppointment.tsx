import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { db } from "@/integrations/supabase/untyped";
import { triggerAppointmentConfirmed } from "@/lib/whatsapp";
import { notifyNewAppointment, notifyPaymentConfirmed } from "@/lib/notifications";
import { useAuth } from "@/contexts/AuthContext";
import { logError } from "@/lib/logger";
import { explainError, toastError } from "@/lib/errorMessages";
import { validateCard } from "@/lib/card-utils";
import DashboardLayout from "@/components/dashboards/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Calendar } from "@/components/ui/calendar";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { toast } from "sonner";
import {
  ArrowLeft, Clock, Star, Check, UserPlus, UserCheck, AlertTriangle, Loader2,
  CalendarDays, CheckCircle2, ChevronRight, Stethoscope, QrCode, CreditCard,
  FileBarChart, Lock, Shield, Copy, Tag, X as XIcon
} from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { format, addDays, setHours, setMinutes, isBefore } from "date-fns";
import { ptBR } from "date-fns/locale";
import { cn } from "@/lib/utils";
import { motion, AnimatePresence } from "framer-motion";
import { getFeriadosNacionais } from "@/lib/feriados";

import { getPatientNav } from "./patientNav";
import {
  type PaymentMethod,
  type DoctorInfo,
  STEPS,
  RECURRENCE_OPTIONS,
  RECURRENCE_WEEKS,
  KYC_PENDING_KEY,
} from "./BookAppointment.types";
import { usePixCountdown } from "@/hooks/usePixCountdown";

const patientNav = getPatientNav("schedule");

const BookAppointment = () => {
  const { doctorId } = useParams();
  const { user } = useAuth();
  const navigate = useNavigate();
  const kycPending = localStorage.getItem(KYC_PENDING_KEY) === "true";

  const [doctor, setDoctor] = useState<DoctorInfo | null>(null);
  const [selectedDate, setSelectedDate] = useState<Date | undefined>(undefined);
  const [selectedTime, setSelectedTime] = useState<string | null>(null);
  const [appointmentType, setAppointmentType] = useState<string>("first_visit");
  const [bookedSlots, setBookedSlots] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [booking, setBooking] = useState(false);
  const [dependents, setDependents] = useState<{ id: string; name: string; relationship: string }[]>([]);
  const [bookingFor, setBookingFor] = useState<string>("self");
  const [feriados, setFeriados] = useState<Date[]>([]);
  const [recurrence, setRecurrence] = useState("none");
  const [recurrenceCount, setRecurrenceCount] = useState(4);

  // Return eligibility
  const [returnEligible, setReturnEligible] = useState(false);
  const [originalPrice, setOriginalPrice] = useState<number | null>(null);

  // Payment state
  const [paymentStep, setPaymentStep] = useState(false);
  const [appointmentId, setAppointmentId] = useState<string | null>(null);
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("pix");
  const [processing, setProcessing] = useState(false);
  const [pixQrCode, setPixQrCode] = useState<string | null>(null);
  const [pixCopyPaste, setPixCopyPaste] = useState<string | null>(null);
  const [boletoUrl, setBoletoUrl] = useState<string | null>(null);
  const [pixCopied, setPixCopied] = useState(false);
  const [cardName, setCardName] = useState("");
  const [cardNumber, setCardNumber] = useState("");
  const [cardExpiry, setCardExpiry] = useState("");
  const [cardCvv, setCardCvv] = useState("");
  const [cardDiscount, setCardDiscount] = useState(0);

  // Coupon state
  const [couponInput, setCouponInput] = useState("");
  const [couponCode, setCouponCode] = useState<string | null>(null);
  const [couponDiscount, setCouponDiscount] = useState(0);
  const [couponLoading, setCouponLoading] = useState(false);

  const currentStep = paymentStep ? 3 : !selectedDate ? 0 : !selectedTime ? 1 : 2;

  useEffect(() => {
    if (user) {
      db.from("dependents").select("id, name, relationship").eq("user_id", user.id)
        .then(({ data }) => setDependents(data ?? []));
    }
    const currentYear = new Date().getFullYear();
    Promise.all([getFeriadosNacionais(currentYear), getFeriadosNacionais(currentYear + 1)])
      .then(([f1, f2]) => setFeriados([...f1, ...f2]));
  }, [user]);

  useEffect(() => {
    if (doctorId) fetchDoctor();
  }, [doctorId]);

  // Check return eligibility
  useEffect(() => {
    const checkReturn = async () => {
      if (appointmentType !== "return" || !user || !doctorId) {
        setReturnEligible(false);
        setOriginalPrice(null);
        return;
      }
      const { data } = await db
        .from("appointments")
        .select("id, price_at_booking, return_deadline")
        .eq("patient_id", user.id)
        .eq("doctor_id", doctorId)
        .eq("status", "completed")
        .not("return_deadline", "is", null)
        .gte("return_deadline", new Date().toISOString())
        .order("scheduled_at", { ascending: false })
        .limit(1);
      if (data && data.length > 0) {
        setReturnEligible(true);
        setOriginalPrice(data[0].price_at_booking);
      } else {
        setReturnEligible(false);
        setOriginalPrice(null);
      }
    };
    checkReturn();
  }, [appointmentType, user, doctorId]);

  useEffect(() => {
    if (selectedDate && doctorId) fetchBookedSlots();
  }, [selectedDate]);

  // PIX expiry countdown (Asaas QR codes expire after 30 minutes)
  const { secondsLeft: pixSecondsLeft, expired: pixExpired } = usePixCountdown(pixQrCode, () => {
    toast.error("PIX expirado", { description: "O QR Code expirou. Clique em 'Gerar novo PIX' para continuar." });
  });

  // Realtime payment confirmation with fallback polling
  useEffect(() => {
    if (!paymentStep || !appointmentId) return;
    const hasPending = pixQrCode || boletoUrl;
    if (!hasPending) return;

    let pollTimeout: NodeJS.Timeout | null = null;
    let pollInterval: NodeJS.Timeout | null = null;
    let isSubscribed = true;

    // Realtime listener
    const channel = db
      .channel(`payment-${appointmentId}`)
      .on("postgres_changes", {
        event: "UPDATE",
        schema: "public",
        table: "appointments",
        filter: `id=eq.${appointmentId}`
      }, (payload) => {
        if (isSubscribed && ["approved", "confirmed", "received"].includes(payload.new.payment_status)) {
          cleanup();
          toast.success("✅ Pagamento confirmado! Consulta garantida.");
          navigate("/dashboard/appointments");
        }
      })
      .subscribe((status) => {
        if (status === "SUBSCRIBED") {
          // Reset fallback when realtime connects
          if (pollInterval) clearInterval(pollInterval);
        } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
          // Start fallback polling if realtime fails
          startFallbackPoll();
        }
      });

    const cleanup = () => {
      isSubscribed = false;
      if (pollTimeout) clearTimeout(pollTimeout);
      if (pollInterval) clearInterval(pollInterval);
      channel.unsubscribe();
    };

    const startFallbackPoll = () => {
      if (!isSubscribed) return;
      pollInterval = setInterval(async () => {
        const { data } = await db
          .from("appointments")
          .select("payment_status")
          .eq("id", appointmentId)
          .in("payment_status", ["approved", "confirmed", "received"])
          .limit(1);
        if (data && data.length > 0) {
          cleanup();
          toast.success("✅ Pagamento confirmado! Consulta garantida.");
          navigate("/dashboard/appointments");
        }
      }, 8000);
    };

    // Start fallback polling after 10 seconds if realtime not connected
    pollTimeout = setTimeout(() => {
      if ((channel as any).state !== "SUBSCRIBED") {
        startFallbackPoll();
      }
    }, 10000);

    return cleanup;
  }, [paymentStep, appointmentId, pixQrCode, boletoUrl]);

  const fetchDoctor = async () => {
    try {
      const { data: doc, error } = await db
        .from("doctor_profiles")
        .select("id, user_id, crm, crm_state, bio, consultation_price, rating, experience_years, doctor_type")
        .eq("id", doctorId!)
        .single();

      if (error || !doc) {
        toast.error("Médico não encontrado", { description: "Verifique o link e tente novamente." });
        navigate(-1);
        setLoading(false);
        return;
      }

      const [profileRes, specsRes, slotsRes] = await Promise.all([
        db.from("profiles").select("first_name, last_name").eq("user_id", doc.user_id).single(),
        db.from("doctor_specialties").select("specialties(name)").eq("doctor_id", doc.id),
        db.from("availability_slots").select("day_of_week, start_time, end_time").eq("doctor_id", doc.id).eq("is_active", true),
      ]);

      setDoctor({
        ...doc,
        consultation_price: Number(doc.consultation_price),
        rating: Number(doc.rating),
        first_name: profileRes.data?.first_name ?? "",
        last_name: profileRes.data?.last_name ?? "",
        specialties: specsRes.data?.map((s: { specialties?: { name?: string } | null }) => s.specialties?.name).filter(Boolean) as string[] ?? [],
        slots: slotsRes.data ?? [],
      });
    } catch (err) {
      logError("[BookAppointment] fetchDoctor error", err);
      toast.error("Erro ao carregar médico", { description: "Tente novamente." });
      navigate(-1);
    } finally {
      setLoading(false);
    }
  };

  const fetchBookedSlots = async () => {
    if (!selectedDate || !doctorId) return;
    const dayStart = new Date(selectedDate);
    dayStart.setHours(0, 0, 0, 0);
    const dayEnd = new Date(selectedDate);
    dayEnd.setHours(23, 59, 59, 999);

    const { data } = await db
      .from("appointments")
      .select("scheduled_at")
      .eq("doctor_id", doctorId)
      .gte("scheduled_at", dayStart.toISOString())
      .lte("scheduled_at", dayEnd.toISOString())
      .neq("status", "cancelled");

    setBookedSlots(data?.map(a => format(new Date(a.scheduled_at), "HH:mm")) ?? []);
  };

  const getAvailableTimesForDate = (date: Date): string[] => {
    if (!doctor) return [];
    const dayOfWeek = date.getDay();
    const daySlots = doctor.slots.filter(s => s.day_of_week === dayOfWeek);

    const times: string[] = [];
    daySlots.forEach(slot => {
      const [startH, startM] = slot.start_time.split(":").map(Number);
      const [endH, endM] = slot.end_time.split(":").map(Number);
      let h = startH, m = startM;

      while (h < endH || (h === endH && m < endM)) {
        const timeStr = `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
        const slotDateTime = setMinutes(setHours(new Date(date), h), m);

        if (!bookedSlots.includes(timeStr) && !isBefore(slotDateTime, new Date())) {
          times.push(timeStr);
        }
        m += 30;
        if (m >= 60) { h++; m = 0; }
      }
    });

    return times;
  };

  const isDayAvailable = (date: Date): boolean => {
    if (!doctor) return false;
    if (isBefore(date, new Date()) && date.toDateString() !== new Date().toDateString()) return false;
    const isFeriado = feriados.some(f => f.getFullYear() === date.getFullYear() && f.getMonth() === date.getMonth() && f.getDate() === date.getDate());
    if (isFeriado) return false;
    const dayOfWeek = date.getDay();
    return doctor.slots.some(s => s.day_of_week === dayOfWeek);
  };

  const fullPrice = doctor?.consultation_price ?? 89;
  const basePrice = (appointmentType === "return" && returnEligible) ? Math.round(fullPrice * 0.5 * 100) / 100 : fullPrice;
  const discountAmount = basePrice * (cardDiscount / 100);
  const couponAmount = basePrice * (couponDiscount / 100);
  const totalPrice = Math.max(basePrice - discountAmount - couponAmount, 0);

  const applyCoupon = async () => {
    const code = couponInput.trim().toUpperCase();
    if (!code) return;
    setCouponLoading(true);
    try {
      const { data, error } = await db
        .from("coupons")
        .select("id, code, discount_percentage, max_uses, times_used, expires_at, is_active")
        .eq("code", code)
        .maybeSingle();
      if (error || !data) {
        toast.error("Cupom inválido", { description: "Verifique o código e tente novamente." });
        setCouponLoading(false);
        return;
      }
      if (!data.is_active) {
        toast.error("Cupom inativo");
        setCouponLoading(false);
        return;
      }
      if (data.expires_at && new Date(data.expires_at) < new Date()) {
        toast.error("Cupom expirado");
        setCouponLoading(false);
        return;
      }
      if (data.max_uses && data.times_used >= data.max_uses) {
        toast.error("Cupom esgotado");
        setCouponLoading(false);
        return;
      }
      setCouponCode(data.code);
      setCouponDiscount(Number(data.discount_percentage) || 0);
      toast.success(`Cupom ${data.code} aplicado!`, {
        description: `${data.discount_percentage}% de desconto na consulta.`,
      });
    } catch {
      toast.error("Não foi possível validar o cupom");
    }
    setCouponLoading(false);
  };

  const removeCoupon = () => {
    setCouponCode(null);
    setCouponDiscount(0);
    setCouponInput("");
  };

  // Step 1: Create appointment, then move to payment
  const handleBook = async () => {
    if (!selectedDate || !selectedTime || !doctor || !user) return;
    setBooking(true);

    const [h, m] = selectedTime.split(":").map(Number);
    const scheduledAt = setMinutes(setHours(new Date(selectedDate), h), m);

    const dependentInfo = bookingFor !== "self" ? dependents.find(d => d.id === bookingFor) : null;
    const notesText = dependentInfo ? `Consulta para dependente: ${dependentInfo.name} (${dependentInfo.relationship})` : null;

    // Build list of dates (single or recurring)
    const datesToBook: Date[] = [scheduledAt];
    if (recurrence !== "none") {
      const weeksGap = RECURRENCE_WEEKS[recurrence] ?? 1;
      for (let i = 1; i < recurrenceCount; i++) {
        datesToBook.push(addDays(scheduledAt, weeksGap * 7 * i));
      }
    }

    let firstApptId: string | null = null;
    let errorOccurred = false;

    for (const dt of datesToBook) {
      // Use doctor_type as appointment_type if available (telemedicina/oftalmologia),
      // otherwise use appointmentType (first_visit/return)
      const apptType = firstApptId
        ? "return"
        : (doctor.doctor_type && ["telemedicina", "oftalmologia"].includes(doctor.doctor_type))
          ? doctor.doctor_type
          : appointmentType;

      const { data: insertedAppt, error } = await db.from("appointments").insert({
        patient_id: user.id,
        doctor_id: doctor.id,
        scheduled_at: dt.toISOString(),
        status: "scheduled",
        payment_status: "pending",
        appointment_type: apptType,
        notes: notesText ? notesText + (firstApptId ? ` | Recorrente` : "") : (firstApptId ? "Agendamento recorrente" : null),
        original_appointment_id: firstApptId || null,
        price_at_booking: basePrice,
      }).select("id").single();

      if (error || !insertedAppt) {
        errorOccurred = true;
        break;
      }

      if (!firstApptId) firstApptId = insertedAppt.id;
    }

    setBooking(false);

    if (errorOccurred || !firstApptId) {
      toastError(toast, errorOccurred || "agendamento_falhou", "agendamento");
    } else {
      setAppointmentId(firstApptId);
      setPaymentStep(true);
      toast.success("Consulta reservada! Agora finalize o pagamento.");
    }
  };

  // Step 2: Process payment via Asaas
  const handlePayment = async () => {
    if (!user || !doctor || !appointmentId) return;
    if (paymentMethod === "card") {
      const cardError = validateCard(cardName, cardNumber, cardExpiry, cardCvv);
      if (cardError) { toast.error(cardError); return; }
    }
    setProcessing(true);

    try {
      const { data: profile } = await db
        .from("profiles")
        .select("first_name, last_name, cpf, phone")
        .eq("user_id", user.id)
        .single();

      if (!profile?.cpf) {
        toast.error("CPF obrigatório", { description: "Complete seu perfil com o CPF antes de pagar." });
        setProcessing(false);
        return;
      }

      const methodMap: Record<PaymentMethod, "pix" | "credit_card" | "boleto"> = {
        pix: "pix",
        card: "credit_card",
        boleto: "boleto",
      };

      const payload: Record<string, any> = {
        amount: totalPrice,
        payment_method: methodMap[paymentMethod],
        reference_id: `appointment_${appointmentId}`,
        description: `Consulta médica AloClínica`,
      };

      // Card tokenization via Mercado Pago JS SDK
      if (paymentMethod === "card") {
        const [expiryMonth, expiryYear] = cardExpiry.split("/");
        try {
          const { createCardToken, detectCardBrand } = await import("@/lib/mercadopago");
          const token = await createCardToken({
            cardNumber: cardNumber.replace(/\s/g, ""),
            cardholderName: cardName,
            cardExpirationMonth: expiryMonth,
            cardExpirationYear: expiryYear,
            securityCode: cardCvv,
            identificationType: "CPF",
            identificationNumber: profile.cpf,
          });
          payload.card_token = token.id;
          payload.payment_method_id = token.payment_method_id ?? detectCardBrand(cardNumber);
          payload.installments = 1;
        } catch (e) {
          toastError(toast, e, "pagamento");
          setProcessing(false);
          return;
        }
      }

      const { data, error } = await db.functions.invoke("mercadopago-create-payment", { body: payload });

      if (error || !data?.payment_id || data?.error) {
        toastError(toast, data?.error || error?.message || "pagamento_falhou", "pagamento");
        setProcessing(false);
        return;
      }

      if (paymentMethod === "pix") {
        setPixQrCode(data.qr_code_base64 || null);
        setPixCopyPaste(data.qr_code || null);
        setProcessing(false);
        toast.success("PIX gerado! 🎉", { description: "Escaneie o QR Code para pagar." });
        return;
      }

      if (paymentMethod === "boleto") {
        setBoletoUrl(data.boleto_url || null);
        setProcessing(false);
        toast.success("Boleto gerado! 📄");
        return;
      }

      // Card — usually instant
      if (data.status === "approved") {
        await db.from("appointments").update({
          payment_status: "approved",
          payment_confirmed_at: new Date().toISOString(),
        }).eq("id", appointmentId);

        // Trigger notifications
        triggerAppointmentConfirmed(appointmentId).catch(err => logError("triggerAppointmentConfirmed", err));
        const pName = `${profile.first_name} ${profile.last_name}`.trim();
        const doctorFullName = `Dr(a). ${doctor.first_name} ${doctor.last_name}`;
        if (selectedDate && selectedTime) {
          notifyNewAppointment(appointmentId, doctor.id, pName, format(selectedDate, "dd/MM/yyyy", { locale: ptBR }), selectedTime)
            .catch(err => logError("notifyNewAppointment", err));
        }
        notifyPaymentConfirmed(user.id, doctorFullName, selectedDate ? format(selectedDate, "dd/MM/yyyy", { locale: ptBR }) : "", `R$ ${totalPrice.toFixed(2)}`)
          .catch(err => logError("notifyPaymentConfirmed", err));

        toast.success("Pagamento confirmado! ✅");
        navigate("/dashboard/appointments");
      } else {
        toast.success("Pagamento criado!", { description: "Aguardando confirmação." });
      }
    } catch (err: unknown) {
      logError("BookAppointment payment error", err);
      toast.error("Erro", { description: err instanceof Error ? err.message : "Erro inesperado." });
    } finally {
      setProcessing(false);
    }
  };

  const formatCardNumber = (value: string) => {
    const cleaned = value.replace(/\D/g, "").slice(0, 16);
    return cleaned.replace(/(\d{4})/g, "$1 ").trim();
  };

  const formatExpiry = (value: string) => {
    const cleaned = value.replace(/\D/g, "").slice(0, 4);
    if (cleaned.length >= 3) return `${cleaned.slice(0, 2)}/${cleaned.slice(2)}`;
    return cleaned;
  };

  const availableTimes = selectedDate ? getAvailableTimesForDate(selectedDate) : [];

  if (loading) return (
    <DashboardLayout title="Paciente" nav={patientNav}>
      <div className="w-full max-w-lg mx-auto space-y-4 pb-24 md:pb-6">
        <div className="h-6 w-20 rounded-lg shimmer-v2" />
        <div className="flex items-center gap-3 p-4 rounded-2xl border border-border/30">
          <div className="w-14 h-14 rounded-xl shimmer-v2" />
          <div className="flex-1 space-y-2">
            <div className="h-4 w-40 rounded shimmer-v2" />
            <div className="h-3 w-28 rounded shimmer-v2" />
          </div>
          <div className="h-6 w-16 rounded shimmer-v2" />
        </div>
        <div className="flex items-center justify-between px-2">
          {[1,2,3,4].map(i => <div key={i} className="flex flex-col items-center gap-1"><div className="w-9 h-9 rounded-full shimmer-v2" /><div className="h-2 w-8 rounded shimmer-v2" /></div>)}
        </div>
        <div className="h-64 rounded-2xl shimmer-v2" />
      </div>
    </DashboardLayout>
  );

  if (!doctor) return (
    <DashboardLayout title="Paciente" nav={patientNav}>
      <div className="text-center py-20">
        <Stethoscope className="w-12 h-12 mx-auto text-muted-foreground/30 mb-3" />
        <p className="text-muted-foreground">Médico não encontrado</p>
      </div>
    </DashboardLayout>
  );

  if (kycPending) {
    return (
      <DashboardLayout title="Paciente" nav={patientNav}>
        <div className="w-full max-w-lg mx-auto text-center py-20 space-y-4">
          <div className="w-16 h-16 mx-auto rounded-2xl bg-destructive/10 flex items-center justify-center">
            <Lock className="w-8 h-8 text-destructive" />
          </div>
          <h2 className="text-xl font-bold text-foreground">Verificação necessária</h2>
          <p className="text-sm text-muted-foreground max-w-sm mx-auto">
            Para sua segurança, você precisa concluir a verificação de identidade (KYC) antes de agendar consultas.
          </p>
          <Button onClick={() => navigate("/dashboard/profile?role=patient&kyc=open")} className="rounded-xl">
            <Shield className="w-4 h-4 mr-2" /> Completar verificação
          </Button>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout title="Paciente" nav={patientNav}>
      <div className="w-full max-w-lg mx-auto pb-24 md:pb-6">
        {/* Back */}
        <button onClick={() => {
          if (paymentStep) { setPaymentStep(false); return; }
          navigate(-1);
        }} className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground mb-5 active:scale-95 transition-transform">
          <ArrowLeft className="w-4 h-4" /> Voltar
        </button>

        {/* Doctor card */}
        <div className="flex items-center gap-3 p-4 rounded-2xl bg-card border border-border/50 mb-5 hover:shadow-lg transition-shadow">
          <Avatar className="w-14 h-14 rounded-xl shrink-0">
            <AvatarFallback className="rounded-xl bg-gradient-to-br from-primary to-secondary text-white font-bold text-lg">
              {doctor.first_name[0]}{doctor.last_name[0]}
            </AvatarFallback>
          </Avatar>
          <div className="flex-1 min-w-0">
            <h2 className="font-bold text-foreground text-[15px] truncate">Dr(a). {doctor.first_name} {doctor.last_name}</h2>
            <div className="flex items-center gap-2 text-xs text-muted-foreground mt-0.5">
              <span>CRM {doctor.crm}/{doctor.crm_state}</span>
              {doctor.rating > 0 && (
                <span className="flex items-center gap-0.5">
                  <Star className="w-3 h-3 text-warning fill-warning" /> {doctor.rating.toFixed(1)}
                </span>
              )}
            </div>
            {doctor.specialties.length > 0 && (
              <div className="flex gap-1 mt-1.5">
                {doctor.specialties.slice(0, 2).map(s => (
                  <span key={s} className="text-[10px] px-2 py-0.5 rounded-full bg-primary/10 text-primary font-semibold">{s}</span>
                ))}
              </div>
            )}
          </div>
          <div className="text-right shrink-0">
            <p className="text-xl font-black text-foreground">R${totalPrice.toFixed(0)}</p>
            {cardDiscount > 0 && (
              <p className="text-[10px] text-secondary line-through">R${basePrice.toFixed(0)}</p>
            )}
            <p className="text-[10px] text-muted-foreground">por consulta</p>
          </div>
        </div>

        {/* Step indicator */}
        <div className="flex items-center justify-between px-2 mb-6">
          {STEPS.map((step, i) => {
            const Icon = step.icon;
            const isActive = i === currentStep;
            const isDone = i < currentStep;
            return (
              <div key={step.key} className="flex items-center flex-1">
                <div className="flex flex-col items-center flex-1">
                  <motion.div
                    className={cn(
                      "w-9 h-9 rounded-full flex items-center justify-center transition-colors",
                      isDone ? "bg-primary text-primary-foreground" :
                      isActive ? "bg-primary/15 text-primary ring-2 ring-primary/30" :
                      "bg-muted text-muted-foreground"
                    )}
                    animate={isActive ? { scale: [1, 1.1, 1] } : {}}
                    transition={{ duration: 0.4 }}
                  >
                    {isDone ? (
                      <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ type: "spring", stiffness: 300 }}>
                        <Check className="w-4 h-4" />
                      </motion.div>
                    ) : <Icon className="w-4 h-4" />}
                  </motion.div>
                  <span className={cn(
                    "text-[10px] mt-1 font-medium",
                    isActive ? "text-primary" : isDone ? "text-foreground" : "text-muted-foreground"
                  )}>
                    {step.label}
                  </span>
                </div>
                {i < STEPS.length - 1 && (
                  <div className="w-full h-0.5 -mt-4 bg-muted overflow-hidden rounded-full">
                    <motion.div
                      className="h-full bg-primary rounded-full"
                      initial={{ width: "0%" }}
                      animate={{ width: i < currentStep ? "100%" : "0%" }}
                      transition={{ duration: 0.5, ease: "easeInOut" }}
                    />
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Content */}
        <AnimatePresence mode="wait">
          {/* Step 1: Date */}
          {currentStep === 0 && (
            <motion.div key="date" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }}
              className="bg-card rounded-2xl border border-border p-4">
              <h3 className="font-semibold text-foreground mb-3 flex items-center gap-2">
                <CalendarDays className="w-4 h-4 text-primary" /> Escolha a data
              </h3>
              <Calendar
                mode="single" selected={selectedDate}
                onSelect={(d) => { setSelectedDate(d); setSelectedTime(null); }}
                disabled={(date) => !isDayAvailable(date)}
                fromDate={new Date()} toDate={addDays(new Date(), 60)}
                locale={ptBR} className="pointer-events-auto mx-auto"
              />
            </motion.div>
          )}

          {/* Step 2: Time */}
          {currentStep === 1 && selectedDate && (
            <motion.div key="time" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }}
              className="space-y-4">
              <button onClick={() => { setSelectedDate(undefined); setSelectedTime(null); }}
                className="flex items-center gap-2 px-4 py-2 rounded-full bg-primary/10 text-primary text-sm font-medium active:scale-95 transition-transform">
                <CalendarDays className="w-4 h-4" />
                {format(selectedDate, "EEEE, dd 'de' MMMM", { locale: ptBR })}
                <span className="text-primary/50 ml-1">✕</span>
              </button>

              <div className="bg-card rounded-2xl border border-border p-4">
                <h3 className="font-semibold text-foreground mb-3 flex items-center gap-2">
                  <Clock className="w-4 h-4 text-primary" /> Horários disponíveis
                </h3>
                {availableTimes.length === 0 ? (
                  <div className="text-center py-10">
                    <Clock className="w-10 h-10 mx-auto text-muted-foreground/30 mb-3" />
                    <p className="text-sm text-muted-foreground">Sem horários nesta data</p>
                    <Button variant="outline" size="sm" className="mt-3 rounded-xl"
                      onClick={async () => {
                        const { error } = await db.from("appointment_waitlist").insert({
                          patient_id: user!.id, doctor_id: doctor.id,
                          desired_date: format(selectedDate, "yyyy-MM-dd"),
                        });
                        if (!error) toast.success("✅ Avisaremos você!", { description: "Se uma vaga abrir, você será notificado." });
                      }}>
                      🔔 Me avise se vagar
                    </Button>
                  </div>
                ) : (
                  <div className="grid grid-cols-3 gap-2">
                    {availableTimes.map(time => (
                      <Button key={time} variant={selectedTime === time ? "default" : "outline"}
                        onClick={() => setSelectedTime(time)}
                        className={cn("h-12 text-sm rounded-xl font-medium active:scale-95 transition-all",
                          selectedTime === time && "bg-gradient-to-r from-primary to-secondary text-primary-foreground shadow-md scale-[1.02]"
                        )}>
                        {time}
                      </Button>
                    ))}
                  </div>
                )}
              </div>
            </motion.div>
          )}

          {/* Step 3: Confirm */}
          {currentStep === 2 && selectedDate && selectedTime && (
            <motion.div key="confirm" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }}
              className="space-y-4">
              <div className="flex gap-2 flex-wrap">
                <button onClick={() => { setSelectedDate(undefined); setSelectedTime(null); }}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-primary/10 text-primary text-sm font-medium active:scale-95 transition-transform">
                  <CalendarDays className="w-3.5 h-3.5" />
                  {format(selectedDate, "dd/MM", { locale: ptBR })}
                  <span className="opacity-50">✕</span>
                </button>
                <button onClick={() => setSelectedTime(null)}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-primary/10 text-primary text-sm font-medium active:scale-95 transition-transform">
                  <Clock className="w-3.5 h-3.5" /> {selectedTime}h <span className="opacity-50">✕</span>
                </button>
              </div>

              <div className="bg-card rounded-2xl border-2 border-primary/20 p-5">
                <h3 className="font-semibold text-foreground mb-4 flex items-center gap-2">
                  <CheckCircle2 className="w-5 h-5 text-primary" /> Confirmar Agendamento
                </h3>

                {dependents.length > 0 && (
                  <div className="mb-4">
                    <p className="text-xs text-muted-foreground mb-1.5">Para quem é a consulta?</p>
                    <Select value={bookingFor} onValueChange={setBookingFor}>
                      <SelectTrigger className="h-11 rounded-xl"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="self"><span className="flex items-center gap-2"><UserPlus className="w-3.5 h-3.5" /> Para mim</span></SelectItem>
                        {dependents.map(dep => (
                          <SelectItem key={dep.id} value={dep.id}>
                            <span className="flex items-center gap-2"><UserCheck className="w-3.5 h-3.5" /> {dep.name} ({dep.relationship})</span>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}

                <div className="mb-4">
                  <p className="text-xs text-muted-foreground mb-1.5">Tipo de consulta</p>
                  <Select value={appointmentType} onValueChange={setAppointmentType}>
                    <SelectTrigger className="h-11 rounded-xl"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="first_visit"><span className="flex items-center gap-2"><UserPlus className="w-3.5 h-3.5" /> 1ª Consulta</span></SelectItem>
                      <SelectItem value="return"><span className="flex items-center gap-2"><UserCheck className="w-3.5 h-3.5" /> Retorno</span></SelectItem>
                      <SelectItem value="urgency"><span className="flex items-center gap-2"><AlertTriangle className="w-3.5 h-3.5" /> Urgência</span></SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="bg-muted/50 rounded-xl p-4 space-y-2.5 mb-5">
                  <div className="flex items-center gap-2 text-sm text-foreground">
                    <Check className="w-4 h-4 text-primary shrink-0" /> Dr(a). {doctor.first_name} {doctor.last_name}
                  </div>
                  <div className="flex items-center gap-2 text-sm text-foreground">
                    <Check className="w-4 h-4 text-primary shrink-0" /> {format(selectedDate, "dd 'de' MMMM 'de' yyyy", { locale: ptBR })}
                  </div>
                  <div className="flex items-center gap-2 text-sm text-foreground">
                    <Check className="w-4 h-4 text-primary shrink-0" /> {selectedTime}h
                  </div>
                  <div className="pt-2 border-t border-border/60 space-y-1 text-[12px]">
                    <div className="flex items-center justify-between text-muted-foreground">
                      <span>Subtotal</span>
                      <span className="tabular-nums">R$ {basePrice.toFixed(2)}</span>
                    </div>
                    {cardDiscount > 0 && (
                      <div className="flex items-center justify-between text-emerald-600 dark:text-emerald-400">
                        <span>Cartão Pingo (-{cardDiscount}%)</span>
                        <span className="tabular-nums">- R$ {discountAmount.toFixed(2)}</span>
                      </div>
                    )}
                    {couponCode && couponDiscount > 0 && (
                      <div className="flex items-center justify-between text-emerald-600 dark:text-emerald-400">
                        <span className="inline-flex items-center gap-1">
                          <Tag className="w-3 h-3" /> Cupom {couponCode} (-{couponDiscount}%)
                        </span>
                        <span className="tabular-nums">- R$ {couponAmount.toFixed(2)}</span>
                      </div>
                    )}
                    <div className="flex items-center justify-between pt-1 mt-1 border-t border-border/40 text-sm font-bold text-foreground">
                      <span>Total</span>
                      <span className="tabular-nums">R$ {totalPrice.toFixed(2)}</span>
                    </div>
                  </div>
                </div>

                {/* Coupon */}
                <div className="mb-4">
                  <p className="text-xs text-muted-foreground mb-1.5 inline-flex items-center gap-1.5">
                    <Tag className="w-3.5 h-3.5" /> Cupom de desconto
                  </p>
                  {couponCode ? (
                    <div className="flex items-center justify-between gap-2 h-11 px-3 rounded-xl bg-emerald-500/10 border border-emerald-500/30">
                      <div className="flex items-center gap-2 min-w-0">
                        <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
                        <span className="text-sm font-bold text-emerald-700 dark:text-emerald-400 truncate">
                          {couponCode}
                        </span>
                        <Badge variant="secondary" className="bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 text-[10px] border-0">
                          -{couponDiscount}%
                        </Badge>
                      </div>
                      <button
                        type="button"
                        onClick={removeCoupon}
                        aria-label="Remover cupom"
                        className="text-muted-foreground hover:text-destructive transition-colors p-1 rounded-md"
                      >
                        <XIcon className="w-4 h-4" />
                      </button>
                    </div>
                  ) : (
                    <div className="flex gap-2">
                      <Input
                        value={couponInput}
                        onChange={(e) => setCouponInput(e.target.value.toUpperCase())}
                        placeholder="Digite o código"
                        className="h-11 rounded-xl font-mono uppercase tracking-wider"
                        maxLength={20}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            e.preventDefault();
                            applyCoupon();
                          }
                        }}
                      />
                      <Button
                        type="button"
                        variant="outline"
                        onClick={applyCoupon}
                        disabled={couponLoading || !couponInput.trim()}
                        className="h-11 rounded-xl px-4 font-semibold shrink-0"
                      >
                        {couponLoading ? "..." : "Aplicar"}
                      </Button>
                    </div>
                  )}
                </div>

                {/* Recurrence */}
                <div className="mb-4">
                  <p className="text-xs text-muted-foreground mb-1.5">Agendamento recorrente</p>
                  <Select value={recurrence} onValueChange={setRecurrence}>
                    <SelectTrigger className="h-11 rounded-xl"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {RECURRENCE_OPTIONS.map(o => (
                        <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {recurrence !== "none" && (
                    <div className="mt-2">
                      <p className="text-xs text-muted-foreground mb-1">Quantas consultas?</p>
                      <Select value={String(recurrenceCount)} onValueChange={v => setRecurrenceCount(Number(v))}>
                        <SelectTrigger className="h-9 rounded-xl w-24"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {[2, 3, 4, 6, 8, 12].map(n => (
                            <SelectItem key={n} value={String(n)}>{n} consultas</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  )}
                </div>

                {appointmentType === "return" && (
                  <div className={`flex items-start gap-2 p-3 rounded-xl mb-4 ${returnEligible ? "bg-success/10 border border-success/20" : "bg-warning/10 border border-warning/20"}`}>
                    {returnEligible ? (
                      <>
                        <CheckCircle2 className="w-4 h-4 text-success mt-0.5 shrink-0" />
                        <p className="text-[11px] text-foreground/80">
                          <strong>Retorno com 50% de desconto!</strong> Você tem uma consulta anterior com esse médico dentro do prazo de 60 dias. Valor: R$ {basePrice.toFixed(2)} (50% de R$ {fullPrice.toFixed(2)}).
                        </p>
                      </>
                    ) : (
                      <>
                        <AlertTriangle className="w-4 h-4 text-warning mt-0.5 shrink-0" />
                        <p className="text-[11px] text-foreground/80">
                          Retornos têm 50% de desconto dentro de 60 dias da consulta original. Nenhuma consulta elegível encontrada — será cobrado o valor integral.
                        </p>
                      </>
                    )}
                  </div>
                )}

                <Button
                  className="w-full h-14 rounded-xl bg-gradient-to-r from-primary via-primary to-secondary text-primary-foreground text-base font-bold shadow-xl shadow-primary/20 hover:shadow-2xl transition-shadow active:scale-[0.98]"
                  onClick={handleBook} disabled={booking}>
                  {booking ? (
                    <span className="flex items-center gap-2">
                      <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      Reservando...
                    </span>
                  ) : (
                    <span className="flex items-center gap-2">
                      Ir para Pagamento <ChevronRight className="w-5 h-5" />
                    </span>
                  )}
                </Button>

                <p className="text-[10px] text-center text-muted-foreground mt-3">
                  Ao confirmar, você concorda com os termos de uso e política de cancelamento.
                </p>
              </div>
            </motion.div>
          )}

          {/* Step 4: Premium Payment Checkout */}
          {currentStep === 3 && paymentStep && (
            <motion.div key="payment" initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="space-y-6">
              <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-primary via-primary/90 to-secondary p-8 text-primary-foreground shadow-2xl">
                <div className="absolute top-0 right-0 p-4 opacity-10 rotate-12">
                  <Shield className="w-32 h-32" />
                </div>
                <div className="relative z-10 flex flex-col items-center text-center">
                  <Badge className="mb-4 bg-white/20 hover:bg-white/30 text-white border-0 backdrop-blur-md px-4 py-1">
                    <Lock className="w-3 h-3 mr-2" /> Checkout Seguro
                  </Badge>
                  <h3 className="text-3xl font-black tracking-tight mb-2">Finalizar Agendamento</h3>
                  <div className="flex items-baseline gap-1">
                    <span className="text-lg opacity-80 font-medium">R$</span>
                    <span className="text-5xl font-black">{totalPrice.toFixed(2)}</span>
                  </div>
                  <div className="mt-6 flex items-center gap-2 text-sm opacity-90 font-medium bg-black/10 px-4 py-2 rounded-2xl">
                    <CalendarDays className="w-4 h-4" />
                    {selectedDate && format(selectedDate, "dd 'de' MMMM", { locale: ptBR })} às {selectedTime}
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3 p-1 bg-muted/30 rounded-2xl border border-border/40">
                {(["pix", "card", "boleto"] as const).map((method) => {
                  const Icon = method === "pix" ? QrCode : method === "card" ? CreditCard : FileBarChart;
                  const active = paymentMethod === method;
                  return (
                    <button
                      key={method}
                      onClick={() => setPaymentMethod(method)}
                      className={cn(
                        "flex flex-col items-center justify-center gap-2 py-4 rounded-xl transition-all duration-300 relative overflow-hidden group",
                        active ? "bg-white dark:bg-card shadow-xl scale-[1.02] border-primary/10 border" : "text-muted-foreground hover:bg-white/50 dark:hover:bg-card/30"
                      )}
                    >
                      {active && (
                        <motion.div layoutId="active-tab" className="absolute bottom-0 left-0 right-0 h-1 bg-gradient-to-r from-primary to-secondary" />
                      )}
                      <Icon className={cn("w-6 h-6 transition-transform duration-500", active ? "text-primary scale-110" : "group-hover:scale-110")} />
                      <span className={cn("text-xs font-bold uppercase tracking-wider", active ? "text-primary" : "text-muted-foreground")}>
                        {method === "pix" ? "PIX" : method === "card" ? "Cartão" : "Boleto"}
                      </span>
                      {method === "pix" && !active && (
                        <span className="absolute top-1 right-1 w-2 h-2 bg-secondary rounded-full animate-ping" />
                      )}
                    </button>
                  );
                })}
              </div>

              <AnimatePresence mode="wait">
                <motion.div
                  key={paymentMethod}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -20 }}
                  transition={{ type: "spring", stiffness: 300, damping: 30 }}
                >
                  {paymentMethod === "pix" && (
                    <Card className="border-border/40 shadow-2xl rounded-3xl overflow-hidden bg-card/50 backdrop-blur-xl">
                      <CardContent className="p-8 text-center">
                        {pixExpired ? (
                          <div className="py-8">
                            <div className="w-20 h-20 mx-auto rounded-3xl bg-destructive/10 flex items-center justify-center mb-6">
                              <XIcon className="w-10 h-10 text-destructive" />
                            </div>
                            <h4 className="text-xl font-bold mb-2">QR Code Expirado</h4>
                            <p className="text-muted-foreground mb-8">O código PIX tem validade de 30 minutos.</p>
                            <Button
                              className="w-full h-14 rounded-2xl bg-primary hover:bg-primary/90 text-primary-foreground font-bold shadow-lg shadow-primary/20"
                              onClick={() => { setPixQrCode(null); handlePayment(); }}
                              disabled={processing}
                            >
                              {processing ? <Loader2 className="animate-spin mr-2" /> : <Clock className="w-5 h-5 mr-2" />}
                              Gerar Novo PIX
                            </Button>
                          </div>
                        ) : pixQrCode ? (
                          <div className="space-y-6">
                            <div className="relative group mx-auto w-64 h-64">
                              <div className="absolute inset-0 bg-primary/10 rounded-[2rem] blur-2xl group-hover:bg-primary/20 transition-colors" />
                              <div className="relative bg-white p-4 rounded-[2rem] shadow-xl border border-white/20">
                                <img
                                  src={`data:image/png;base64,${pixQrCode}`}
                                  alt="QR Code PIX"
                                  className="w-full h-full rounded-2xl"
                                />
                              </div>
                            </div>

                            <div className={cn(
                              "inline-flex items-center gap-2 px-4 py-2 rounded-2xl text-sm font-bold shadow-inner transition-colors",
                              pixSecondsLeft < 120 ? "bg-destructive/10 text-destructive animate-pulse" : "bg-secondary/10 text-secondary"
                            )}>
                              <Clock className="w-4 h-4" />
                              Expira em {Math.floor(pixSecondsLeft / 60)}:{(pixSecondsLeft % 60).toString().padStart(2, '0')}
                            </div>

                            <div className="space-y-3">
                              <p className="text-sm font-medium text-muted-foreground">Pague agora para confirmar na hora</p>
                              <Button
                                variant="secondary"
                                className="w-full h-14 rounded-2xl font-bold text-base shadow-lg shadow-secondary/10 hover:shadow-secondary/20 transition-all active:scale-[0.98]"
                                onClick={() => {
                                  navigator.clipboard.writeText(pixCopyPaste || "");
                                  setPixCopied(true);
                                  toast.success("Código copiado!");
                                  setTimeout(() => setPixCopied(false), 3000);
                                }}
                              >
                                {pixCopied ? <CheckCircle2 className="w-5 h-5 mr-2" /> : <Copy className="w-5 h-5 mr-2" />}
                                {pixCopied ? "Copiado!" : "Copiar Código Copia e Cola"}
                              </Button>
                            </div>
                          </div>
                        ) : (
                          <div className="py-8">
                            <div className="w-20 h-20 mx-auto rounded-3xl bg-primary/10 flex items-center justify-center mb-6">
                              <QrCode className="w-10 h-10 text-primary" />
                            </div>
                            <h4 className="text-xl font-bold mb-2">Pagar com PIX</h4>
                            <p className="text-muted-foreground mb-8">Confirmação instantânea e segura.</p>
                            <Button
                              className="w-full h-14 rounded-2xl bg-primary hover:bg-primary/90 text-primary-foreground font-bold shadow-lg shadow-primary/20"
                              onClick={handlePayment}
                              disabled={processing}
                            >
                              {processing ? <Loader2 className="animate-spin mr-2" /> : <QrCode className="w-5 h-5 mr-2" />}
                              Gerar QR Code PIX
                            </Button>
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  )}

                  {paymentMethod === "card" && (
                    <Card className="border-border/40 shadow-2xl rounded-3xl overflow-hidden bg-card/50 backdrop-blur-xl">
                      <CardContent className="p-8 space-y-6">
                        <div className="relative h-44 w-full rounded-2xl bg-gradient-to-br from-slate-800 to-slate-900 p-6 text-white shadow-xl overflow-hidden">
                          <div className="absolute -top-10 -right-10 w-40 h-40 bg-white/5 rounded-full blur-3xl" />
                          <div className="relative z-10 flex flex-col justify-between h-full">
                            <div className="flex justify-between items-start">
                              <div className="w-12 h-8 bg-gradient-to-br from-amber-400 to-amber-200 rounded-md opacity-80" />
                              <CreditCard className="w-8 h-8 opacity-40" />
                            </div>
                            <div className="space-y-4">
                              <div className="text-xl font-mono tracking-[0.2em]">
                                {cardNumber || "•••• •••• •••• ••••"}
                              </div>
                              <div className="flex justify-between text-xs font-mono uppercase tracking-widest opacity-70">
                                <div>{cardName || "NOME DO TITULAR"}</div>
                                <div>{cardExpiry || "MM/AA"}</div>
                              </div>
                            </div>
                          </div>
                        </div>

                        <div className="space-y-4">
                          <div className="space-y-2">
                            <Label className="text-xs font-bold uppercase tracking-wider text-muted-foreground ml-1">Titular</Label>
                            <Input
                              value={cardName}
                              onChange={e => setCardName(e.target.value)}
                              placeholder="Nome impresso no cartão"
                              className="h-14 rounded-2xl border-border/40 bg-background/50 focus:ring-2 focus:ring-primary/20 transition-all"
                            />
                          </div>
                          <div className="space-y-2">
                            <Label className="text-xs font-bold uppercase tracking-wider text-muted-foreground ml-1">Número do Cartão</Label>
                            <div className="relative">
                              <Input
                                value={cardNumber}
                                onChange={e => setCardNumber(formatCardNumber(e.target.value))}
                                placeholder="0000 0000 0000 0000"
                                className="h-14 rounded-2xl border-border/40 bg-background/50 font-mono text-lg tracking-wider pr-12"
                                maxLength={19}
                              />
                              <CreditCard className="absolute right-4 top-1/2 -translate-y-1/2 w-6 h-6 text-muted-foreground/40" />
                            </div>
                          </div>
                          <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2">
                              <Label className="text-xs font-bold uppercase tracking-wider text-muted-foreground ml-1">Validade</Label>
                              <Input
                                value={cardExpiry}
                                onChange={e => setCardExpiry(formatExpiry(e.target.value))}
                                placeholder="MM/AA"
                                className="h-14 rounded-2xl border-border/40 bg-background/50 font-mono text-center"
                                maxLength={5}
                              />
                            </div>
                            <div className="space-y-2">
                              <Label className="text-xs font-bold uppercase tracking-wider text-muted-foreground ml-1">CVC</Label>
                              <div className="relative">
                                <Input
                                  value={cardCvv}
                                  onChange={e => setCardCvv(e.target.value.replace(/\D/g, "").slice(0, 4))}
                                  placeholder="•••"
                                  className="h-14 rounded-2xl border-border/40 bg-background/50 font-mono text-center"
                                  maxLength={4}
                                  type="password"
                                />
                                <Lock className="absolute right-4 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground/40" />
                              </div>
                            </div>
                          </div>
                        </div>

                        <Button
                          className="w-full h-16 rounded-2xl bg-primary hover:bg-primary/90 text-primary-foreground font-black text-lg shadow-xl shadow-primary/20 transition-all active:scale-[0.98] mt-4"
                          onClick={handlePayment}
                          disabled={processing}
                        >
                          {processing ? <Loader2 className="animate-spin mr-2" /> : <Shield className="w-6 h-6 mr-2" />}
                          PAGAR AGORA
                        </Button>
                      </CardContent>
                    </Card>
                  )}

                  {paymentMethod === "boleto" && (
                    <Card className="border-border/40 shadow-2xl rounded-3xl overflow-hidden bg-card/50 backdrop-blur-xl">
                      <CardContent className="p-8 text-center">
                        {boletoUrl ? (
                          <div className="py-8">
                            <div className="w-20 h-20 mx-auto rounded-3xl bg-secondary/10 flex items-center justify-center mb-6">
                              <CheckCircle2 className="w-10 h-10 text-secondary" />
                            </div>
                            <h4 className="text-xl font-bold mb-2">Boleto Gerado com Sucesso!</h4>
                            <p className="text-muted-foreground mb-8 text-sm">Após o pagamento, a compensação pode levar até 2 dias úteis.</p>
                            <a href={boletoUrl} target="_blank" rel="noopener noreferrer" className="block">
                              <Button className="w-full h-14 rounded-2xl bg-secondary hover:bg-secondary/90 text-white font-bold shadow-lg shadow-secondary/20">
                                <FileBarChart className="w-5 h-5 mr-2" /> Visualizar Boleto
                              </Button>
                            </a>
                          </div>
                        ) : (
                          <div className="py-8">
                            <div className="w-20 h-20 mx-auto rounded-3xl bg-muted flex items-center justify-center mb-6">
                              <FileBarChart className="w-10 h-10 text-muted-foreground" />
                            </div>
                            <h4 className="text-xl font-bold mb-2">Boleto Bancário</h4>
                            <p className="text-muted-foreground mb-8 text-sm">Pague em qualquer banco ou casa lotérica.</p>
                            <Button
                              className="w-full h-14 rounded-2xl bg-primary hover:bg-primary/90 text-primary-foreground font-bold"
                              onClick={handlePayment}
                              disabled={processing}
                            >
                              {processing ? <Loader2 className="animate-spin mr-2" /> : <FileBarChart className="w-5 h-5 mr-2" />}
                              Gerar Boleto
                            </Button>
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  )}
                </motion.div>
              </AnimatePresence>

              {/* Security badges */}
              <div className="flex items-center justify-center gap-4 mt-4 text-muted-foreground">
                <div className="flex items-center gap-1 text-xs"><Lock className="w-3 h-3" /> SSL 256-bit</div>
                <div className="flex items-center gap-1 text-xs"><Shield className="w-3 h-3" /> PCI DSS</div>
                <div className="flex items-center gap-1 text-xs"><Check className="w-3 h-3" /> LGPD</div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </DashboardLayout>
  );
};

export default BookAppointment;

