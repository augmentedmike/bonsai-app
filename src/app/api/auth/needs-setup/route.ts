import { NextResponse } from "next/server";
import { countHumans } from "@/db/data/humans";

/**
 * GET /api/auth/needs-setup
 * Returns { setup: true } if no humans exist yet (first run).
 */
export async function GET() {
  const count = await countHumans();
  return NextResponse.json({ setup: count === 0 });
}
