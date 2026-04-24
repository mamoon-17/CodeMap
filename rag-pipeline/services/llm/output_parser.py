import json
import re
from typing import Any
 
 
class LlmOutputParseError(Exception):
    pass
 
 
_JSON_FENCE_RE = re.compile(r"```(?:json)?\s*([\s\S]*?)\s*```", re.IGNORECASE)
 
 
def parse_json_object(text: str) -> dict[str, Any]:
    """
    Parse a JSON object from an LLM response.
 
    Strategy:
    - Try strict json.loads on full text
    - If that fails, try extracting the first fenced ```json ... ``` block
    - If that fails, try extracting the first {...} object by a greedy brace match
    """
    raw = (text or "").strip()
    if not raw:
        raise LlmOutputParseError("Empty LLM output")
 
    # 1) direct JSON
    try:
        obj = json.loads(raw)
        if isinstance(obj, dict):
            return obj
    except Exception:
        pass
 
    # 2) fenced block
    m = _JSON_FENCE_RE.search(raw)
    if m:
        candidate = m.group(1).strip()
        try:
            obj = json.loads(candidate)
            if isinstance(obj, dict):
                return obj
        except Exception:
            pass
 
    # 3) best-effort: extract first object-like substring
    start = raw.find("{")
    end = raw.rfind("}")
    if start != -1 and end != -1 and end > start:
        candidate = raw[start : end + 1]
        try:
            obj = json.loads(candidate)
            if isinstance(obj, dict):
                return obj
        except Exception:
            pass
 
    raise LlmOutputParseError("Failed to parse JSON object from LLM output")
