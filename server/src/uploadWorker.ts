import path from 'path';
import fs from 'fs';
import os from 'os';
import { eq, asc } from 'drizzle-orm';
import { db } from './db/client';
import { uploads, uploadCandidates } from './db/schema';
import { processResume } from './pipeline';

let running = false;
let recoveredStalled = false;

/**
 * Trigger the background upload processor.
 * Safe to call multiple times — only one loop runs at a time.
 */
export async function triggerUploadProcessing(): Promise<void> {
  // On first call, reset any uploads stuck in 'processing' from a previous crash
  if (!recoveredStalled) {
    recoveredStalled = true;
    const stalled = await db.update(uploads)
      .set({ status: 'pending', updatedAt: new Date() })
      .where(eq(uploads.status, 'processing'))
      .returning({ id: uploads.id });
    if (stalled.length > 0) {
      console.log(`[worker] Recovered ${stalled.length} stalled upload(s)`);
    }
  }

  if (running) {
    console.log('[worker] Already running, will pick up new uploads automatically');
    return;
  }
  processLoop().catch(err => {
    console.error('[worker] Fatal error:', err);
    running = false;
  });
}

async function processLoop(): Promise<void> {
  running = true;
  console.log('[worker] Starting processing loop...');

  while (true) {
    // Pick the oldest pending upload
    const [record] = await db
      .select()
      .from(uploads)
      .where(eq(uploads.status, 'pending'))
      .orderBy(asc(uploads.createdAt))
      .limit(1);

    if (!record) {
      console.log('[worker] No more pending uploads, stopping loop');
      break;
    }

    const id = record.id;
    console.log(`[worker] Processing upload ${id}: ${record.originalFilename}`);

    // Mark as processing
    await db.update(uploads)
      .set({ status: 'processing', updatedAt: new Date() })
      .where(eq(uploads.id, id));

    // Write file data to temp file for pipeline
    const ext = path.extname(record.originalFilename).toLowerCase();
    const tmpPath = path.join(os.tmpdir(), `cv-upload-${id}${ext}`);

    try {
      fs.writeFileSync(tmpPath, record.fileData!);
      const result = await processResume(tmpPath, record.originalFilename);

      // Mark as completed
      await db.update(uploads)
        .set({
          status: 'completed',
          ingestionCost: result.totalCost.toFixed(6),
          ingestionTokens: result.totalTokens,
          updatedAt: new Date(),
        })
        .where(eq(uploads.id, id));

      // Link upload to candidate
      await db.insert(uploadCandidates).values({
        uploadId: id,
        candidateId: result.candidateId,
      });

      console.log(`[worker] Completed upload ${id} → candidate ${result.candidateId}`);
    } catch (err) {
      const rawMsg = err instanceof Error ? err.message : 'Processing failed';
      // Strip null bytes (PostgreSQL rejects \x00 in text) and truncate
      const errorMsg = rawMsg.replace(/\x00/g, '').slice(0, 500);
      console.error(`[worker] Failed upload ${id}:`, errorMsg);

      try {
        await db.update(uploads)
          .set({
            status: 'error',
            errorMessage: errorMsg,
            updatedAt: new Date(),
          })
          .where(eq(uploads.id, id));
      } catch (updateErr) {
        console.error(`[worker] Failed to store error for upload ${id}:`, updateErr);
        // Last resort: set error status with generic message
        await db.update(uploads)
          .set({ status: 'error', errorMessage: 'Processing failed (see server logs)', updatedAt: new Date() })
          .where(eq(uploads.id, id))
          .catch(() => {}); // swallow if this also fails
      }
    } finally {
      try { fs.unlinkSync(tmpPath); } catch {}
    }
  }

  running = false;
}
