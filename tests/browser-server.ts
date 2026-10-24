// Bundled separately into .local; never included in the production image.
import { makeApp } from "../src/server/app";
import { pool } from "../src/server/db";

const app = await makeApp({ browserTest: true });
await app.listen({ port: Number(process.env.PORT), host: "127.0.0.1" });
for (const signal of ["SIGINT", "SIGTERM"])
  process.on(signal, async () => {
    await app.close();
    await pool.end();
    process.exit(0);
  });
