import Link from "next/link"
import { redirect } from "next/navigation"
import { Suspense } from "react"

export default function HomePage() {
  return (
    <main className="min-h-dvh flex items-center justify-center p-6">
      <div className="w-full max-w-md rounded-lg border p-6 bg-card">
        <h1 className="text-2xl font-semibold text-balance mb-2">P2P Video Call</h1>
        <p className="text-muted-foreground mb-6">Create a room or join with a code. No sign-in required.</p>
        <Suspense>
          <CreateOrJoin />
        </Suspense>
      </div>
    </main>
  )
}

async function createRoom() {
  "use server"
  const base = "https://p2p-video-ermq.onrender.com"
  const res = await fetch(`${base}/api/rooms`, {
    method: "POST",
    cache: "no-store",
  })
  if (!res.ok) throw new Error("failed")
  const { code } = await res.json()
  redirect(`/room/${code}`)
}

async function join(formData: FormData) {
  "use server"
  const code = (formData.get("code") as string)?.trim()
  if (code) {
    redirect(`/room/${code.toUpperCase()}`)
  }
}

function CreateOrJoin() {
  return (
    <form className="grid gap-4" action={join}>
      <div className="grid gap-2">
        <label htmlFor="code" className="text-sm">
          Room code
        </label>
        <input id="code" name="code" placeholder="ABC123" className="h-10 rounded-md border bg-background px-3" />
      </div>
      <div className="flex items-center gap-3">
        <button className="h-10 px-4 rounded-md bg-primary text-primary-foreground" formAction={createRoom}>
          Create new room
        </button>
        <button className="h-10 px-4 rounded-md border" type="submit" title="Join by code">
          Join
        </button>
      </div>
      <p className="text-xs text-muted-foreground">Tip: Share your room code with your friend to start a call.</p>
      <div className="text-xs text-muted-foreground">
        <Link href="https://webrtc.org/" className="underline" target="_blank">
          Learn about WebRTC
        </Link>
      </div>
    </form>
  )
}
