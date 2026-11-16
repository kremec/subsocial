// This file is required for Expo/React Native SQLite migrations - https://orm.drizzle.team/quick-sqlite/expo

import m0000 from "./0000_initial_schema.sql";
import m0001 from "./0001_move_connections_to_settings.sql";
import m0002 from "./0002_index_platform_posts.sql";
import journal from "./meta/_journal.json";

export default {
  journal,
  migrations: {
    m0000,
    m0001,
    m0002,
  },
};
