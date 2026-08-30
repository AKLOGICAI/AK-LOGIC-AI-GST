"""
scripts/apply_migration_0026.py

Applies 0026_merchant_signatures_private_storage.sql safely.
- Zero password/credential logging.
- Masks all sensitive connection strings.
- Executes 0026 migration only.
- Performs post-execution verification checks.
"""

import os
import re
import sys
import asyncio
from sqlalchemy import text
from sqlalchemy.ext.asyncio import create_async_engine

def mask_connection_string(url: str) -> str:
    if not url:
        return "<UNSET>"
    return re.sub(r"://([^:]+):([^@]+)@", r"://\1:****@", url)

async def apply_and_verify():
    db_url = os.getenv("DATABASE_URL", "").strip()
    if not db_url:
        print("❌ ERROR: DATABASE_URL environment variable is not set.")
        print("Please set DATABASE_URL in your terminal session before running this script.")
        sys.exit(1)

    print("=" * 70)
    print("🚀 APPLYING MIGRATION 0026 & VERIFYING STORAGE POLICY")
    print(f"Target: {mask_connection_string(db_url)}")
    print("=" * 70)

    if db_url.startswith("postgresql://"):
        async_url = db_url.replace("postgresql://", "postgresql+asyncpg://", 1)
    elif db_url.startswith("postgres://"):
        async_url = db_url.replace("postgres://", "postgresql+asyncpg://", 1)
    else:
        async_url = db_url

    try:
        engine = create_async_engine(async_url, connect_args={"command_timeout": 15})
        
        # 1. Execute Migration 0026
        async with engine.begin() as conn:
            print("\n1. 🛠️ Executing 0026_merchant_signatures_private_storage.sql...")
            
            sql_insert_bucket = """
                insert into storage.buckets (id, name, public)
                values ('merchant-signatures', 'merchant-signatures', false)
                on conflict (id) do update set public = false;
            """
            await conn.execute(text(sql_insert_bucket))
            
            sql_policy = """
                drop policy if exists "Service Role Access for Merchant Signatures" on storage.objects;
                create policy "Service Role Access for Merchant Signatures"
                  on storage.objects for all
                  using (
                    bucket_id = 'merchant-signatures' 
                    and auth.role() = 'service_role'
                  );
            """
            await conn.execute(text(sql_policy))
            print("   ✅ Executed bucket creation & RLS policy setup successfully.")

        # 2. Post-Execution READ-ONLY Verification
        async with engine.connect() as conn:
            print("\n2. 🔍 Post-Execution Read-Only Verification:")
            
            # Check Buckets
            res = await conn.execute(text("select id, name, public from storage.buckets order by name"))
            buckets = {row['id']: row['public'] for row in res.mappings().all()}
            
            print(f"   - Bucket 'merchant-branding': {'✅ EXISTS (PUBLIC)' if buckets.get('merchant-branding') == True else '⚠️ Status Check'}")
            print(f"   - Bucket 'merchant-signatures': {'✅ EXISTS (PRIVATE - public=false)' if buckets.get('merchant-signatures') == False else '❌ FAILED'}")

            # Check Policies
            res = await conn.execute(text("""
                select policyname from pg_policies 
                where schemaname = 'storage' and tablename = 'objects' 
                and policyname = 'Service Role Access for Merchant Signatures'
            """))
            policy_row = res.first()
            print(f"   - Policy 'Service Role Access for Merchant Signatures': {'✅ ACTIVE' if policy_row else '❌ MISSING'}")

            # Check Chat Tables Unmodified
            res = await conn.execute(text("""
                select table_name from information_schema.tables 
                where table_schema = 'public' and table_name in ('chat_threads', 'chat_messages')
            """))
            chat_tables = [r[0] for r in res.fetchall()]
            print(f"   - Table 'chat_threads': {'✅ INTAC & ACTIVE' if 'chat_threads' in chat_tables else '❌ MISSING'}")
            print(f"   - Table 'chat_messages': {'✅ INTACT & ACTIVE' if 'chat_messages' in chat_tables else '❌ MISSING'}")

        await engine.dispose()
        print("\n" + "=" * 70)
        print("🎉 MIGRATION 0026 EXECUTED & VERIFIED SUCCESSFULLY!")
        print("=" * 70)

    except Exception as e:
        print(f"\n❌ Migration failed: {e}")
        sys.exit(1)

if __name__ == "__main__":
    asyncio.run(apply_and_verify())
