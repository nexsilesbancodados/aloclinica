/**
 * useWebRTC — Hook nativo de videochamada P2P
 * 
 * Sinalização via Supabase Realtime (broadcast).
 * TURN dinâmico via Edge Function turn-credentials (Metered.live).
 * Fallback para OpenRelay + STUN do Google.
 * 
 * Compatível com PC e Mobile (iOS Safari, Android Chrome).
 */

import { useEffect, useRef, useState, useCallback } from "react";
import { db } from "@/integrations/supabase/untyped";
import { logError } from "@/lib/logger";

// ─── Fallback ICE Servers (usados se edge function falhar) ────────────────────
const FALLBACK_ICE_SERVERS: RTCIceServer[] = [
  { urls: "stun:stun.l.google.com:19302" },
  { urls: "stun:stun1.l.google.com:19302" },
  { urls: "stun:stun2.l.google.com:19302" },
  {
    urls: "turn:openrelay.metered.ca:80",
    username: "openrelayproject",
    credential: "openrelayproject",
  },
  {
    urls: "turn:openrelay.metered.ca:443",
    username: "openrelayproject",
    credential: "openrelayproject",
  },
  {
    urls: "turn:openrelay.metered.ca:443?transport=tcp",
    username: "openrelayproject",
    credential: "openrelayproject",
  },
];

// ─── Tipos ────────────────────────────────────────────────────────────────────
export type CallStatus =
  | "idle"
  | "requesting_media"
  | "waiting_peer"
  | "connecting"
  | "connected"
  | "reconnecting"
  | "ended"
  | "failed";

interface SignalPayload {
  type: "offer" | "answer" | "ice-candidate" | "hang-up" | "join" | "screen-share-start" | "screen-share-stop";
  sender: string;
  data: unknown;
}

interface UseWebRTCOptions {
  roomId: string;
  userId: string;
  isInitiator: boolean;
  displayName?: string;
}

interface UseWebRTCReturn {
  localStream: MediaStream | null;
  remoteStream: MediaStream | null;
  screenStream: MediaStream | null;
  remoteScreenStream: MediaStream | null;
  status: CallStatus;
  isMuted: boolean;
  isVideoOff: boolean;
  isScreenSharing: boolean;
  toggleMute: () => void;
  toggleVideo: () => void;
  switchCamera: () => Promise<void>;
  toggleScreenShare: () => Promise<void>;
  hangUp: () => void;
  startCall: () => Promise<void>;
}

const isMobileDevice = () =>
  typeof navigator !== "undefined" &&
  /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);

// ─── Buscar credenciais TURN dinâmicas ────────────────────────────────────────
async function fetchIceServers(): Promise<RTCIceServer[]> {
  try {
    const { data, error } = await db.functions.invoke("turn-credentials");
    if (error) throw error;
    if (data?.iceServers && Array.isArray(data.iceServers) && data.iceServers.length > 0) {
      console.info(`[WebRTC] Usando ${data.iceServers.length} ICE servers dinâmicos`);
      return data.iceServers;
    }
  } catch (err) {
    logError("fetchIceServers failed, using fallback", err);
  }
  console.info("[WebRTC] Usando ICE servers de fallback");
  return FALLBACK_ICE_SERVERS;
}

