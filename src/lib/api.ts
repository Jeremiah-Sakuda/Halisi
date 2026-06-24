import { NextResponse } from "next/server";

/** JSON helpers so the routes stay terse and consistent. */
export function ok<T>(body: T, init?: ResponseInit): NextResponse {
  return NextResponse.json(body, init);
}

export function badRequest(message: string): NextResponse {
  return NextResponse.json({ error: message }, { status: 400 });
}

export function serverError(message: string): NextResponse {
  return NextResponse.json({ error: message }, { status: 500 });
}

/** Read a JSON body, returning null when it is absent or malformed. */
export async function readJson<T>(request: Request): Promise<T | null> {
  try {
    return (await request.json()) as T;
  } catch {
    return null;
  }
}

export function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}
