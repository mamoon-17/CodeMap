/**
 * End-to-End Integration Tests for CodeMap
 * 
 * Tests the complete RAG pipeline:
 * - Mock embedding service
 * - Backend query endpoint
 * - LLM integration
 * - Request validation
 * 
 * Prerequisites:
 * 1. Mock service running: cd mock-service && python app.py
 * 2. Backend running: cd backend && npm run dev
 * 
 * Run: node tests/integration.spec.js
 */

const BACKEND_URL = process.env.BACKEND_URL || "http://localhost:5000";
const EMBEDDING_URL = process.env.EMBEDDING_SERVICE_URL || "http://localhost:5001";

// Test utilities
const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m'
};

function logTest(emoji, status, message, details = null) {
  const statusColor = status === 'pass' ? colors.green : status === 'fail' ? colors.red : colors.yellow;
  console.log(`${emoji}  ${statusColor}${message}${colors.reset}`);
  if (details) {
    console.log(`     ${colors.cyan}${details}${colors.reset}`);
  }
}

function logSection(title) {
  console.log(`\n${colors.blue}━━━ ${title} ━━━${colors.reset}\n`);
}

// Test suite
class TestSuite {
  constructor() {
    this.results = [];
  }

  async run(name, testFn) {
    try {
      await testFn();
      this.results.push({ name, passed: true });
      return true;
    } catch (error) {
      this.results.push({ name, passed: false, error: error.message });
      return false;
    }
  }

  summary() {
    const passed = this.results.filter(r => r.passed).length;
    const total = this.results.length;
    const failed = this.results.filter(r => !r.passed);

    console.log(`\n${'='.repeat(60)}`);
    if (passed === total) {
      console.log(`${colors.green}✅ All tests passed! (${passed}/${total})${colors.reset}`);
    } else {
      console.log(`${colors.yellow}⚠️  Some tests failed (${passed}/${total} passed)${colors.reset}`);
      if (failed.length > 0) {
        console.log(`\n${colors.red}Failed tests:${colors.reset}`);
        failed.forEach(f => console.log(`  ❌ ${f.name}: ${f.error}`));
      }
    }
    console.log('='.repeat(60));
    
    return passed === total;
  }
}

// Test cases
async function runAllTests() {
  const suite = new TestSuite();

  console.log(`${colors.cyan}🧪 CodeMap End-to-End Integration Test Suite${colors.reset}\n`);
  console.log('Configuration:');
  console.log(`  Backend URL:          ${BACKEND_URL}`);
  console.log(`  Embedding Service:    ${EMBEDDING_URL}`);

  // Test 1: Embedding service health
  logSection('Mock Embedding Service');
  await suite.run('Embedding service health check', async () => {
    const response = await fetch(`${EMBEDDING_URL}/health`);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    
    const data = await response.json();
    if (data.status !== 'ok') throw new Error('Service not healthy');
    
    logTest('✅', 'pass', 'Health check passed', `Status: ${data.status}`);
  });

  // Test 2: Embedding service query endpoint
  await suite.run('Embedding service returns mock chunks', async () => {
    const response = await fetch(`${EMBEDDING_URL}/query`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: 'authentication', top_k: 3 })
    });

    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    
    const data = await response.json();
    if (!data.results || data.results.length === 0) {
      throw new Error('No results returned');
    }
    
    logTest('✅', 'pass', 'Mock chunks retrieved', 
      `Received ${data.results.length} chunks, first: ${data.results[0].metadata.file}`);
  });

  // Test 3: Backend query endpoint (full RAG pipeline)
  logSection('Backend RAG Pipeline');
  await suite.run('Backend query endpoint (full RAG)', async () => {
    const response = await fetch(`${BACKEND_URL}/query`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        query: 'Where is user authentication handled in the codebase?',
        top_k: 3
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`HTTP ${response.status}: ${errorText}`);
    }

    const data = await response.json();
    
    if (!data.answer) throw new Error('No answer generated');
    if (!data.sources || data.sources.length === 0) {
      throw new Error('No sources returned');
    }

    logTest('✅', 'pass', 'RAG pipeline successful', 
      `Answer: ${data.answer.substring(0, 100)}...\nSources: ${data.sources.length} chunks`);
  });

  // Test 4: Request validation - empty query
  logSection('Request Validation');
  await suite.run('Empty query validation', async () => {
    const response = await fetch(`${BACKEND_URL}/query`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: '' })
    });

    if (response.status !== 400) {
      throw new Error(`Expected 400, got ${response.status}`);
    }

    logTest('✅', 'pass', 'Empty query rejected correctly', 'Returns 400 status');
  });

  // Test 5: Request validation - invalid top_k
  await suite.run('Invalid top_k validation', async () => {
    const response = await fetch(`${BACKEND_URL}/query`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: 'test', top_k: 100 })
    });

    if (response.status !== 400) {
      throw new Error(`Expected 400, got ${response.status}`);
    }

    logTest('✅', 'pass', 'Invalid top_k rejected correctly', 'Returns 400 status');
  });

  // Test 6: Data structure validation
  logSection('Data Structure Validation');
  await suite.run('Response structure validation', async () => {
    const response = await fetch(`${BACKEND_URL}/query`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: 'test query', top_k: 2 })
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`HTTP ${response.status}: ${errorText}`);
    }

    const data = await response.json();
    
    // Validate structure
    if (!data.query) throw new Error('Missing query field');
    if (!data.answer) throw new Error('Missing answer field');
    if (!Array.isArray(data.sources)) throw new Error('Sources is not an array');
    
    // Validate source structure
    if (data.sources.length > 0) {
      const source = data.sources[0];
      if (!source.file) throw new Error('Source missing file field');
      if (typeof source.chunk_index !== 'number') throw new Error('Source missing chunk_index');
      if (typeof source.score !== 'number') throw new Error('Source missing score');
      if (!source.text) throw new Error('Source missing text field');
    }

    logTest('✅', 'pass', 'Response structure valid', 
      'All required fields present with correct types');
  });

  // Summary
  const allPassed = suite.summary();
  process.exit(allPassed ? 0 : 1);
}

// Execute tests
runAllTests().catch(err => {
  console.error(`${colors.red}Fatal error:${colors.reset}`, err);
  process.exit(1);
});
