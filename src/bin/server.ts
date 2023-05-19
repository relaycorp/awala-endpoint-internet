#!/usr/bin/env node

import { runFastify } from '../utilities/fastify/server.js';
import { makePohttpServer } from '../server/server.js';

await runFastify(await makePohttpServer());
