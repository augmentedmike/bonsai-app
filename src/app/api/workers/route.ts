import { NextResponse } from "next/server";
import { getWorkerActivity } from "@/db/data";

// Returns global team with activity data across all projects.
export async function GET() {
  const workers = await getWorkerActivity();

  return NextResponse.json({ workers });
}
