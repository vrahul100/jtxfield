# Webhook Test Suite

Automated testing framework for webhook functionality with CSV-driven test cases.

## Quick Start

```bash
# Run all webhook tests
npm run test:webhook
```

## How It Works

1. **Reads test cases** from `tests/webhook-test-cases.csv`
2. **Simulates WhatsApp webhook calls** for each test case
3. **Verifies bucket creation** and data extraction
4. **Checks transaction creation** (if applicable)
5. **Validates extracted data** against expected values
6. **Cleans up** all test data after completion

## Test CSV Format

```csv
phone_number,message_text,image_url,audio_url,expected_hours,expected_materials,description
+15555550101,Did wiring for 3 hours,,,3,wires,Simple text with hours
+15555550101,Used rebar,https://example.com/image.jpg,,,"rebar",Image with text
```

### Columns:
- **phone_number**: Member's phone (must exist in database)
- **message_text**: Text message content
- **image_url**: Optional image URL
- **audio_url**: Optional audio URL
- **expected_hours**: Expected extracted hours (leave blank if N/A)
- **expected_materials**: Expected materials (comma-separated)
- **description**: Test case description

## Features

### ✅ Automated Verification
- Bucket creation
- Data extraction (hours, materials, work type)
- Transaction creation
- Expected value matching

### 🧹 Auto-Cleanup
- Deletes all test buckets after run
- Deletes all test transactions
- Leaves database clean

### 📊 Detailed Reporting
- Shows each test result
- Final summary (passed/failed)
- Exits with error code if any tests fail

## Example Output

```
🚀 Starting Webhook Test Suite

Found 7 test cases

🧪 Testing: Simple text with hours
   Phone: +15555550101
   Text: Did electrical wiring for 3 hours
   ✅ Bucket created: #123
   Extracted hours: 3
   Extracted materials: wires
   ✅ Transaction created: #45
   Transaction hours: 3

🧹 Cleaning up test data...
   Deleted 7 transactions
   Deleted 7 buckets

============================================================
📊 TEST SUMMARY
============================================================
Total: 7
✅ Passed: 6
❌ Failed: 1
```

## Adding New Test Cases

Simply add rows to `tests/webhook-test-cases.csv`:

```csv
+15555550102,Installed drywall for 8 hours,,,8,drywall,Full day drywall work
```

## Integration with CI/CD

```bash
# In your CI pipeline
npm run test:webhook
```

Exit code `0` = all tests passed  
Exit code `1` = one or more tests failed

## Environment

Set `TEST_BASE_URL` if testing against non-local server:

```bash
TEST_BASE_URL=https://staging.example.com npm run test:webhook
```
