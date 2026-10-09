/**
 * Shared Platform Domain Event Interface
 */

export interface PlatformDomainEvent<T = Record<string, unknown>> {
  eventId: string;
  eventName: string;
  boundedContext: string;
  aggregateId: string;
  timestamp: Date;
  version: number;
  payload: T;
}

export class PlatformEventBus {
  private static subscribers: Array<(event: PlatformDomainEvent) => void> = [];

  public static subscribe(subscriber: (event: PlatformDomainEvent) => void): void {
    this.subscribers.push(subscriber);
  }

  public static publish(event: PlatformDomainEvent): void {
    for (const sub of this.subscribers) {
      try {
        sub(event);
      } catch (err) {
        // Log event delivery exception silently to preserve execution flow
      }
    }
  }
}
