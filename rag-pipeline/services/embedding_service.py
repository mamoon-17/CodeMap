"""
Embedding Service - Handles vector search for code chunks
Currently returns mock data, will be integrated with real vector DB
"""
import logging
from models.types_models import Chunk, ChunkMetadata

logger = logging.getLogger(__name__)


# Mock data for testing - will be replaced with actual vector DB
MOCK_CHUNKS = [
    {
        "id": "chunk_001",
        "score": 0.92,
        "metadata": {
            "file": "src/auth/authController.js",
            "chunk_index": 3,
            "text": "router.post('/login', async (req, res) => {\n  const { email, password } = req.body;\n  const user = await User.findOne({ email });\n  if (!user || !bcrypt.compareSync(password, user.passwordHash)) {\n    return res.status(401).json({ error: 'Invalid credentials' });\n  }\n  const token = jwt.sign({ userId: user._id }, process.env.JWT_SECRET);\n  res.json({ token });\n});",
        },
    },
    {
        "id": "chunk_002",
        "score": 0.87,
        "metadata": {
            "file": "src/auth/middleware.js",
            "chunk_index": 1,
            "text": "const authenticate = (req, res, next) => {\n  const token = req.headers.authorization?.split(' ')[1];\n  if (!token) return res.status(401).json({ error: 'No token provided' });\n  try {\n    req.user = jwt.verify(token, process.env.JWT_SECRET);\n    next();\n  } catch {\n    res.status(401).json({ error: 'Invalid token' });\n  }\n};",
        },
    },
    {
        "id": "chunk_003",
        "score": 0.81,
        "metadata": {
            "file": "src/models/User.js",
            "chunk_index": 0,
            "text": "const UserSchema = new mongoose.Schema({\n  email: { type: String, required: true, unique: true },\n  passwordHash: { type: String, required: true },\n  createdAt: { type: Date, default: Date.now }\n});",
        },
    },
    {
        "id": "chunk_004",
        "score": 0.74,
        "metadata": {
            "file": "src/auth/authController.js",
            "chunk_index": 7,
            "text": "router.post('/register', async (req, res) => {\n  const { email, password } = req.body;\n  const passwordHash = bcrypt.hashSync(password, 10);\n  const user = new User({ email, passwordHash });\n  await user.save();\n  res.status(201).json({ message: 'User created' });\n});",
        },
    },
    {
        "id": "chunk_005",
        "score": 0.68,
        "metadata": {
            "file": "src/config/passport.js",
            "chunk_index": 2,
            "text": "passport.use(new JwtStrategy(opts, async (payload, done) => {\n  const user = await User.findById(payload.userId);\n  if (user) return done(null, user);\n  return done(null, false);\n}));",
        },
    },
]


class EmbeddingService:
    """Service for retrieving relevant code chunks via vector search"""
    
    def __init__(self):
        """Initialize embedding service"""
        # In the future, connect to actual vector DB here
        logger.info("Embedding service initialized (using mock data)")
    
    async def retrieve_chunks(self, query_text: str, top_k: int) -> list[Chunk]:
        """
        Retrieve relevant code chunks for a query
        
        Args:
            query_text: Search query
            top_k: Number of chunks to return
            
        Returns:
            List of relevant code chunks
        """
        # TODO: Replace with actual vector DB search
        # For now, return mock chunks limited by top_k
        
        logger.info(f"Retrieving chunks for query: '{query_text}' (top_k={top_k})")
        
        chunks = []
        for mock_chunk in MOCK_CHUNKS[:top_k]:
            chunk = Chunk(
                id=mock_chunk["id"],
                score=mock_chunk["score"],
                metadata=ChunkMetadata(
                    file=mock_chunk["metadata"]["file"],
                    chunk_index=mock_chunk["metadata"]["chunk_index"],
                    text=mock_chunk["metadata"]["text"],
                ),
            )
            chunks.append(chunk)
        
        logger.info(f"Retrieved {len(chunks)} chunks")
        return chunks


# Global instance
embedding_service: EmbeddingService | None = None


def get_embedding_service() -> EmbeddingService:
    """Get or create embedding service instance"""
    global embedding_service
    if embedding_service is None:
        embedding_service = EmbeddingService()
    return embedding_service
