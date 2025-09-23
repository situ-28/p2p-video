export function randomCode(len = 6) {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"
  let s = ""
  for (let i = 0; i < len; i++) {
    s += alphabet[Math.floor(Math.random() * alphabet.length)]
  }
  return s
}

export function randomUserId() {
  // lightweight random id for guests
  return `u_${Math.random().toString(36).slice(2, 10)}`
}
