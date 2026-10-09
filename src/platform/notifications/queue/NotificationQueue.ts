/**
 * Asynchronous Notification Delivery Queue & Dead-Letter Engine
 */

import { NotificationPayload, NotificationChannel } from '../providers/INotificationProvider';

export interface NotificationJob {
  jobId: string;
  payload: NotificationPayload;
  channels: NotificationChannel[];
  attempts: number;
  maxAttempts: number;
  enqueuedAt: string;
  status: 'QUEUED' | 'PROCESSING' | 'COMPLETED' | 'FAILED' | 'DEAD_LETTER';
  lastError?: string;
}

export class NotificationQueue {
  private static instance: NotificationQueue;
  private queue: NotificationJob[] = [];
  private deadLetterQueue: NotificationJob[] = [];

  private constructor() {}

  public static getInstance(): NotificationQueue {
    if (!NotificationQueue.instance) {
      NotificationQueue.instance = new NotificationQueue();
    }
    return NotificationQueue.instance;
  }

  public enqueue(payload: NotificationPayload, channels: NotificationChannel[]): NotificationJob {
    const job: NotificationJob = {
      jobId: `job_${Date.now()}_${Math.floor(Math.random() * 10000)}`,
      payload,
      channels,
      attempts: 0,
      maxAttempts: 3,
      enqueuedAt: new Date().toISOString(),
      status: 'QUEUED',
    };
    this.queue.push(job);
    return job;
  }

  public dequeue(): NotificationJob | undefined {
    return this.queue.shift();
  }

  public moveToDeadLetter(job: NotificationJob, errorReason: string): void {
    job.status = 'DEAD_LETTER';
    job.lastError = errorReason;
    this.deadLetterQueue.push(job);
  }

  public getPendingCount(): number {
    return this.queue.length;
  }

  public getDeadLetterCount(): number {
    return this.deadLetterQueue.length;
  }
}
