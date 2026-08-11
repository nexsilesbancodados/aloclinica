/**
 * CompreFace integration for face verification and detection.
 * Proxied through Supabase Edge Function to avoid mixed-content (HTTP→HTTPS) blocks.
 */

import { SUPABASE_FUNCTIONS_URL, SUPABASE_PUBLISHABLE_KEY } from "@/lib/supabase-config";
import { db } from "@/integrations/supabase/untyped";

const PROXY_URL = `${SUPABASE_FUNCTIONS_URL}/compreface-proxy`;

const getProxyHeaders = async () => {
  const { data: { session } } = await db.auth.getSession();
  if (!session?.access_token) throw new Error("Sessão expirada. Entre novamente para continuar.");
  return {
    apikey: SUPABASE_PUBLISHABLE_KEY,
    Authorization: `Bearer ${session.access_token}`,
  };
};

export interface VerificacaoResult {
  aprovado: boolean;
  similarity: number;
}

export interface DeteccaoResult {
  faceDetected: boolean;
  facesCount: number;
}

/**
 * Verifica se o rosto da selfie corresponde ao rosto no documento.
 */
export async function verificarFace(
  selfie: File,
  fotoDoc: File
): Promise<VerificacaoResult> {
  const formData = new FormData();
  formData.append("source_image", selfie);
  formData.append("target_image", fotoDoc);
  const headers = await getProxyHeaders();

  const res = await fetch(`${PROXY_URL}?action=verify`, {
    method: "POST",
    headers,
    body: formData,
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`CompreFace verify error ${res.status}: ${text}`);
  }

  const data = await res.json();
  const results = data?.result ?? [];
  const bestMatch = results[0];
  const similarity = bestMatch?.face_matches?.[0]?.similarity ?? 0;

  return {
    aprovado: similarity >= 0.85,
    similarity: Math.round(similarity * 100) / 100,
  };
}

/**
 * Detecta se existe um rosto na imagem.
 */
export async function detectarFace(imagem: File): Promise<DeteccaoResult> {
  const formData = new FormData();
  formData.append("file", imagem);
  const headers = await getProxyHeaders();

  const res = await fetch(`${PROXY_URL}?action=detect`, {
    method: "POST",
    headers,
    body: formData,
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`CompreFace detect error ${res.status}: ${text}`);
  }

  const data = await res.json();
  const faces = data?.result ?? [];

  return {
    faceDetected: faces.length > 0,
    facesCount: faces.length,
  };
}

/**
 * Converts a data URL to a File object for upload.
 */
export function dataUrlToFile(dataUrl: string, filename: string): File {
  const arr = dataUrl.split(",");
  const mime = arr[0].match(/:(.*?);/)?.[1] ?? "image/jpeg";
  const bstr = atob(arr[1]);
  let n = bstr.length;
  const u8arr = new Uint8Array(n);
  while (n--) u8arr[n] = bstr.charCodeAt(n);
  return new File([u8arr], filename, { type: mime });
}
