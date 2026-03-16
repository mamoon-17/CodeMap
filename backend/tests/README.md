# CodeMap Integration Tests

End-to-end integration tests for the CodeMap RAG pipeline.

## Test Suite

### `integration.spec.js`

Comprehensive test suite that validates:

1. **Mock Embedding Service**
   - Health check
   - Query endpoint returns mock chunks
   - Proper data structure

2. **Backend RAG Pipeline**
   - Full query flow (embedding → LLM → response)
   - Request validation (empty queries, invalid top_k)
   - Response structure validation

3. **Data Integrity**
   - All required fields present
   - Correct data types
   - Source references valid

## Running Tests

### Prerequisites

Both services must be running:

**Terminal 1 - Mock Service:**
```bash
cd ../mock-service
.venv\Scripts\Activate  # Windows
# source .venv/bin/activate  # macOS/Linux
python app.py
```

**Terminal 2 - Backend:**
```bash
# From backend directory
npm run dev
```

### Run Tests

**Option 1 - Using npm:**
```bash
npm test
```

**Option 2 - Direct:**
```bash
node tests/integration.spec.js
```

## Test Output

```
🧪 CodeMap End-to-End Integration Test Suite

Configuration:
  Backend URL:          http://localhost:5000
  Embedding Service:    http://localhost:5001

━━━ Mock Embedding Service ━━━

✅  Health check passed
     Status: ok
✅  Mock chunks retrieved
     Received 3 chunks, first: src/auth/authController.js

━━━ Backend RAG Pipeline ━━━

✅  RAG pipeline successful
     Answer: Authentication is handled in...
     Sources: 3 chunks

━━━ Request Validation ━━━

✅  Empty query rejected correctly
     Returns 400 status
✅  Invalid top_k rejected correctly
     Returns 400 status

━━━ Data Structure Validation ━━━

✅  Response structure valid
     All required fields present with correct types

============================================================
✅ All tests passed! (6/6)
============================================================
```

## Environment Variables

Override defaults:
```bash
BACKEND_URL=http://localhost:5000 EMBEDDING_SERVICE_URL=http://localhost:5001 node tests/integration.spec.js
```

## CI/CD Integration

Exit codes:
- `0` - All tests passed
- `1` - One or more tests failed

Use in CI:
```yaml
# Example GitHub Actions
- name: Run integration tests
  run: node tests/integration.spec.js
```

## Test Structure

Tests are organized as:
```javascript
describe('Test Suite', async () => {
  await suite.run('Test Name', async () => {
    // Test implementation
    // Throws error on failure
  });
});
```

## Adding New Tests

Add new test cases in `integration.spec.js`:

```javascript
await suite.run('Your test name', async () => {
  const response = await fetch(/* ... */);
  if (!response.ok) throw new Error('Test failed');
  
  logTest('✅', 'pass', 'Test passed', 'Details here');
});
```

## Known Issues

**Gemini API Rate Limits:**
If tests fail with "503 Service Unavailable", Google's API is experiencing high demand. This is not a code issue - retry later or switch to a different model.

**Port Conflicts:**
If services fail to start, check that ports 5000 and 5001 are available:
```bash
# Windows
Get-NetTCPConnection -LocalPort 5000
Get-NetTCPConnection -LocalPort 5001
```

## Future Enhancements

- [ ] Add performance benchmarks
- [ ] Test retry logic
- [ ] Test error handling edge cases
- [ ] Mock LLM responses for faster tests
- [ ] Add load testing
- [ ] Test concurrent requests
