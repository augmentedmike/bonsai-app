import { NextResponse } from "next/server";
import { getCurrentHuman } from "@/lib/auth";
import { setAvatarData } from "@/db/data/humans";

const MAX_BYTES = 2 * 1024 * 1024; // 2 MB

export async function POST(req: Request) {
  const human = await getCurrentHuman(req);
  if (!human) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const formData = await req.formData();
  const file = formData.get("avatar") as File | null;

  if (!file) {
    return NextResponse.json({ error: "No file provided" }, { status: 400 });
  }

  if (!file.type.startsWith("image/")) {
    return NextResponse.json({ error: "File must be an image" }, { status: 400 });
  }

  if (file.size > MAX_BYTES) {
    return NextResponse.json({ error: "Image must be under 2 MB" }, { status: 413 });
  }

  const arrayBuffer = await file.arrayBuffer();
  const base64 = Buffer.from(arrayBuffer).toString("base64");
  const dataUrl = `data:${file.type};base64,${base64}`;

  const updated = await setAvatarData(human.id, dataUrl);
  if (!updated) {
    return NextResponse.json({ error: "Failed to save avatar" }, { status: 500 });
  }

  return NextResponse.json({ avatarData: dataUrl });
}

export async function DELETE(req: Request) {
  const human = await getCurrentHuman(req);
  if (!human) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  await setAvatarData(human.id, "");
  return NextResponse.json({ ok: true });
}
