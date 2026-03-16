/**
 * End-to-end ingest -> query integration test
 *
 * Flow:
 * 1) Ingest code chunks into Python RAG service (/ingest)
 * 2) Query through Node backend (/query), which forwards to Python (/query)
 * 3) Validate sources include the ingested file content
 *
 * Run:
 *   node tests/ingest-query.integration.spec.js
 */

const BACKEND_URL = process.env.BACKEND_URL || "http://localhost:5000";
const RAG_URL =
  process.env.RAG_SERVICE_URL ||
  process.env.EMBEDDING_SERVICE_URL ||
  "http://localhost:5001";

async function assertServiceHealth() {
  let ragHealth;
  try {
    ragHealth = await fetch(`${RAG_URL}/health`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`RAG service unreachable at ${RAG_URL}/health: ${message}`);
  }
  if (!ragHealth.ok) {
    throw new Error(
      `RAG service unavailable: ${RAG_URL}/health -> ${ragHealth.status}`,
    );
  }

  let backendProbe;
  try {
    backendProbe = await fetch(`${BACKEND_URL}/query`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ project_id: "health-probe", query: "probe" }),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(
      `Node backend unreachable at ${BACKEND_URL}/query: ${message}`,
    );
  }

  // Backend may return 200/400/429 depending runtime state; all indicate availability.
  if (![200, 400, 429].includes(backendProbe.status)) {
    throw new Error(`Unexpected backend probe status: ${backendProbe.status}`);
  }
}

function makeIngestPayload() {
  const marker = `INTEGRATION_MARKER_${Date.now()}`;
  const projectId = `integration-project-${Date.now()}`;

  const fileContent = [
    "def codemap_integration_helper():",
    '    """Used only for ingest-query integration test."""',
    `    return "${marker}"`,
    "",
    "def calculate_total(a, b):",
    "    return a + b",
  ].join("\n");

  return {
    marker,
    projectId,
    body: {
      project_id: projectId,
      files: [
        {
          file_path: "src/integration_sample.py",
          content: fileContent,
        },
      ],
    },
  };
}

async function run() {
  console.log("\n[ingest-query] checking service availability...");
  await assertServiceHealth();

  const payload = makeIngestPayload();

  console.log("[ingest-query] ingesting sample file into RAG service...");
  const ingestResponse = await fetch(`${RAG_URL}/ingest`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload.body),
  });

  if (!ingestResponse.ok) {
    const text = await ingestResponse.text();
    throw new Error(`Ingest failed (${ingestResponse.status}): ${text}`);
  }

  const ingestJson = await ingestResponse.json();
  if (typeof ingestJson.indexed !== "number" || ingestJson.indexed <= 0) {
    throw new Error(
      `Unexpected ingest response: ${JSON.stringify(ingestJson)}`,
    );
  }

  console.log(`[ingest-query] indexed chunks: ${ingestJson.indexed}`);

  console.log("[ingest-query] querying through Node backend /query...");
  const queryText = `Find where ${payload.marker} is returned and explain the file/function.`;
  const queryResponse = await fetch(`${BACKEND_URL}/query`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      project_id: payload.projectId,
      query: queryText,
      top_k: 5,
    }),
  });

  if (queryResponse.status === 429) {
    const text = await queryResponse.text();
    throw new Error(`Rate-limited by LLM provider: ${text}`);
  }

  if (!queryResponse.ok) {
    const text = await queryResponse.text();
    throw new Error(`Query failed (${queryResponse.status}): ${text}`);
  }

  const queryJson = await queryResponse.json();

  if (!queryJson.answer || typeof queryJson.answer !== "string") {
    throw new Error(
      `Missing answer in query response: ${JSON.stringify(queryJson)}`,
    );
  }

  if (queryJson.tool_used !== true) {
    throw new Error(
      `Expected tool_used=true for code-specific query. Got: ${queryJson.tool_used}`,
    );
  }

  if (!Array.isArray(queryJson.sources) || queryJson.sources.length === 0) {
    throw new Error(
      `Expected non-empty sources. Got: ${JSON.stringify(queryJson.sources)}`,
    );
  }

  const hasTargetFile = queryJson.sources.some(
    (source) => source.file === "src/integration_sample.py",
  );
  if (!hasTargetFile) {
    throw new Error(
      `Expected source file src/integration_sample.py in sources.`,
    );
  }

  const hasMarkerInSource = queryJson.sources.some(
    (source) =>
      typeof source.text === "string" && source.text.includes(payload.marker),
  );
  if (!hasMarkerInSource) {
    throw new Error(
      "Expected ingested marker to be present in retrieved source chunks.",
    );
  }

  console.log("[ingest-query] PASS");
  console.log(
    `[ingest-query] answer preview: ${queryJson.answer.slice(0, 120)}...`,
  );
}

run().catch((error) => {
  console.error("[ingest-query] FAIL");
  console.error(error.message);
  process.exit(1);
});
