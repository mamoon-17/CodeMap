"""
CodeMap - Mock Embedding Service
POST /query  →  returns mock code chunks for testing

This is a simplified mock service for development and testing.
Replace with a real vector DB service in production.
"""

from flask import Flask, request, jsonify
import logging
import os

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = Flask(__name__)


# ---------------------------------------------------------------------------
# Mock Vector DB - Returns sample code chunks for testing
# ---------------------------------------------------------------------------

MOCK_CHUNKS = [
        {
            "id": "chunk_001",
            "score": 0.92,
            "metadata": {
                "file": "src/auth/authController.js",
                "chunk_index": 3,
                "text": "router.post('/login', async (req, res) => {\n  const { email, password } = req.body;\n  const user = await User.findOne({ email });\n  if (!user || !bcrypt.compareSync(password, user.passwordHash)) {\n    return res.status(401).json({ error: 'Invalid credentials' });\n  }\n  const token = jwt.sign({ userId: user._id }, process.env.JWT_SECRET);\n  res.json({ token });\n});"
            }
        },
        {
            "id": "chunk_002",
            "score": 0.87,
            "metadata": {
                "file": "src/auth/middleware.js",
                "chunk_index": 1,
                "text": "const authenticate = (req, res, next) => {\n  const token = req.headers.authorization?.split(' ')[1];\n  if (!token) return res.status(401).json({ error: 'No token provided' });\n  try {\n    req.user = jwt.verify(token, process.env.JWT_SECRET);\n    next();\n  } catch {\n    res.status(401).json({ error: 'Invalid token' });\n  }\n};"
            }
        },
        {
            "id": "chunk_003",
            "score": 0.81,
            "metadata": {
                "file": "src/models/User.js",
                "chunk_index": 0,
                "text": "const UserSchema = new mongoose.Schema({\n  email: { type: String, required: true, unique: true },\n  passwordHash: { type: String, required: true },\n  createdAt: { type: Date, default: Date.now }\n});"
            }
        },
        {
            "id": "chunk_004",
            "score": 0.74,
            "metadata": {
                "file": "src/auth/authController.js",
                "chunk_index": 7,
                "text": "router.post('/register', async (req, res) => {\n  const { email, password } = req.body;\n  const passwordHash = bcrypt.hashSync(password, 10);\n  const user = new User({ email, passwordHash });\n  await user.save();\n  res.status(201).json({ message: 'User created' });\n});"
            }
        },
        {
            "id": "chunk_005",
            "score": 0.68,
            "metadata": {
                "file": "src/config/passport.js",
                "chunk_index": 2,
                "text": "passport.use(new JwtStrategy(opts, async (payload, done) => {\n  const user = await User.findById(payload.userId);\n  if (user) return done(null, user);\n  return done(null, false);\n}));"
            }
        }
]


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------

@app.route("/health", methods=["GET"])
def health():
    return jsonify({"status": "ok", "service": "mock-embedding"})


@app.route("/query", methods=["POST"])
def query():
    """
    POST /query
    Body:  { "query": "Where is authentication handled?", "top_k": 5 }
    Returns: { "query": "...", "results": [ { id, score, metadata } ] }
    """
    body = request.get_json(silent=True)
    if not body or "query" not in body:
        return jsonify({"error": "Request body must include a 'query' field"}), 400

    query_text: str = body["query"].strip()
    top_k: int = int(body.get("top_k", 5))

    if not query_text:
        return jsonify({"error": "'query' must not be empty"}), 400

    if top_k < 1 or top_k > 20:
        return jsonify({"error": "'top_k' must be between 1 and 20"}), 400

    logger.info(f"[MockService] Returning {top_k} mock chunks for query: '{query_text}'")
    results = MOCK_CHUNKS[:top_k]

    return jsonify({
        "query": query_text,
        "results": results
    })


if __name__ == "__main__":
    port = int(os.getenv("PORT", 5001))
    app.run(host="0.0.0.0", port=port, debug=False)
