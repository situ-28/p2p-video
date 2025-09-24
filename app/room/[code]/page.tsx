import { notFound } from "next/navigation"
import { Suspense } from "react"
import { RoomCall } from "@/components/room-call"

async function getRoom(code: string) {
  const base = "https://p2p-video-ermq.onrender.com"
  const res = await fetch(`${base}/api/rooms/${code}`, { cache: "no-store" })
  if (!res.ok) return null
  return res.json()
}

export default async function RoomPage({
  params,
}: {
  params: { code: string }
}) {
  const code = params.code.toUpperCase()
  const data = await getRoom(code)
  if (!data) return notFound()

  return (
    <main className="min-h-dvh p-4 md:p-8">
      <div className="mx-auto max-w-6xl grid gap-4">
        <header className="flex items-center justify-between">
          <h1 className="text-xl md:text-2xl font-semibold">Room {code}</h1>
          <a href="/" className="text-sm underline text-muted-foreground hover:text-foreground">
            New room
          </a>
        </header>
        <Suspense>
          <RoomCall code={code} />
        </Suspense>
      </div>
    </main>
  )
}
