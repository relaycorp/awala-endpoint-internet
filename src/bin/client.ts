#!/usr/bin/env node

import { runFastify } from '../utilities/fastify/server.js';
import { makePohttpClient } from '../client/server.js';

await runFastify(await makePohttpClient());
