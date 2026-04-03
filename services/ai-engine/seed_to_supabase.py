"""
Seed demo data into Supabase for MunimAI.
Generates Sunita Saree Shop data and inserts it into all tables.
"""
import sys
import os
sys.path.insert(0, os.path.dirname(__file__))

from config import get_settings
from supabase import create_client
from data.seed_merchant import generate_all_data

settings = get_settings()
client = create_client(settings.supabase_url, settings.supabase_key)

def seed():
    print("🏪 Generating demo data...")
    data = generate_all_data()

    # 1. Insert merchant
    print("\n📝 Inserting merchant...")
    merchant = data["merchant"]
    # Convert location dict to JSON string if needed
    try:
        client.table("merchants").upsert(merchant).execute()
        print(f"   ✅ Merchant: {merchant['name']}")
    except Exception as e:
        print(f"   ❌ Merchant failed: {e}")

    # 2. Insert transactions (batch of 100)
    print("\n📝 Inserting transactions...")
    txns = data["transactions"]
    batch_size = 100
    for i in range(0, len(txns), batch_size):
        batch = txns[i:i+batch_size]
        try:
            client.table("transactions").insert(batch).execute()
            print(f"   ✅ Batch {i//batch_size + 1}: {len(batch)} transactions")
        except Exception as e:
            print(f"   ❌ Batch {i//batch_size + 1} failed: {str(e)[:80]}")
    print(f"   Total: {len(txns)} transactions")

    # 3. Insert customers (batch of 50)
    print("\n📝 Inserting customers...")
    customers = data["customers"]
    for i in range(0, len(customers), 50):
        batch = customers[i:i+50]
        try:
            client.table("customers").insert(batch).execute()
        except Exception as e:
            print(f"   ❌ Customers batch failed: {str(e)[:80]}")
    print(f"   ✅ {len(customers)} customers")

    # 4. Insert udhari
    print("\n📝 Inserting udhari...")
    for u in data["udhari"]:
        # Remove 'remaining' field as it's generated
        u.pop("remaining", None)
        try:
            client.table("udhari").insert(u).execute()
        except Exception as e:
            print(f"   ❌ Udhari {u.get('debtor_name','?')}: {str(e)[:60]}")
    print(f"   ✅ {len(data['udhari'])} udhari entries")

    # 5. Insert employees
    print("\n📝 Inserting employees...")
    for emp in data["employees"]:
        try:
            client.table("employees").insert(emp).execute()
        except Exception as e:
            print(f"   ❌ Employee: {str(e)[:60]}")
    print(f"   ✅ {len(data['employees'])} employees")

    # 6. Insert GST status
    print("\n📝 Inserting GST status...")
    for gst in data["gst_status"]:
        try:
            client.table("gst_status").insert(gst).execute()
        except Exception as e:
            print(f"   ❌ GST: {str(e)[:60]}")
    print(f"   ✅ {len(data['gst_status'])} GST records")

    # 7. Insert scheme matches
    print("\n📝 Inserting scheme matches...")
    for scheme in data["scheme_matches"]:
        try:
            client.table("scheme_matches").insert(scheme).execute()
        except Exception as e:
            print(f"   ❌ Scheme: {str(e)[:60]}")
    print(f"   ✅ {len(data['scheme_matches'])} scheme matches")

    # 8. Insert forecasts (batch)
    print("\n📝 Inserting forecasts...")
    forecasts = data["forecasts"]
    for i in range(0, len(forecasts), 50):
        batch = forecasts[i:i+50]
        try:
            client.table("forecasts").insert(batch).execute()
        except Exception as e:
            print(f"   ❌ Forecast batch: {str(e)[:60]}")
    print(f"   ✅ {len(forecasts)} forecast days")

    # 9. Insert PayScore history
    print("\n📝 Inserting PayScore history...")
    for ps in data["payscore_history"]:
        try:
            client.table("payscore_history").insert(ps).execute()
        except Exception as e:
            print(f"   ❌ PayScore: {str(e)[:60]}")
    print(f"   ✅ {len(data['payscore_history'])} PayScore records")

    # 10. Insert events
    print("\n📝 Inserting events...")
    for evt in data["events"]:
        try:
            client.table("events").insert(evt).execute()
        except Exception as e:
            print(f"   ❌ Event: {str(e)[:60]}")
    print(f"   ✅ {len(data['events'])} events")

    print("\n" + "="*50)
    print("🎉 SEEDING COMPLETE!")
    print("="*50)

    # Verify counts
    for table in ["merchants", "transactions", "customers", "udhari", "employees", "gst_status", "scheme_matches", "forecasts", "payscore_history", "events"]:
        try:
            result = client.table(table).select("id", count="exact").execute()
            print(f"   {table}: {result.count} rows")
        except:
            pass


if __name__ == "__main__":
    seed()
