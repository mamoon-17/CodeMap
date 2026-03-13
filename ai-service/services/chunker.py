def chunk_file(file_path, chunk_size=100, overlap=20):
    with open(file_path, "r", encoding="utf-8", errors="ignore") as f:
        lines = f.readlines()

    chunks = []
    start = 0

    while start < len(lines):
        end = min(start + chunk_size, len(lines))
        chunk_text = "".join(lines[start:end])

        if chunk_text.strip():  # ignore empty chunks
            chunks.append({
                "text": chunk_text,
                "file_path": file_path,
                "start_line": start + 1,
                "end_line": end
            })

        start += chunk_size - overlap

    return chunks