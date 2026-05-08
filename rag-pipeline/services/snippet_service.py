from models.schemas import SnippetAnalysisRequest, SnippetAnalysisResponse
from services.llm.llm_client import get_llm_client
 
 
class SnippetService:
    async def analyze(self, request: SnippetAnalysisRequest) -> SnippetAnalysisResponse:
        llm = get_llm_client()
        result = await llm.analyze_snippet(request.file_path, request.code)
        return SnippetAnalysisResponse(
            file_path=request.file_path,
            summary=result["summary"],
            explanation=result["explanation"],
        )
 
 
snippet_service: SnippetService | None = None
 
 
def get_snippet_service() -> SnippetService:
    global snippet_service
    if snippet_service is None:
        snippet_service = SnippetService()
    return snippet_service
