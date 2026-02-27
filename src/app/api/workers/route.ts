import { NextResponse } from "next/server";
import { getWorkerActivity, getWorkersSummary } from "@/db/data";

// Returns global team with activity data across all projects.
// ?slim=true returns only name/role/isActive/color/avatarData — no comment queries.
export async function GET(req: Request) {
  const slim = new URL(req.url).searchParams.get("slim") === "true";

  if (slim) {
    const workers = await getWorkersSummary();
    return NextResponse.json({ workers });
  }

  const workers = await getWorkerActivity();
  return NextResponse.json({ workers });
}
