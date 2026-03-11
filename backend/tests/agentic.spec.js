/**
 * Agentic RAG Test Suite
 * Tests the tool-calling workflow where LLM decides whether to search the codebase
 * 
 * Prerequisites:
 * 1. Mock service running on port 5001
 * 2. Backend running on port 5000
 * 3. Valid OPENAI_API_KEY in Python service (mock-service/.env)
 * 
 * ⚠️  Rate Limits (OpenAI):
 * - Check your OpenAI plan limits
 * - If you hit the limit, wait or upgrade your plan
 * 
 * Quick start: cd backend && .\start-dev.bat
 */

const BASE_URL = "http://localhost:5000";
const MOCK_SERVICE_URL = "http://localhost:5001";

class AgenticTestSuite {
  constructor() {
    this.passed = 0;
    this.failed = 0;
    this.tests = [];
  }

  async checkServices() {
    console.log("🔍 Checking services...\n");
    
    // Check mock service
    try {
      const mockResponse = await fetch(`${MOCK_SERVICE_URL}/health`);
      if (mockResponse.ok) {
        console.log("✅ Mock service is running (port 5001)");
      } else {
        throw new Error(`Mock service returned ${mockResponse.status}`);
      }
    } catch (error) {
      console.log("❌ Mock service is NOT running (port 5001)");
      console.log("   Start it: cd mock-service && python app.py\n");
      return false;
    }

    // Check backend
    try {
      const backendResponse = await fetch(`${BASE_URL}/query`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: "test" }),
      });
      // Any response is fine, even 400 (validation error)
      console.log("✅ Backend is running (port 5000)\n");
    } catch (error) {
      console.log("❌ Backend is NOT running (port 5000)");
      console.log("   Start it: cd backend && npm run dev\n");
      console.log("   Or use quick start: cd backend && .\\start-dev.bat\n");
      return false;
    }

    return true;
  }

  async run() {
    console.log("\n🤖 CodeMap Agentic RAG Test Suite\n");

    const servicesReady = await this.checkServices();
    if (!servicesReady) {
      console.log("════════════════════════════════════════════════════════════");
      console.log("❌ Services not running. Start them first:");
      console.log("   cd backend && .\\start-dev.bat");
      console.log("════════════════════════════════════════════════════════════\n");
      process.exit(1);
    }

    // Test 1: General programming question (no tool call expected)
    await this.test(
      "General question should NOT use tool",
      async () => {
        const response = await fetch(`${BASE_URL}/query`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            query: "What is recursion in programming?",
            top_k: 3,
          }),
        });

        if (!response.ok) {
          if (response.status === 429) {
            const data = await response.json();
            throw new Error(`RATE_LIMIT: ${data.error || 'Rate limit exceeded'}`);
          }
          throw new Error(`HTTP ${response.status}`);
        }

        const data = await response.json();
        if (data.tool_used === true) {
          throw new Error("Tool should NOT be used for general questions");
        }
        if (!data.answer || data.answer.length === 0) {
          throw new Error("Missing answer");
        }
        console.log(`   → Tool used: ${data.tool_used}`);
        console.log(`   → Answer preview: ${data.answer.substring(0, 80)}...`);
      }
    );

    // Test 2: Code-specific question (tool call expected)
    await this.test(
      "Code-specific question SHOULD use tool",
      async () => {
        const response = await fetch(`${BASE_URL}/query`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            query: "How does the query service handle errors?",
            top_k: 3,
          }),
        });

        if (!response.ok) {
          if (response.status === 429) {
            const data = await response.json();
            throw new Error(`RATE_LIMIT: ${data.error || 'Rate limit exceeded'}`);
          }
          const errorText = await response.text();
          throw new Error(`HTTP ${response.status}: ${errorText}`);
        }

        const data = await response.json();
        if (data.tool_used === false) {
          throw new Error("Tool SHOULD be used for code-specific questions");
        }
        if (!data.sources || data.sources.length === 0) {
          throw new Error("Sources should be present when tool is used");
        }
        if (!data.answer || data.answer.length === 0) {
          throw new Error("Missing answer");
        }
        console.log(`   → Tool used: ${data.tool_used}`);
        console.log(`   → Sources found: ${data.sources.length}`);
        console.log(`   → Answer preview: ${data.answer.substring(0, 80)}...`);
      }
    );

    // Test 3: Validation - empty query
    await this.test(
      "Empty query should be rejected",
      async () => {
        const response = await fetch(`${BASE_URL}/query`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ query: "", top_k: 3 }),
        });

        if (response.status !== 400) {
          throw new Error(`Expected 400, got ${response.status}`);
        }
      }
    );

    // Test 4: Validation - invalid top_k
    await this.test(
      "Invalid top_k should be rejected",
      async () => {
        const response = await fetch(`${BASE_URL}/query`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ query: "test", top_k: 100 }),
        });

        if (response.status !== 400) {
          throw new Error(`Expected 400, got ${response.status}`);
        }
      }
    );

    // Test 5: Response structure validation (with tool use)
    await this.test(
      "Response structure should be valid",
      async () => {
        const response = await fetch(`${BASE_URL}/query`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            query: "Explain the LLM client implementation",
            top_k: 2,
          }),
        });

        if (!response.ok) {
          if (response.status === 429) {
            const data = await response.json();
            throw new Error(`RATE_LIMIT: ${data.error || 'Rate limit exceeded'}`);
          }
          const errorText = await response.text();
          throw new Error(`HTTP ${response.status}: ${errorText}`);
        }

        const data = await response.json();

        // Validate required fields
        if (!data.query || typeof data.query !== "string") {
          throw new Error("Missing or invalid 'query' field");
        }
        if (!data.answer || typeof data.answer !== "string") {
          throw new Error("Missing or invalid 'answer' field");
        }
        if (typeof data.tool_used !== "boolean") {
          throw new Error("Missing or invalid 'tool_used' field");
        }

        // If tool was used, validate sources
        if (data.tool_used) {
          if (!Array.isArray(data.sources)) {
            throw new Error("Sources should be an array when tool is used");
          }
          if (data.sources.length > 0) {
            const source = data.sources[0];
            if (!source.file || !source.text || typeof source.score !== "number") {
              throw new Error("Invalid source structure");
            }
          }
        }

        console.log(`   → All fields valid ✓`);
      }
    );

    this.printSummary();
  }

  async test(name, fn) {
    try {
      await fn();
      this.passed++;
      console.log(`✅  ${name}`);
    } catch (error) {
      this.failed++;
      const errorMsg = error.message;
      
      // Check for rate limit errors
      if (errorMsg.includes("RATE_LIMIT") || errorMsg.includes("429") || errorMsg.includes("quota")) {
        console.log(`⏸️   ${name}`);
        console.log(`    Rate limit hit: Check your OpenAI plan limits`);
        console.log(`    Wait ~1 minute or use a different API key`);
      } else {
        console.log(`❌  ${name}`);
        console.log(`    Error: ${errorMsg}`);
      }
    }
  }

  printSummary() {
    const total = this.passed + this.failed;
    console.log("\n" + "=".repeat(60));
    if (this.failed === 0) {
      console.log(`✅ All tests passed! (${this.passed}/${total})`);
      console.log("=".repeat(60) + "\n");
      process.exit(0);
    } else {
      console.log(`❌ ${this.failed} test(s) failed (${this.passed}/${total} passed)`);
      console.log("=".repeat(60) + "\n");
      process.exit(1);
    }
  }
}

// Run tests
const suite = new AgenticTestSuite();
suite.run().catch((err) => {
  console.error("Test suite failed:", err);
  process.exit(1);
});
