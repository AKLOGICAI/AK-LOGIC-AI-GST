"""
scripts/audit_db_schema.py

READ-ONLY Database & Storage Schema Audit Tool.
- Zero password/credential logging.
- Masks all sensitive connection strings.
- 100% Read-Only SELECT queries.
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
    # Mask password inside postgresql://user:pass@host:port/db
    return re.sub(r"://([^:]+):([^@]+)@", r"://\1:****@", url)

async def run_audit():
    db_url = os.getenv("DATABASE_URL", "").strip()
    if not db_url:
        print("❌ ERROR: DATABASE_URL environment variable is not set.")
        print("Please set it in your terminal before running this script.")
        sys.exit(1)

    print("=" * 70)
    print("🔍 READ-ONLY DATABASE & STORAGE SCHEMA AUDIT")
    print(f"Target: {mask_connection_string(db_url)}")
    print("=" * 70)

    # Convert standard postgresql:// to asyncpg if needed
    if db_url.startswith("postgresql://"):
        async_url = db_url.replace("postgresql://", "postgresql+asyncpg://", 1)
    elif db_url.startswith("postgres://"):
        async_url = db_url.replace("postgres://", "postgresql+asyncpg://", 1)
    else:
        async_url = db_url

    try:
        engine = create_async_engine(async_url, connect_args={"command_timeout": 15})
        async with engine.connect() as conn:
            print("\n1. 📊 Public Tables Overview:")
            res = await conn.execute(text("""
                select table_name 
                from information_schema.tables 
                where table_schema = 'public' 
                order by table_name
            """))
            tables = [row[0] for row in res.fetchall()]
            for t in tables:
                print(f"   - {t}")

            print("\n2. 💬 Chat Infrastructure Audit:")
            chat_threads_exist = "chat_threads" in tables
            chat_messages_exist = "chat_messages" in tables
            print(f"   - Table 'chat_threads': {'✅ EXISTS' if chat_threads_exist else '❌ MISSING (Pending Migration 0025)'}")
            print(f"   - Table 'chat_messages': {'✅ EXISTS' if chat_messages_exist else '❌ MISSING (Pending Migration 0025)'}")

            print("\n3. 🖼️ Merchant Branding Columns Audit:")
            res = await conn.execute(text("""
                select column_name, data_type 
                from information_schema.columns 
                where table_schema = 'public' and table_name = 'merchants'
                and column_name in ('logoUrl', 'signatureUrl', 'companySealUrl', 'hasCustomLogo', 'hasSignature', 'hasCompanySeal')
                order by column_name
            """))
            cols = {row[0]: row[1] for row in res.fetchall()}
            branding_cols = ['logoUrl', 'signatureUrl', 'companySealUrl', 'hasCustomLogo', 'hasSignature', 'hasCompanySeal']
            for col in branding_cols:
                status = f"✅ Present ({cols[col]})" if col in cols else "❌ Missing"
                print(f"   - {col}: {status}")

            print("\n4. 📦 Storage Buckets Audit:")
            try:
                res = await conn.execute(text("select id, name, public from storage.buckets order by name"))
                buckets = res.mappings().all()
                if not buckets:
                    print("   - No storage buckets found.")
                for b in buckets:
                    is_pub = "PUBLIC" if b["public"] else "PRIVATE"
                    print(f"   - Bucket '{b['id']}': {is_pub}")
            except Exception as b_err:
                print(f"   - Storage bucket query notice: {b_err}")

            print("\n5. 🔒 RLS Policies Summary:")
            res = await conn.execute(text("""
                select tablename, policyname, roles, cmd 
                from pg_policies 
                where schemaname = 'public' and tablename in ('merchants', 'chat_threads', 'chat_messages')
                order by tablename, policyname
            """))
            policies = res.mappings().all()
            if not policies:
                print("   - No custom RLS policies found on merchants/chat tables.")
            for p in policies:
                print(f"   - [{p['tablename']}] Policy '{p['policyname']}' ({p['cmd']})")

        await engine.dispose()
        print("\n" + "=" * 70)
        print("✅ READ-ONLY AUDIT COMPLETE (Zero Credentials Exposed)")
        print("=" * 70)

    except Exception as e:
        print(f"\n❌ Audit failed: {e}")
        sys.exit(1)

if __name__ == "__main__":
    asyncio.run(run_audit())
