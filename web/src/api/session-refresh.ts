/** Share a refresh across simultaneous 401s; always release after success or failure. */
export function singleFlight<T>(operation: () => Promise<T>): () => Promise<T> {
  let pending: Promise<T> | undefined;
  return () => {
    if (!pending) pending = Promise.resolve().then(operation).finally(() => { pending = undefined; });
    return pending;
  };
}
