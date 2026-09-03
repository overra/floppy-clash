/** Explicit net ids. Never recycled within a round. */
export class IdAllocator {
  private next = 1;

  alloc(): number {
    const id = this.next;
    this.next += 1;
    if (this.next > 0xffff) this.next = 1;
    return id;
  }

  reset(): void {
    this.next = 1;
  }

  peek(): number {
    return this.next;
  }

  setNext(value: number): void {
    this.next = value;
  }
}
