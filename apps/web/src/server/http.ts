import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import type { DataSource } from "typeorm";
import { getDb } from "./db/data-source";
import { GuestEntity } from "./db/entities";

export class AppError extends Error {
  constructor(public status: number, message: string) { super(message); }
}
const COOKIE = "fr_guest";
const SESSION_SECONDS = 180 * 24 * 60 * 60;
export const hashToken = (token: string) => createHash("sha256").update(token).digest("hex");
export function sessionToken(request: Request) {
  const value = request.headers.get("cookie")?.split(";").map((s) => s.trim()).find((s) => s.startsWith(`${COOKIE}=`))?.slice(COOKIE.length + 1);
  return value && /^[A-Za-z0-9_-]{43}$/.test(value) ? value : null;
}
export function checkOrigin(request: Request) {
  if (["GET", "HEAD", "OPTIONS"].includes(request.method)) return;
  const origin = request.headers.get("origin");
  const expected = new URL(process.env.APP_URL || request.url).origin;
  if ((origin && origin !== expected) || request.headers.get("sec-fetch-site") === "cross-site") {
    throw new AppError(403, "This request must come from your FounderReady workspace.");
  }
  if (!request.headers.get("content-type")?.toLowerCase().startsWith("application/json")) {
    throw new AppError(415, "Send a JSON request.");
  }
}
export async function readBody<T>(request: Request, schema: z.ZodType<T>): Promise<T> {
  const maxBytes = 24_000;
  if (Number(request.headers.get("content-length")) > maxBytes) throw new AppError(413, "This request is too large.");
  const reader = request.body?.getReader();
  if (!reader) throw new AppError(400, "A JSON body is required.");
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > maxBytes) { await reader.cancel(); throw new AppError(413, "This request is too large."); }
    chunks.push(value);
  }
  let body: unknown;
  try { body = JSON.parse(Buffer.concat(chunks).toString("utf8")); }
  catch { throw new AppError(400, "The request is not valid JSON."); }
  const result = schema.safeParse(body);
  if (!result.success) throw new AppError(400, result.error.issues[0]?.message ?? "Check the submitted fields.");
  return result.data;
}
export function validId(id: string) {
  if (!z.uuid().safeParse(id).success) throw new AppError(404, "This item was not found in your workspace.");
  return id;
}
export type ApiContext = { db: DataSource; guestId: string };
export async function api(request: Request, handler: (ctx: ApiContext) => Promise<unknown>, createSession = false) {
  let newToken: string | undefined;
  let response: NextResponse;
  try {
    checkOrigin(request);
    const db = await getDb();
    const token = sessionToken(request);
    let guest = token ? await db.getRepository(GuestEntity).findOneBy({ id: hashToken(token) }) : null;
    if (guest && guest.expiresAt <= new Date()) guest = null;
    if (!guest && createSession) {
      newToken = randomBytes(32).toString("base64url");
      guest = await db.getRepository(GuestEntity).save({ id: hashToken(newToken), expiresAt: new Date(Date.now() + SESSION_SECONDS * 1000), aiWindowStart: new Date(), aiRequests: 0 });
    }
    if (!guest) throw new AppError(401, "Your guest session is unavailable. Start a new project from the home page.");
    response = NextResponse.json(await handler({ db, guestId: guest.id }));
  } catch (error) {
    if (error instanceof AppError) response = NextResponse.json({ error: error.message }, { status: error.status });
    else {
      // Never log user context, credentials, SQL parameters, or provider response bodies.
      console.error("FounderReady request failed", { type: error instanceof Error ? error.name : "UnknownError" });
      response = NextResponse.json({ error: "The workspace is temporarily unavailable. Check the database connection and migrations, then try again." }, { status: 503 });
    }
  }
  response.headers.set("Cache-Control", "private, no-store");
  if (newToken) response.cookies.set(COOKIE, newToken, {
    httpOnly: true, sameSite: "lax", path: "/", maxAge: SESSION_SECONDS,
    secure: process.env.COOKIE_SECURE ? process.env.COOKIE_SECURE === "true" : process.env.NODE_ENV === "production",
  });
  return response;
}
