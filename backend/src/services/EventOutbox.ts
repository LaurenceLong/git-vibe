/**
 * EventOutbox - Transactional outbox pattern for reliable event delivery
 *
 * Ensures events are written in the same DB transaction as resource updates,
 * then dispatched asynchronously to the event bus.
 */

import type { WorkflowEvent } from 'git-vibe-shared';
import { workflowEventBus } from './workflow/WorkflowEventBus.js';
import { getDb } from '../db/client.js';
import { eq, isNull, asc } from 'drizzle-orm';
import { eventOutbox } from '../models/schema.js';
import { v4 as uuidv4 } from 'uuid';

/**
 * EventOutboxService - Manages transactional outbox
 */
export class EventOutboxService {
  private processingInterval: NodeJS.Timeout | null = null;
  private isProcessing = false;

  constructor() {
    // Start background processor
    this.startProcessor();
  }

  /**
   * Add event to outbox (should be called within a transaction)
   */
  async addEvent(event: WorkflowEvent): Promise<void> {
    const db = await getDb();

    await db.insert(eventOutbox).values({
      id: uuidv4(),
      eventId: event.eventId,
      eventType: event.type,
      eventData: JSON.stringify(event.data),
      subjectKind: event.subject.kind,
      subjectId: event.subject.id,
      resourceVersion: event.resourceVersion ?? null,
      causedBy: event.causedBy ? JSON.stringify(event.causedBy) : null,
      createdAt: new Date(),
      retryCount: 0,
    });
  }

  /**
   * Process outbox events and dispatch to event bus
   */
  async processOutbox(): Promise<void> {
    if (this.isProcessing) {
      return;
    }

    this.isProcessing = true;

    try {
      const db = await getDb();

      // Fetch unprocessed events (limit to avoid overwhelming)
      const events = await db
        .select()
        .from(eventOutbox)
        .where(isNull(eventOutbox.processedAt))
        .orderBy(asc(eventOutbox.createdAt))
        .limit(100);

      for (const outboxEvent of events) {
        try {
          // Reconstruct event
          const event: WorkflowEvent = {
            eventId: outboxEvent.eventId,
            type: outboxEvent.eventType,
            at: outboxEvent.createdAt.toISOString(),
            subject: {
              kind: outboxEvent.subjectKind as any,
              id: outboxEvent.subjectId,
            },
            resourceVersion: outboxEvent.resourceVersion ?? undefined,
            causedBy: outboxEvent.causedBy ? JSON.parse(outboxEvent.causedBy) : undefined,
            data: JSON.parse(outboxEvent.eventData),
          };

          // Dispatch to event bus
          await workflowEventBus.emit(event);

          // Mark as processed
          await db
            .update(eventOutbox)
            .set({ processedAt: new Date() })
            .where(eq(eventOutbox.id, outboxEvent.id));
        } catch (error) {
          console.error(`[EventOutbox] Error processing event ${outboxEvent.id}:`, error);

          // Increment retry count
          await db
            .update(eventOutbox)
            .set({ retryCount: outboxEvent.retryCount + 1 })
            .where(eq(eventOutbox.id, outboxEvent.id));

          // If retry count exceeds threshold, mark as failed
          if (outboxEvent.retryCount >= 10) {
            await db
              .update(eventOutbox)
              .set({ processedAt: new Date() })
              .where(eq(eventOutbox.id, outboxEvent.id));
            console.error(
              `[EventOutbox] Event ${outboxEvent.id} exceeded retry limit, marking as failed`
            );
          }
        }
      }
    } catch (error) {
      console.error('[EventOutbox] Error processing outbox:', error);
    } finally {
      this.isProcessing = false;
    }
  }

  /**
   * Start background processor
   */
  private startProcessor(): void {
    // Process every 1 second
    this.processingInterval = setInterval(() => {
      this.processOutbox().catch((error) => {
        console.error('[EventOutbox] Error in background processor:', error);
      });
    }, 1000);
  }

  /**
   * Stop background processor
   */
  stopProcessor(): void {
    if (this.processingInterval) {
      clearInterval(this.processingInterval);
      this.processingInterval = null;
    }
  }
}

export const eventOutboxService = new EventOutboxService();
