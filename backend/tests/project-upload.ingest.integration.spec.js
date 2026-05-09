/**
 * End-to-end /projects/upload -> Supabase Storage -> Python /ingest integration test.
 *
 * Prerequisites:
 * - Node backend running (defaults to http://localhost:5000)
 * - Python RAG service running (defaults to http://localhost:5001)
 * - Supabase bucket `codemap-projects` exists and backend env has:
 *   - SUPABASE_URL
 *   - SUPABASE_SERVICE_ROLE_KEY
 *
 * Run:
 *   node tests/project-upload.ingest.integration.spec.js
 */
const BACKEND_URL = process.env.BACKEND_URL || "http://localhost:5000";
const RAG_URL =
  process.env.RAG_SERVICE_URL ||
  process.env.EMBEDDING_SERVICE_URL ||
  "http://localhost:5001";

async function assertServiceHealth() {
  const ragHealth = await fetch(`${RAG_URL}/health`);
  if (!ragHealth.ok) {
    throw new Error(`RAG service unavailable: ${RAG_URL}/health -> ${ragHealth.status}`);
  }
}

function createZipBytes() {
  const AdmZip = require("adm-zip");
  const zip = new AdmZip();
  const marker = `UPLOAD_FLOW_MARKER_${Date.now()}`;
  zip.addFile(
    "src/integration_upload_sample.py",
    Buffer.from(`def marker():\n    return "${marker}"\n`, "utf8"),
  );
  // Should be ignored entirely (artifact ignore rules)
  zip.addFile(
    "node_modules/somepkg/index.js",
    Buffer.from(`export const ignored = "${marker}";\n`, "utf8"),
  );
  zip.addFile(
    "README.md",
    Buffer.from(`# Not indexed\n${marker}\n`, "utf8"),
  );
  return { marker, zipBytes: zip.toBuffer() };
}

async function run() {
  console.log("\n[project-upload] checking service availability...");
  await assertServiceHealth();

  const { marker, zipBytes } = createZipBytes();
  const projectName = `upload-flow-${Date.now()}`;
  let createdProjectId = "";

  try {
    console.log("[project-upload] uploading zip to Node backend...");
    const form = new FormData();
    form.set("name", projectName);
    form.set("file", new Blob([zipBytes], { type: "application/zip" }), `${projectName}.zip`);

    const uploadResponse = await fetch(`${BACKEND_URL}/projects/upload`, {
      method: "POST",
      body: form,
    });

    if (!uploadResponse.ok) {
      const text = await uploadResponse.text();
      throw new Error(`Upload failed (${uploadResponse.status}): ${text}`);
    }

    const uploadJson = await uploadResponse.json();
    if (!uploadJson.project || !uploadJson.project.id) {
      throw new Error(`Missing project in response: ${JSON.stringify(uploadJson)}`);
    }
    createdProjectId = uploadJson.project.id;
    if (typeof uploadJson.fileCount !== "number" || uploadJson.fileCount <= 0) {
      throw new Error(`Unexpected fileCount: ${JSON.stringify(uploadJson)}`);
    }

    console.log(`[project-upload] created project ${uploadJson.project.id} with fileCount=${uploadJson.fileCount}`);

    console.log("[project-upload] validating indexed file list...");
    const filesResponse = await fetch(
      `${BACKEND_URL}/projects/${encodeURIComponent(uploadJson.project.id)}/files`,
    );
    if (!filesResponse.ok) {
      const text = await filesResponse.text();
      throw new Error(`Project files failed (${filesResponse.status}): ${text}`);
    }
    const filesJson = await filesResponse.json();
    if (
      !Array.isArray(filesJson.files) ||
      !filesJson.files.includes("src/integration_upload_sample.py")
    ) {
      throw new Error(`Expected uploaded file in project files. Got: ${JSON.stringify(filesJson)}`);
    }

    console.log("[project-upload] validating indexed file content...");
    const fileContentResponse = await fetch(
      `${BACKEND_URL}/projects/${encodeURIComponent(uploadJson.project.id)}/files/content?path=${encodeURIComponent("src/integration_upload_sample.py")}`,
    );
    if (!fileContentResponse.ok) {
      const text = await fileContentResponse.text();
      throw new Error(`Project file content failed (${fileContentResponse.status}): ${text}`);
    }
    const fileContentJson = await fileContentResponse.json();
    if (
      typeof fileContentJson.content !== "string" ||
      !fileContentJson.content.includes(marker)
    ) {
      throw new Error(
        `Expected uploaded marker in indexed file content. Got: ${JSON.stringify(fileContentJson)}`,
      );
    }

    console.log("[project-upload] querying through Node backend /query...");
    const queryResponse = await fetch(`${BACKEND_URL}/query`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        project_id: uploadJson.project.id,
        query: `Find where ${marker} is returned and explain it.`,
        top_k: 5,
      }),
    });

    if (!queryResponse.ok) {
      const text = await queryResponse.text();
      throw new Error(`Query failed (${queryResponse.status}): ${text}`);
    }

    const queryJson = await queryResponse.json();
    if (!Array.isArray(queryJson.sources) || queryJson.sources.length === 0) {
      throw new Error(`Expected non-empty sources. Got: ${JSON.stringify(queryJson.sources)}`);
    }
    const hasMarkerInSource = queryJson.sources.some(
      (source) => typeof source.text === "string" && source.text.includes(marker),
    );
    if (!hasMarkerInSource) {
      throw new Error("Expected uploaded marker to be present in retrieved source chunks.");
    }
    const hasNodeModulesSource = queryJson.sources.some(
      (source) => typeof source.file === "string" && source.file.includes("node_modules/"),
    );
    if (hasNodeModulesSource) {
      throw new Error("Expected node_modules/ files to be ignored during ingestion.");
    }

    console.log("[project-upload] PASS");
  } finally {
    if (createdProjectId) {
      await fetch(`${BACKEND_URL}/projects/${encodeURIComponent(createdProjectId)}/vectors`, {
        method: "DELETE",
      }).catch(() => {});
    }
  }
}

run().catch((error) => {
  console.error("[project-upload] FAIL");
  console.error(error.message);
  process.exit(1);
});

