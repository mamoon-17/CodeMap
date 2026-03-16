def chunk_file(file_path, content, chunk_size=100, overlap=20):
    if not isinstance(chunk_size, int) or chunk_size <= 0:
        raise ValueError(f"chunk_size must be a positive integer, got {chunk_size!r}")
    if not isinstance(overlap, int) or overlap < 0:
        raise ValueError(f"overlap must be a non-negative integer, got {overlap!r}")
    if overlap >= chunk_size:
        raise ValueError(
            f"overlap ({overlap}) must be strictly less than chunk_size ({chunk_size})"
        )

    step = chunk_size - overlap
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

        start += step

    return chunks