/**
 * Centralized Dependency Injection Container
 */

import { ConfigProvider } from '../configuration/ConfigProvider';
import { NotificationQueue } from '../notifications/queue/NotificationQueue';
import { NotificationTemplateEngine } from '../notifications/templates/NotificationTemplateEngine';

export class Container {
  private static instance: Container;
  private services: Map<string, unknown> = new Map();

  private constructor() {
    this.register('ConfigProvider', ConfigProvider.getInstance());
    this.register('NotificationQueue', NotificationQueue.getInstance());
    this.register('NotificationTemplateEngine', NotificationTemplateEngine);
  }

  public static getInstance(): Container {
    if (!Container.instance) {
      Container.instance = new Container();
    }
    return Container.instance;
  }

  public register<T>(key: string, service: T): void {
    this.services.set(key, service);
  }

  public resolve<T>(key: string): T {
    const service = this.services.get(key);
    if (!service) {
      throw new Error(`[Container] Service not registered: ${key}`);
    }
    return service as T;
  }
}
