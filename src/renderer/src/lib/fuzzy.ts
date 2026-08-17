export function fuzzyMatch(query: string, target: string): number {
  const q = query.trim().toLowerCase()
  const t = target.toLowerCase()
  if (!q || !t) return 0
  let qi = 0
  let score = 0
  let streak = 0
  let prev = -2
  for (let i = 0; i < t.length && qi < q.length; i++) {
    if (t[i] === q[qi]) {
      const wordStart = i === 0 || /[\s/\\\-_.:（(]/.test(t[i - 1])
      streak = i === prev + 1 ? streak + 1 : 0
      score += 2 + streak * 2 + (wordStart ? 3 : 0)
      prev = i
      qi++
    }
  }
  return qi === q.length ? score : 0
}
