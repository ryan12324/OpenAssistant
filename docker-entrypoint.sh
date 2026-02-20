#!/bin/sh
set -e

# Run Prisma db push to create or update the SQLite database.
# NODE_PATH points at the isolated Prisma CLI install so it can resolve
# its own transitive dependencies (effect, @prisma/config, etc.)
NODE_PATH=./node_modules/.prisma-cli node ./node_modules/.prisma-cli/prisma/build/index.js db push --skip-generate

# Start the Next.js server
exec node server.js
