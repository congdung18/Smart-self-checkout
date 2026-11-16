import { Client } from "pg";
import { compose, dockerMetadata, dockerPostgres } from "./docker-postgres.js";
import { adoptNative } from "./adopt-native.js";
import { backup, restoreToFreshDatabase } from "./backup.js";
import { publicTables } from "./database-snapshot.js";

const action = process.argv[2];
try {
  switch (action) {
    case "up": {
      const db = await dockerPostgres("local", 55433);
      console.log(
        JSON.stringify({
          database: "docker",
          port: db.metadata.port,
          project: db.metadata.project,
          status: "ready",
        }),
      );
      break;
    }
    case "stop":
      compose("local", ["stop", "postgres"]);
      console.log(
        "Docker PostgreSQL stopped; volume and native data retained.",
      );
      break;
    case "status":
      console.log(compose("local", ["ps", "--format", "json"]));
      break;
    case "adopt-native":
      await adoptNative();
      break;
    case "backup": {
      const { url } = dockerMetadata("local");
      console.log(JSON.stringify(backup(url)));
      break;
    }
    case "restore": {
      const archive = process.argv[3];
      if (!archive)
        throw Error(
          "Usage: npm run db:restore -- <archive> [new-environment-name]",
        );
      const name = process.argv[4] || `restore-${Date.now()}`;
      if (name === "local")
        throw Error("Manual rehearsal must use a new environment, not local");
      const db = await dockerPostgres(name);
      const client = new Client({ connectionString: db.url });
      try {
        await client.connect();
        if ((await publicTables(client)).length)
          throw Error("Restore target contains tables; no overwrite allowed");
        restoreToFreshDatabase(db.url, archive);
        console.log(
          JSON.stringify({
            restore: "PASS",
            project: db.metadata.project,
            port: db.metadata.port,
            tables: (await publicTables(client)).length,
          }),
        );
      } finally {
        await client.end();
        await db.pg.stop();
      }
      break;
    }
    default:
      throw Error("Expected up, stop, status, adopt-native, backup or restore");
  }
} catch (error) {
  console.error(
    error instanceof Error ? error.message : "Database operation failed",
  );
  process.exitCode = 1;
}
