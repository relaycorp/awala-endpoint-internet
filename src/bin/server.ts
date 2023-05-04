import { argv } from 'node:process';

import { runFastify } from '../utilities/fastify/server.js';
import type { ServerMaker } from '../utilities/fastify/ServerMaker.js';
import { makePohttpServer } from '../server/server';
import { makePohttpClient } from '../client/server';

const SERVER_MAKERS: { [key: string]: ServerMaker } = {
  server: makePohttpServer,
  client: makePohttpClient,
};

const [, scriptName, serverName] = argv;
const serverMaker = SERVER_MAKERS[serverName] as ServerMaker | undefined;

if (serverMaker === undefined) {
  throw new Error(`${scriptName}: Invalid server name (${serverName})`);
}

await runFastify(await serverMaker());