export function useWebRTC({
  roomId,
  userId,
  isInitiator,
}: UseWebRTCOptions): UseWebRTCReturn {
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);
  const [screenStream, setScreenStream] = useState<MediaStream | null>(null);
  const [remoteScreenStream, setRemoteScreenStream] = useState<MediaStream | null>(null);
  const [status, setStatus] = useState<CallStatus>("idle");
  const [isMuted, setIsMuted] = useState(false);
  const [isVideoOff, setIsVideoOff] = useState(false);
  const [isScreenSharing, setIsScreenSharing] = useState(false);

  const pcRef = useRef<RTCPeerConnection | null>(null);
  const channelRef = useRef<ReturnType<typeof db.channel> | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const screenStreamRef = useRef<MediaStream | null>(null);
  const screenSenderRef = useRef<RTCRtpSender | null>(null);
  const iceCandidateQueue = useRef<RTCIceCandidateInit[]>([]);
  const hasRemoteDesc = useRef(false);
  const cleanedUp = useRef(false);
  const offerRetryRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const lastOfferRef = useRef<RTCSessionDescriptionInit | null>(null);
  const facingModeRef = useRef<"user" | "environment">("user");
  const iceServersRef = useRef<RTCIceServer[]>(FALLBACK_ICE_SERVERS);

  // ─── Cleanup ────────────────────────────────────────────────────────────────
  const cleanup = useCallback(() => {
    if (cleanedUp.current) return;
    cleanedUp.current = true;

    if (offerRetryRef.current) {
      clearInterval(offerRetryRef.current);
      offerRetryRef.current = null;
    }

    localStreamRef.current?.getTracks().forEach((t) => t.stop());
    localStreamRef.current = null;
    setLocalStream(null);

    screenStreamRef.current?.getTracks().forEach((t) => t.stop());
    screenStreamRef.current = null;
    screenSenderRef.current = null;
    setScreenStream(null);
    setIsScreenSharing(false);

    if (pcRef.current) {
      pcRef.current.onicecandidate = null;
      pcRef.current.ontrack = null;
      pcRef.current.oniceconnectionstatechange = null;
      pcRef.current.onnegotiationneeded = null;
      pcRef.current.close();
      pcRef.current = null;
    }

    if (channelRef.current) {
      db.removeChannel(channelRef.current);
      channelRef.current = null;
    }

    setRemoteStream(null);
    setRemoteScreenStream(null);
    setStatus("ended");
  }, []);

  // ─── Enviar sinal via Supabase broadcast ────────────────────────────────────
  const sendSignal = useCallback(
    (payload: SignalPayload) => {
      channelRef.current?.send({
        type: "broadcast",
        event: "webrtc-signal",
        payload,
      });
    },
    []
  );

  // ─── Processar ICE candidates enfileirados ──────────────────────────────────
  const flushIceCandidates = useCallback(async () => {
    if (!pcRef.current || !hasRemoteDesc.current) return;
    const queue = [...iceCandidateQueue.current];
    iceCandidateQueue.current = [];
    for (const candidate of queue) {
      try {
        await pcRef.current.addIceCandidate(new RTCIceCandidate(candidate));
      } catch (err) {
        logError("addIceCandidate failed", err);
      }
    }
  }, []);

  // ─── Criar PeerConnection ──────────────────────────────────────────────────
  const createPeerConnection = useCallback(() => {
    const config: RTCConfiguration = {
      iceServers: iceServersRef.current,
      iceCandidatePoolSize: 10,
    };

    const pc = new RTCPeerConnection(config);

    pc.onicecandidate = (event) => {
      if (event.candidate) {
        sendSignal({
          type: "ice-candidate",
          sender: userId,
          data: event.candidate.toJSON(),
        });
      }
    };

    const remote = new MediaStream();
    setRemoteStream(remote);

    pc.ontrack = (event) => {
      event.streams[0]?.getTracks().forEach((track) => {
        remote.addTrack(track);
      });
      setRemoteStream(new MediaStream(remote.getTracks()));
    };

    pc.oniceconnectionstatechange = () => {
      const state = pc.iceConnectionState;
      console.info(`[WebRTC] ICE state: ${state}`);
      switch (state) {
        case "checking":
          setStatus("connecting");
          break;
        case "connected":
        case "completed":
          setStatus("connected");
          if (offerRetryRef.current) {
            clearInterval(offerRetryRef.current);
            offerRetryRef.current = null;
          }
          break;
        case "disconnected":
          setStatus("reconnecting");
          // Auto-reconnect after 3s if still disconnected
          setTimeout(() => {
            if (pcRef.current?.iceConnectionState === "disconnected") {
              console.info("[WebRTC] Still disconnected, attempting ICE restart");
              if (isInitiator && pcRef.current.signalingState !== "closed") {
                pcRef.current.restartIce();
                // Re-create and send offer for ICE restart
                pcRef.current.createOffer({ iceRestart: true }).then(offer => {
                  pcRef.current?.setLocalDescription(offer);
                  lastOfferRef.current = offer;
                  sendSignal({ type: "offer", sender: userId, data: offer });
                }).catch(err => logError("ICE restart offer failed", err));
              }
            }
          }, 3000);
          break;
        case "failed":
          setStatus("failed");
          // Aggressive reconnect: restart ICE
          if (isInitiator && pc.signalingState !== "closed") {
            console.info("[WebRTC] Connection failed, restarting ICE");
            pc.restartIce();
            pc.createOffer({ iceRestart: true }).then(offer => {
              pc.setLocalDescription(offer);
              lastOfferRef.current = offer;
              sendSignal({ type: "offer", sender: userId, data: offer });
            }).catch(err => logError("ICE restart on failed", err));
          }
          break;
        case "closed":
          setStatus("ended");
          break;
      }
    };

    pcRef.current = pc;
    return pc;
  }, [userId, isInitiator, sendSignal]);

  // ─── Receber sinais ─────────────────────────────────────────────────────────
  const handleSignal = useCallback(
    async (payload: SignalPayload) => {
      if (payload.sender === userId) return;

      const pc = pcRef.current;

      switch (payload.type) {
        case "join": {
          if (isInitiator && lastOfferRef.current && pc) {
            console.info("[WebRTC] Peer joined, re-sending offer");
            sendSignal({
              type: "offer",
              sender: userId,
              data: lastOfferRef.current,
            });
          }
          break;
        }

        case "offer": {
          if (isInitiator || !pc) return;
          try {
            // Handle glare: rollback if we're in an incompatible state
            if (pc.signalingState !== "stable") {
              console.info("[WebRTC] Rolling back to handle new offer");
              await pc.setLocalDescription({ type: "rollback" });
            }

            const offer = payload.data as RTCSessionDescriptionInit;
            await pc.setRemoteDescription(new RTCSessionDescription(offer));
            hasRemoteDesc.current = true;
            await flushIceCandidates();

            const answer = await pc.createAnswer();
            await pc.setLocalDescription(answer);

            sendSignal({
              type: "answer",
              sender: userId,
              data: answer,
            });
            setStatus("connecting");
          } catch (err) {
            logError("handleOffer failed", err);
            setStatus("failed");
          }
          break;
        }

        case "answer": {
          if (!isInitiator || !pc) return;
          try {
            // Only set remote description if we're in have-local-offer state
            if (pc.signalingState !== "have-local-offer") {
              console.info("[WebRTC] Ignoring answer — wrong state:", pc.signalingState);
              return;
            }
            const answer = payload.data as RTCSessionDescriptionInit;
            await pc.setRemoteDescription(new RTCSessionDescription(answer));
            hasRemoteDesc.current = true;
            await flushIceCandidates();
            setStatus("connecting");
          } catch (err) {
            logError("handleAnswer failed", err);
          }
          break;
        }

        case "ice-candidate": {
          if (!pc) return;
          const candidate = payload.data as RTCIceCandidateInit;
          if (hasRemoteDesc.current) {
            try {
              await pc.addIceCandidate(new RTCIceCandidate(candidate));
            } catch (err) {
              logError("addIceCandidate failed", err);
            }
          } else {
            iceCandidateQueue.current.push(candidate);
          }
          break;
        }

        case "hang-up": {
          cleanup();
          break;
        }

        case "screen-share-start": {
          // Quando o outro usuário começa a compartilhar tela
          if (remoteScreenStream) return;
          setRemoteScreenStream(new MediaStream());
          console.info("[WebRTC] Remote screen share started");
          break;
        }

        case "screen-share-stop": {
          // Quando o outro usuário para de compartilhar tela
          setRemoteScreenStream(null);
          console.info("[WebRTC] Remote screen share stopped");
          break;
        }
      }
    },
    [userId, isInitiator, sendSignal, cleanup, flushIceCandidates, remoteScreenStream]
  );

  // ─── Get media constraints ─────────────────────────────────────────────────
  const getMediaConstraints = useCallback((): MediaStreamConstraints => {
    const mobile = isMobileDevice();
    return {
      video: {
        width: { ideal: mobile ? 640 : 1280 },
        height: { ideal: mobile ? 480 : 720 },
        facingMode: facingModeRef.current,
        ...(mobile ? { frameRate: { ideal: 24, max: 30 } } : {}),
      },
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
      },
    };
  }, []);

  // ─── Iniciar chamada ────────────────────────────────────────────────────────
  const startCall = useCallback(async () => {
    cleanedUp.current = false;
    hasRemoteDesc.current = false;
    iceCandidateQueue.current = [];
    lastOfferRef.current = null;

    setStatus("requesting_media");

    // 1. Buscar credenciais TURN dinâmicas em paralelo com getUserMedia
    const [iceServers, stream] = await Promise.all([
      fetchIceServers(),
      navigator.mediaDevices.getUserMedia(getMediaConstraints()).catch((err) => {
        logError("getUserMedia failed", err);
        return null;
      }),
    ]);

    iceServersRef.current = iceServers;

    if (!stream) {
      setStatus("failed");
      return;
    }

    localStreamRef.current = stream;
    setLocalStream(stream);

    // 2. Criar PeerConnection com TURN dinâmico
    const pc = createPeerConnection();

    // Adicionar tracks locais
    stream.getTracks().forEach((track) => {
      pc.addTrack(track, stream);
    });

    // 3. Conectar canal de sinalização Supabase
    const channel = db.channel(`webrtc-${roomId}`, {
      config: { broadcast: { self: false } },
    });

    channel.on("broadcast", { event: "webrtc-signal" }, ({ payload }) => {
      handleSignal(payload as SignalPayload);
    });

    await channel.subscribe();
    channelRef.current = channel;

    // 4. Se é iniciador (médico), criar offer e re-enviar periodicamente
    if (isInitiator) {
      setStatus("waiting_peer");
      try {
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        lastOfferRef.current = offer;

        sendSignal({ type: "offer", sender: userId, data: offer });

        // Re-broadcast offer every 3s for late joiners (max 60s)
        let retryCount = 0;
        offerRetryRef.current = setInterval(() => {
          retryCount++;
          if (
            pcRef.current?.iceConnectionState === "connected" ||
            pcRef.current?.iceConnectionState === "completed" ||
            cleanedUp.current ||
            retryCount > 20
          ) {
            if (offerRetryRef.current) clearInterval(offerRetryRef.current);
            return;
          }
          if (lastOfferRef.current) {
            sendSignal({ type: "offer", sender: userId, data: lastOfferRef.current });
          }
        }, 3000);
      } catch (err) {
        logError("createOffer failed", err);
        setStatus("failed");
      }
    } else {
      setStatus("waiting_peer");
      // Notify the initiator that we joined
      sendSignal({ type: "join", sender: userId, data: null });
      // Re-send join every 2s in case initiator missed it (max 30s)
      let joinRetry = 0;
      const joinInterval = setInterval(() => {
        joinRetry++;
        if (
          hasRemoteDesc.current ||
          cleanedUp.current ||
          joinRetry > 15
        ) {
          clearInterval(joinInterval);
          return;
        }
        sendSignal({ type: "join", sender: userId, data: null });
      }, 2000);
    }
  }, [roomId, userId, isInitiator, createPeerConnection, handleSignal, sendSignal, getMediaConstraints]);

  // ─── Controles de mídia ─────────────────────────────────────────────────────
  const toggleMute = useCallback(() => {
    localStreamRef.current?.getAudioTracks().forEach((t) => {
      t.enabled = !t.enabled;
    });
    setIsMuted((prev) => !prev);
  }, []);

  const toggleVideo = useCallback(() => {
    localStreamRef.current?.getVideoTracks().forEach((t) => {
      t.enabled = !t.enabled;
    });
    setIsVideoOff((prev) => !prev);
  }, []);

  // ─── Trocar câmera (front/back) — mobile ───────────────────────────────────
  const switchCamera = useCallback(async () => {
    if (!localStreamRef.current || !pcRef.current) return;

    facingModeRef.current = facingModeRef.current === "user" ? "environment" : "user";

    try {
      localStreamRef.current.getVideoTracks().forEach((t) => t.stop());

      const newStream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: facingModeRef.current,
          width: { ideal: 640 },
          height: { ideal: 480 },
        },
      });

      const newVideoTrack = newStream.getVideoTracks()[0];
      if (!newVideoTrack) return;

      const sender = pcRef.current.getSenders().find((s) => s.track?.kind === "video");
      if (sender) {
        await sender.replaceTrack(newVideoTrack);
      }

      const oldVideoTrack = localStreamRef.current.getVideoTracks()[0];
      if (oldVideoTrack) {
        localStreamRef.current.removeTrack(oldVideoTrack);
      }
      localStreamRef.current.addTrack(newVideoTrack);
      setLocalStream(new MediaStream(localStreamRef.current.getTracks()));
    } catch (err) {
      logError("switchCamera failed", err);
    }
  }, []);

  // ─── Toggle Screen Share ────────────────────────────────────────────────────
  const toggleScreenShare = useCallback(async () => {
    try {
      if (isScreenSharing && screenStreamRef.current && screenSenderRef.current && pcRef.current) {
        // Parar compartilhamento
        screenStreamRef.current.getTracks().forEach((t) => t.stop());
        await screenSenderRef.current.replaceTrack(null);
        screenStreamRef.current = null;
        screenSenderRef.current = null;
        setScreenStream(null);
        setIsScreenSharing(false);
        sendSignal({ type: "screen-share-stop", sender: userId, data: null });
        console.info("[WebRTC] Screen sharing stopped");
      } else if (!isScreenSharing && pcRef.current) {
        // Iniciar compartilhamento
        const displayStream = await navigator.mediaDevices.getDisplayMedia({
          video: {
            cursor: "always",
            displaySurface: "monitor",
          } as any,
          audio: false,
        });

        screenStreamRef.current = displayStream;
        setScreenStream(displayStream);

        const screenTrack = displayStream.getVideoTracks()[0];
        if (!screenTrack) {
          throw new Error("No screen track obtained");
        }

        // Se já existe sender de tela, substituir; senão, adicionar novo
        let sender = screenSenderRef.current;
        if (!sender) {
          sender = pcRef.current.addTrack(screenTrack, displayStream);
          screenSenderRef.current = sender;
        } else {
          await sender.replaceTrack(screenTrack);
        }

        setIsScreenSharing(true);
        sendSignal({ type: "screen-share-start", sender: userId, data: null });
        console.info("[WebRTC] Screen sharing started");

        // Quando o usuário para o compartilhamento via botão do browser
        screenTrack.onended = () => {
          screenStreamRef.current = null;
          screenSenderRef.current = null;
          setScreenStream(null);
          setIsScreenSharing(false);
          sendSignal({ type: "screen-share-stop", sender: userId, data: null });
          console.info("[WebRTC] Screen sharing ended by user");
        };
      }
    } catch (err) {
      if ((err as Error).name !== "NotAllowedError") {
        logError("toggleScreenShare failed", err);
      }
      // NotAllowedError = user cancelled, ignore silently
    }
  }, [isScreenSharing, userId, sendSignal]);

  // ─── Desligar chamada ───────────────────────────────────────────────────────
  const hangUp = useCallback(() => {
    sendSignal({ type: "hang-up", sender: userId, data: null });
    cleanup();
  }, [sendSignal, userId, cleanup]);

  // ─── Cleanup ao desmontar / sair da página ──────────────────────────────────
  // NÃO transmite "hang-up" aqui. No celular, `pagehide` dispara ao MINIMIZAR o
  // app ou trocar de aba — não só ao fechar. Como o `hang-up` fazia o par
  // encerrar e, adiante, gravava a consulta como `completed`, minimizar o app no
  // meio do atendimento marcava a teleconsulta como concluída dos dois lados.
  //
  // Aqui fazemos apenas cleanup LOCAL. O par detecta a queda via ICE e entra em
  // `reconnecting` (com restartIce), em vez de "ended". O encerramento explícito
  // continua sendo só pelo botão (callback `hangUp`, acima).
  useEffect(() => {
    const handleLeave = () => {
      cleanup();
    };

    window.addEventListener("beforeunload", handleLeave);
    window.addEventListener("pagehide", handleLeave);

    return () => {
      window.removeEventListener("beforeunload", handleLeave);
      window.removeEventListener("pagehide", handleLeave);
      cleanup();
    };
  }, [cleanup]);

  return {
    localStream,
    remoteStream,
    screenStream,
    remoteScreenStream,
    status,
    isMuted,
    isVideoOff,
    isScreenSharing,
    toggleMute,
    toggleVideo,
    switchCamera,
    toggleScreenShare,
    hangUp,
    startCall,
  };
}
