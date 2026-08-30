"""Repository for Persistent Background Jobs (Phase 6: Smart Notification Engine)."""
import time
import secrets
from typing import Any, Optional, List
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession
import json

def _row_to_dict(row: Any) -> dict[str, Any]:
    return dict(row._mapping)

async def enqueue_job(
    db: AsyncSession,
    job_type: str,
    payload: dict,
    run_after_ms: Optional[int] = None
) -> str:
    """Enqueues a new background job."""
    now_ms = int(time.time() * 1000)
    if run_after_ms is None:
        run_after_ms = now_ms
        
    job_id = f"job_{secrets.token_hex(8)}"
    payload_json = json.dumps(payload)
    
    await db.execute(
        text('''
            INSERT INTO public.background_jobs 
            (id, job_type, payload, run_after, created_at, updated_at)
            VALUES (:id, :job_type, :payload, :run_after, :now, :now)
        '''),
        {
            "id": job_id,
            "job_type": job_type,
            "payload": payload_json,
            "run_after": run_after_ms,
            "now": now_ms
        }
    )
    await db.commit()
    return job_id

async def fetch_and_lock_next_job(db: AsyncSession, worker_id: str) -> Optional[dict[str, Any]]:
    """Atomically fetches and locks the next due job using SKIP LOCKED."""
    now_ms = int(time.time() * 1000)
    
    # In Postgres, FOR UPDATE SKIP LOCKED is the standard way to build a queue table
    res = await db.execute(
        text('''
            UPDATE public.background_jobs
            SET status = 'processing', locked_at = :now, locked_by = :worker_id, updated_at = :now
            WHERE id = (
                SELECT id 
                FROM public.background_jobs 
                WHERE status = 'pending' AND run_after <= :now
                ORDER BY run_after ASC
                FOR UPDATE SKIP LOCKED
                LIMIT 1
            )
            RETURNING id, job_type, payload, attempts, max_attempts
        '''),
        {
            "now": now_ms,
            "worker_id": worker_id
        }
    )
    row = res.first()
    await db.commit()
    return _row_to_dict(row) if row else None

async def mark_job_completed(db: AsyncSession, job_id: str):
    """Marks a job as successfully completed."""
    now_ms = int(time.time() * 1000)
    await db.execute(
        text("UPDATE public.background_jobs SET status = 'completed', updated_at = :now WHERE id = :id"),
        {"id": job_id, "now": now_ms}
    )
    await db.commit()

async def mark_job_failed(db: AsyncSession, job_id: str, error_log: str):
    """Marks a job as failed and handles retries if under max_attempts."""
    now_ms = int(time.time() * 1000)
    
    # We fetch it to check attempts
    res = await db.execute(
        text("SELECT attempts, max_attempts FROM public.background_jobs WHERE id = :id FOR UPDATE"),
        {"id": job_id}
    )
    row = res.first()
    if not row:
        await db.commit()
        return
        
    attempts = row.attempts + 1
    status = 'failed' if attempts >= row.max_attempts else 'pending'
    
    # If retrying, exponential backoff (e.g. 5 minutes * attempts)
    run_after = now_ms + (300000 * attempts) if status == 'pending' else now_ms
    
    await db.execute(
        text('''
            UPDATE public.background_jobs 
            SET status = :status, attempts = :attempts, error_log = :error, run_after = :run_after, updated_at = :now
            WHERE id = :id
        '''),
        {
            "id": job_id,
            "status": status,
            "attempts": attempts,
            "error": str(error_log)[:1000], # truncate to fit safely
            "run_after": run_after,
            "now": now_ms
        }
    )
    await db.commit()

async def recover_stale_jobs(db: AsyncSession, timeout_ms: int = 600000) -> int:
    """Safely returns jobs stuck in 'processing' longer than timeout back to 'pending'."""
    now_ms = int(time.time() * 1000)
    cutoff = now_ms - timeout_ms
    
    res = await db.execute(
        text('''
            UPDATE public.background_jobs
            SET status = 'pending', locked_at = NULL, locked_by = NULL, updated_at = :now
            WHERE status = 'processing' AND locked_at < :cutoff
            RETURNING id
        '''),
        {"now": now_ms, "cutoff": cutoff}
    )
    await db.commit()
    return len(res.fetchall())

async def cleanup_old_jobs(db: AsyncSession, retention_ms: int = 7 * 24 * 60 * 60 * 1000) -> int:
    """Deletes completed or permanently failed jobs older than retention period."""
    now_ms = int(time.time() * 1000)
    cutoff = now_ms - retention_ms
    
    res = await db.execute(
        text('''
            DELETE FROM public.background_jobs
            WHERE status IN ('completed', 'failed') AND updated_at < :cutoff
            RETURNING id
        '''),
        {"cutoff": cutoff}
    )
    await db.commit()
    return len(res.fetchall())
