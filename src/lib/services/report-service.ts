import { db } from "@/integrations/supabase/untyped";
import { logError } from "@/lib/logger";
import { notifyDocumentUploaded } from "@/lib/notifications";

// ─── Service ──────────────────────────────────────────────────────────────────

/**
 * Upload a document and notify the patient.
 */
export const uploadDocumentAndNotify = async (
  file: File,
  patientId: string,
  doctorName: string,
  description?: string,
): Promise<{ success: boolean; path?: string }> => {
  try {
    const filePath = `documents/${patientId}/${crypto.randomUUID()}_${file.name}`;
    const { error: uploadError } = await db.storage
      .from("prescriptions")
      .upload(filePath, file);

    if (uploadError) {
      logError("uploadDocumentAndNotify upload failed", uploadError);
      return { success: false };
    }

    // Notify patient
    notifyDocumentUploaded(patientId, doctorName, file.name, description)
      .catch(err => logError("notifyDocumentUploaded", err));

    return { success: true, path: filePath };
  } catch (err) {
    logError("uploadDocumentAndNotify failed", err);
    return { success: false };
  }
};

/**
 * Generate a shareable temporary link for a report PDF.
 * Link expires after the specified duration.
 */
export const generateShareableLink = async (
  pdfPath: string,
  expiresInSeconds = 7 * 24 * 60 * 60, // 7 days default
): Promise<string | null> => {
  try {
    const { data } = await db.storage
      .from("prescriptions")
      .createSignedUrl(pdfPath, expiresInSeconds);
    return data?.signedUrl ?? null;
  } catch (err) {
    logError("generateShareableLink failed", err);
    return null;
  }
};
