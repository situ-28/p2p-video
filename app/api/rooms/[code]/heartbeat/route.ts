import type { NextRequest } from "next/server"
import { getCollections } from "@/lib/mongodb"

export async function POST(req: NextRequest, { params }: { params: { code: string } }) {
  const code = params.code.toUpperCase()
  const { roomUsers } = await getCollections()
  const { userId } = (await req.json()) as { userId: string }
  await roomUsers.updateOne({ roomCode: code, userId }, { $set: { lastActive: new Date() } })
  return new Response(null, { status: 204 })
}
