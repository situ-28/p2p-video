import type { NextRequest } from "next/server"
import { getCollections } from "@/lib/mongodb"

export async function POST(req: NextRequest, { params }: { params: { code: string } }) {
  const code = params.code.toUpperCase()
  const { notifications } = await getCollections()
  const {
    type,
    from,
    to = null,
    payload,
  } = (await req.json()) as {
    type: "ready" | "offer" | "answer" | "candidate" | "bye"
    from: string
    to?: string | null
    payload?: any
  }

  if (!type || !from) {
    return new Response("Invalid", { status: 400 })
  }

  await notifications.insertOne({
    roomCode: code,
    type,
    from,
    to,
    payload,
    createdAt: new Date(),
    deliveredTo: [],
  })

  return new Response(null, { status: 204 })
}
