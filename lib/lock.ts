let chain = Promise.resolve()

export function withLock<T>(fn: () => T | Promise<T>): Promise<T> {
  const run = chain.then(() => fn(), () => fn())
  chain = run.then(
    () => undefined,
    () => undefined,
  )
  return run
}
