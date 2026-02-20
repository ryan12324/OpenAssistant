#!/bin/sh
set -e

# Run Prisma db push to create or update the SQLite database.
# The CLI lives at /prisma-cli with its own node_modules so standard
# module resolution works for all its transitive deps (CJS and ESM).
node /prisma-cli/node_modules/prisma/build/index.js db push --schema=./prisma/schema.prisma --skip-generate

# Start the Next.js server
exec node server.js
