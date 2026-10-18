import "dotenv/config";
import { makeApp } from "./app";
import { pool } from "./db";
const app = await makeApp();
await app.listen({ port: Number(process.env.PORT ?? 3000), host: "0.0.0.0" });
for (const signal of ["SIGINT", "SIGTERM"])
  process.on(signal, async () => {
    await app.close();
    await pool.end();
    process.exit(0);
  });
