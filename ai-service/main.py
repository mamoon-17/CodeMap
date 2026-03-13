from fastapi import FastAPI
from routers import embed

app = FastAPI()

app.include_router(embed.router)

@app.get("/health")
def health():
    return {"status": "ok"}