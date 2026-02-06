import express from "express";
import cookieParser from "cookie-parser";

const app = express();
app.use(express.json());
app.use(cookieParser());

const PORT = 3000;
app.listen(PORT, () => {
  console.log(`Server active at: http://localhost:${PORT}`);
});

app.get("/", (_req, res) => {
  return res.send("Server up");
});
