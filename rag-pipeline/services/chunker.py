def chunk_file(file_path, content, chunk_size=100, overlap=20):
    lines = content.splitlines(keepends=True)

    chunks = []
    start = 0

    while start < len(lines):
        end = min(start + chunk_size, len(lines))
        chunk_text = "".join(lines[start:end])

        if chunk_text.strip():
            chunks.append({
                "text": chunk_text,
                "file_path": file_path,
                "start_line": start + 1,
                "end_line": end
            })

        start += chunk_size - overlap

    return chunks