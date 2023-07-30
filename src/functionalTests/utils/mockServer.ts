import { mockServerClient, type Expectation, type HttpResponse } from 'mockserver-client';
import type { MockServerClient } from 'mockserver-client/mockServerClient.js';

import { connectToClusterService } from './kubernetes.js';
import { sleep } from './time.js';
import { getServiceActiveRevision } from './knative.js';

const SERVICE_PORT = 80;

const PORT_FORWARDING_DELAY_SECONDS = 0.4;

type Command = (client: MockServerClient) => Promise<unknown>;

async function connectToMockServer(serviceName: string, command: Command): Promise<void> {
  const revision = await getServiceActiveRevision(serviceName);
  const privateServiceName = `${revision}-private`;
  await connectToClusterService(privateServiceName, SERVICE_PORT, async (localPort) => {
    await sleep(PORT_FORWARDING_DELAY_SECONDS);

    const client = mockServerClient('127.0.0.1', localPort);
    try {
      await command(client);
    } catch (err: unknown) {
      // The "mockserver-client" library can throw errors with cryptic messages and no stack trace.
      const errMessage = err instanceof Error ? err.message : (err as string);
      throw new Error(`Failed to execute command on mock server ${serviceName}: ${errMessage}`);
    }
  });
}

export interface BinaryBody {
  readonly contentType: string;
  readonly base64Bytes: string;
}

export async function setMockServerExpectation(
  serviceName: string,
  expectation: Expectation,
): Promise<void> {
  await connectToMockServer(serviceName, async (client) => {
    await client.reset();
    await client.mockAnyResponse(expectation);
  });
}

export async function getMockServerRequests(
  serviceName: string,
  retriesIfNoRequests = 1,
): Promise<HttpResponse[]> {
  await sleep(1);

  let requests: HttpResponse[] | undefined;
  await connectToMockServer(serviceName, async (client) => {
    requests = await client.retrieveRecordedRequests({ path: '/' });
  });

  if (requests === undefined) {
    throw new Error(`Failed to retrieve requests for ${serviceName}`);
  }

  if (0 < retriesIfNoRequests && requests.length === 0) {
    return getMockServerRequests(serviceName, retriesIfNoRequests - 1);
  }

  return requests;
}

export function decodeBinaryBody(body: BinaryBody, expectedContentType: string): Buffer {
  expect(body.contentType).toBe(expectedContentType);
  return Buffer.from(body.base64Bytes, 'base64');
}
