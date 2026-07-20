// Test harness for debugging the state machine locally
// Run with: deno run --allow-net --allow-env supabase/functions/process-bucket/test.ts <bucket_id>
//
// Example:
//   deno run --allow-net --allow-env supabase/functions/process-bucket/test.ts 123

import { load } from "https://deno.land/std@0.208.0/dotenv/mod.ts";

// Load environment variables from .env.local
const envPath = new URL("../../../.env.local", import.meta.url).pathname;
try {
    await load({ envPath, export: true });
    console.log("✅ Loaded environment from .env.local");
} catch (e) {
    console.log("⚠️  No .env.local found, using existing environment");
}

// Verify required env vars
const requiredVars = ["SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"];
for (const v of requiredVars) {
    if (!Deno.env.get(v)) {
        console.error(`❌ Missing required env var: ${v}`);
        console.error("Create supabase/.env.local with SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY");
        Deno.exit(1);
    }
}

// Import the state machine
import { runStateMachine } from "./jgraph/engine.ts";

// Get bucket ID from command line
const bucketId = parseInt(Deno.args[0]);

if (!bucketId || isNaN(bucketId)) {
    console.error("Usage: deno run --allow-net --allow-env test.ts <bucket_id>");
    console.error("Example: deno run --allow-net --allow-env test.ts 123");
    Deno.exit(1);
}

console.log(`\n🔧 Testing state machine with bucket #${bucketId}\n`);
console.log("─".repeat(50));

try {
    const result = await runStateMachine(bucketId);
    console.log("─".repeat(50));
    console.log("\n✅ Result:", JSON.stringify(result, null, 2));
} catch (error) {
    console.error("\n❌ Error:", error);
    Deno.exit(1);
}
