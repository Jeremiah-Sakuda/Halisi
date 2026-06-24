/**
 * A minimal promise-chaining mutex. The memory store uses it to serialize its conditional
 * transaction, so a check-then-write is atomic even when many claims race on the same credential —
 * the in-process analogue of DynamoDB serializing conflicting transactions on an item.
 */
export class Mutex {
  private tail: Promise<void> = Promise.resolve();

  async run<T>(fn: () => Promise<T> | T): Promise<T> {
    const prior = this.tail;
    let release!: () => void;
    this.tail = new Promise<void>((resolve) => (release = resolve));
    await prior;
    try {
      return await fn();
    } finally {
      release();
    }
  }
}
