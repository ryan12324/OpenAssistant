#!/bin/sh
set -e

# Run Prisma migrations / push schema to create or update the SQLite database
node ./node_modules/prisma/build/index.js db push --skip-generate

# Start the Next.js server
exec node server.js
