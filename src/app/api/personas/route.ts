import { NextResponse } from "next/server";
import {
  getPersonas,
  createPersona,
  getRoleColorById,
  getPersonaRaw,
  updatePersona,
  getPersonasByRole,
  softDeletePersona,
} from "@/db/data/personas";

export async function GET() {
  // Always return global team (project_id IS NULL)
  const all = await getPersonas();
  return NextResponse.json(all);
}

export async function POST(req: Request) {
  const { name, role, roleId, personality, skills, processes, goals, permissions, avatar } =
    await req.json();

  if (!name?.trim()) {
    return NextResponse.json({ error: "Name is required" }, { status: 400 });
  }
  if (!role) {
    return NextResponse.json({ error: "Role is required" }, { status: 400 });
  }

  // Look up color from the roles table if roleId is provided
  let color: string | undefined;
  if (roleId) {
    const roleColor = await getRoleColorById(roleId);
    if (roleColor) color = roleColor;
  }

  try {
    const persona = await createPersona({
      name: name.trim(),
      role,
      color,
      roleId: roleId ?? undefined,
      personality: personality?.trim(),
      skills: skills || [],
      processes: processes || [],
      goals: goals || [],
      permissions: permissions || { tools: [], folders: [] },
      avatar,
    });

    return NextResponse.json({ success: true, persona });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[POST /api/personas] createPersona failed:", msg, { roleId, role });
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

// Persona IDs that cannot be modified or deleted via API (external agents)
const PROTECTED_PERSONA_IDS = new Set(["g-augmentedmike"]);

export async function PUT(req: Request) {
  const { id, name, personality, avatar } = await req.json();

  if (!id) {
    return NextResponse.json({ error: "ID is required" }, { status: 400 });
  }

  if (PROTECTED_PERSONA_IDS.has(id)) {
    return NextResponse.json({ error: "This persona is read-only and cannot be modified" }, { status: 403 });
  }

  const existing = await getPersonaRaw(id);
  if (!existing) {
    return NextResponse.json({ error: "Persona not found" }, { status: 404 });
  }

  const updates: Record<string, unknown> = {};
  if (name !== undefined) {
    updates.name = name.trim();
    updates.slug = name.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  }
  if (personality !== undefined) updates.personality = personality?.trim() || null;
  if (avatar !== undefined) updates.avatar = avatar || null;

  const updated = await updatePersona(id, updates);

  return NextResponse.json(updated);
}

export async function DELETE(req: Request) {
  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id");

  if (!id) {
    return NextResponse.json({ error: "ID is required" }, { status: 400 });
  }

  if (PROTECTED_PERSONA_IDS.has(id)) {
    return NextResponse.json({ error: "This persona is read-only and cannot be deleted" }, { status: 403 });
  }

  const existing = await getPersonaRaw(id);
  if (!existing) {
    return NextResponse.json({ error: "Persona not found" }, { status: 404 });
  }

  // Prevent deleting the last active persona of a role
  const activeWithSameRole = await getPersonasByRole(existing.role!);

  if (activeWithSameRole.length <= 1) {
    return NextResponse.json(
      { error: `Cannot delete the last ${existing.role}` },
      { status: 400 }
    );
  }

  await softDeletePersona(id);
  return NextResponse.json({ success: true });
}
