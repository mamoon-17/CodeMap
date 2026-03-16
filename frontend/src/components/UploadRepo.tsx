import { useState } from "react";

type UploadStatus = "idle" | "uploading" | "done" | "error";

interface UploadResult {
  project: { id: string; name: string; status: string };
  fileCount: number;
}

export default function UploadRepo() {
  const [file, setFile] = useState<File | null>(null);
  const [status, setStatus] = useState<UploadStatus>("idle");
  const [result, setResult] = useState<UploadResult | null>(null);
  const [errorMsg, setErrorMsg] = useState<string>("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!file) return;

    setStatus("uploading");
    setResult(null);
    setErrorMsg("");

    const form = new FormData();
    form.append("file", file);
    form.append("name", file.name.replace(".zip", ""));

    try {
      const res = await fetch("http://localhost:5000/projects/upload", {
        method: "POST",
        body: form,
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Upload failed");
      }

      const data: UploadResult = await res.json();
      setResult(data);
      setStatus("done");
    } catch (e) {
      setErrorMsg(e instanceof Error ? e.message : "Something went wrong");
      setStatus("error");
    }
  };

  return (
    <div>
      <h2>Upload Repository</h2>
      <form onSubmit={handleSubmit}>
        <input
          type="file"
          accept=".zip"
          onChange={(e) => setFile(e.target.files?.[0] ?? null)}
        />
        <button type="submit" disabled={!file || status === "uploading"}>
          {status === "uploading" ? "Uploading..." : "Upload"}
        </button>
      </form>

      {status === "uploading" && (
        <p>Indexing your repository, please wait...</p>
      )}

      {status === "done" && result && (
        <p>
          Done! Project <strong>{result.project.name}</strong> indexed{" "}
          <strong>{result.fileCount}</strong> files.
        </p>
      )}

      {status === "error" && <p style={{ color: "red" }}>{errorMsg}</p>}
    </div>
  );
}
