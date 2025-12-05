/**
 * Rate limiter utility for controlling the rate of operations
 */
export class RateLimiter {
  private delayMs: number;

  /**
   * Create a new rate limiter
   * @param delayMs - Delay in milliseconds between operations
   */
  constructor(delayMs: number) {
    this.delayMs = delayMs;
  }

  /**
   * Wait for the configured delay period
   * @returns Promise that resolves after the delay
   */
  async wait(): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, this.delayMs));
  }

  /**
   * Get the delay in milliseconds
   */
  getDelay(): number {
    return this.delayMs;
  }

  /**
   * Process items with rate limiting
   * @param items - Array of items to process
   * @param processor - Async function to process each item
   * @returns Array of results from processing each item
   */
  async process<T, R>(
    items: T[],
    processor: (item: T, index: number) => Promise<R>
  ): Promise<R[]> {
    const results: R[] = [];

    for (let i = 0; i < items.length; i++) {
      const result = await processor(items[i], i);
      results.push(result);

      // Wait before processing next item (except for the last one)
      if (i < items.length - 1) {
        await this.wait();
      }
    }

    return results;
  }
}
