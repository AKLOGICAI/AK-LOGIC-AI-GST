"""Background Worker for Persistent Jobs (Phase 6: Smart Notification Engine).
Runs as an asyncio task within the FastAPI event loop, safely polling the DB.
"""
import asyncio
import logging
from sqlalchemy.ext.asyncio import AsyncSession
from .database import async_session_maker
from . import jobs_repo, merchant_network_repo

logger = logging.getLogger("jobs_worker")

async def process_job(db: AsyncSession, job: dict):
    job_type = job["job_type"]
    payload = job["payload"]
    
    if job_type == "escalate_network_search":
        await handle_escalate_network_search(db, payload)
    else:
        logger.warning(f"Unknown job type: {job_type}")

async def handle_escalate_network_search(db: AsyncSession, payload: dict):
    req_id = payload["request_id"]
    radius_km = payload["radius_km"]
    limit = payload["limit"]
    
    # Check if request is still open
    req = await merchant_network_repo.get_request_by_id(db, req_id)
    if not req or req["status"] != "open":
        logger.info(f"Job escalate_network_search: Request {req_id} no longer open. Ending escalation.")
        return
        
    # Find next batch of matches
    matches = await merchant_network_repo.find_matching_merchants(
        db,
        request_id=req_id,
        radius_km=radius_km,
        limit=limit
    )
    
    # We should avoid re-notifying merchants. In a production system, we'd check `network_notifications`.
    # For now, we just notify the newly expanded radius limit.
    # The first 10 were already notified, so we slice [10:limit] approximately, or just notify all and rely on 
    # idempotency/read state, but querying existing notifications is better.
    
    notified_merchants = await db.execute(
        merchant_network_repo.text("SELECT recipient_merchant_id FROM public.network_notifications WHERE related_request_id = :req_id"),
        {"req_id": req_id}
    )
    already_notified = {row[0] for row in notified_merchants.fetchall()}
    
    caller_id = req["requester_merchant_id"]
    # Fetch requester shop name
    caller_res = await db.execute(
        merchant_network_repo.text("SELECT \"shopName\" FROM public.merchants WHERE id = :id"),
        {"id": caller_id}
    )
    caller_row = caller_res.first()
    shop_name = caller_row[0] if caller_row else "Verified Merchant"
    
    title = f"New B2B Request Nearby ({radius_km}km)"
    body = f"{shop_name} requested {req['quantity']} {req['unit']} of {req['product_name']}."
    
    new_notifies = 0
    for match in matches:
        if match["merchant_id"] not in already_notified:
            await merchant_network_repo.notify(
                db,
                recipient_id=match["merchant_id"],
                event_type="new_nearby_request_escalated",
                title=title,
                body=body,
                request_id=req_id
            )
            new_notifies += 1
            
    # If we haven't hit the absolute maximum radius, schedule another escalation
    if radius_km < 250.0:
        import time
        now = int(time.time() * 1000)
        next_radius = radius_km * 2
        next_limit = limit + 20
        await jobs_repo.enqueue_job(
            db,
            job_type="escalate_network_search",
            payload={
                "request_id": req_id,
                "radius_km": next_radius,
                "limit": next_limit
            },
            run_after_ms=now + (30 * 60 * 1000) # Escalate again in 30 minutes
        )
        logger.info(f"Escalated {req_id} to {radius_km}km. Notified {new_notifies} new merchants. Next check in 30m.")
    else:
        logger.info(f"Escalation for {req_id} reached maximum radius (250km).")

async def worker_loop(worker_id: str):
    logger.info(f"Starting background job worker {worker_id}")
    
    import time
    last_maintenance_at = 0
    
    while True:
        try:
            async with async_session_maker() as db:
                # Perform maintenance (recovery & cleanup) every 5 minutes
                now_ms = int(time.time() * 1000)
                if now_ms - last_maintenance_at > 300000:
                    recovered = await jobs_repo.recover_stale_jobs(db, timeout_ms=600000) # 10m timeout
                    cleaned = await jobs_repo.cleanup_old_jobs(db, retention_ms=7 * 24 * 60 * 60 * 1000) # 7 days
                    if recovered > 0 or cleaned > 0:
                        logger.info(f"Worker {worker_id} maintenance: recovered {recovered} stale jobs, cleaned {cleaned} old jobs.")
                    last_maintenance_at = now_ms

                job = await jobs_repo.fetch_and_lock_next_job(db, worker_id)
                if job:
                    logger.info(f"Worker {worker_id} processing job {job['id']} ({job['job_type']})")
                    try:
                        await process_job(db, job)
                        await jobs_repo.mark_job_completed(db, job['id'])
                    except Exception as e:
                        logger.error(f"Error processing job {job['id']}: {e}")
                        await jobs_repo.mark_job_failed(db, job['id'], str(e))
                else:
                    pass
        except Exception as e:
            logger.error(f"Worker {worker_id} loop error: {e}")
            
        await asyncio.sleep(5)
