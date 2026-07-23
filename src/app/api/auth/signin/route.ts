import { NextResponse } from "next/server";
import { z } from "zod";
import { signIn } from "@/lib/auth";

const schema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export async function POST(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Enter a valid email and password" },
      { status: 400 },
    );
  }
  const user = await signIn(parsed.data.email, parsed.data.password);
  if (!user) {
    return NextResponse.json(
      { error: "Invalid email or password" },
      { status: 401 },
    );
  }
  return NextResponse.json({ ok: true });
}
