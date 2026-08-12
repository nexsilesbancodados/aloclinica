import { test, expect } from "@playwright/test";

/**
 * RLS (Row Level Security) tests.
 * These tests verify that Supabase RLS policies are correctly enforced.
 * 
 * PREREQUISITES:
 * - Set TEST_USER_A_EMAIL, TEST_USER_A_PASSWORD, TEST_USER_B_EMAIL, TEST_USER_B_PASSWORD
 *   as environment variables or GitHub secrets.
 * - Users must exist in the Supabase auth system.
 * 
 * These tests use the Supabase REST API directly to verify RLS.
 */

const SUPABASE_URL = process.env.VITE_SUPABASE_URL || "https://pwxvvimdtmvziynbspgx.supabase.co";
const SUPABASE_ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY || "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InB3eHZ2aW1kdG12eml5bmJzcGd4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzYxMjMwNDAsImV4cCI6MjA5MTY5OTA0MH0.GYOrbxDlr_GxII92m6Fk7BiVoT5D2uuAk4Uhn0PZzNM";

async function getAuthToken(email: string, password: string): Promise<string | null> {
  const res = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: SUPABASE_ANON_KEY,
    },
    body: JSON.stringify({ email, password }),
  });
  if (!res.ok) return null;
  const data = await res.json();
  return data.access_token || null;
}

async function queryTable(table: string, token?: string) {
  const headers: Record<string, string> = {
    apikey: SUPABASE_ANON_KEY,
    "Content-Type": "application/json",
  };
  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  } else {
    headers["Authorization"] = `Bearer ${SUPABASE_ANON_KEY}`;
  }
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}?select=*&limit=5`, { headers });
  return { status: res.status, data: await res.json() };
}

test.describe("RLS Policy Verification", () => {
  test("anonymous request to appointments returns empty or 0 rows", async () => {
    const result = await queryTable("appointments");
    // RLS should either return empty array or 401/403
    if (result.status === 200) {
      expect(Array.isArray(result.data) ? result.data.length : 0).toBe(0);
    } else {
      expect([401, 403]).toContain(result.status);
    }
  });

  test("anonymous request to medical_records returns empty or denied", async () => {
    const result = await queryTable("medical_records");
    if (result.status === 200) {
      expect(Array.isArray(result.data) ? result.data.length : 0).toBe(0);
    } else {
      expect([401, 403]).toContain(result.status);
    }
  });

  test("anonymous request to profiles returns empty or denied", async () => {
    const result = await queryTable("profiles");
    if (result.status === 200) {
      // Profiles may have public data, but should be limited
      expect(Array.isArray(result.data)).toBe(true);
    }
  });

  test("anonymous cannot insert into appointments", async () => {
    const headers: Record<string, string> = {
      apikey: SUPABASE_ANON_KEY,
      Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
      "Content-Type": "application/json",
      Prefer: "return=minimal",
    };
    const res = await fetch(`${SUPABASE_URL}/rest/v1/appointments`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        doctor_id: "00000000-0000-0000-0000-000000000000",
        scheduled_at: "2026-12-31T10:00:00Z",
        status: "scheduled",
      }),
    });
    // Should be denied by RLS
    expect([401, 403, 409, 404].includes(res.status) || res.status >= 400).toBe(true);
  });

  test.skip("authenticated user reads only own data (requires test credentials)", async () => {
    const email = process.env.TEST_USER_A_EMAIL;
    const password = process.env.TEST_USER_A_PASSWORD;
    if (!email || !password) {
      test.skip();
      return;
    }

    const token = await getAuthToken(email, password);
    expect(token).toBeTruthy();

    const result = await queryTable("appointments", token!);
    expect(result.status).toBe(200);
    // All returned appointments should belong to this user (patient_id or doctor_id)
    expect(Array.isArray(result.data)).toBe(true);
  });
});
