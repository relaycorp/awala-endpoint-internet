import { NodeConnectionParams } from '@relaycorp/relaynet-core';
import { type CloudEvent, HTTP } from 'cloudevents';

import { getServiceUrl } from '../knative.js';

const POHTTP_SERVER_URL = await getServiceUrl('awala-endpoint-pohttp-server');
const POHTTP_CLIENT_URL = await getServiceUrl('awala-endpoint-pohttp-client');

const CONNECTION_PARAMS_URL = `${POHTTP_SERVER_URL}/connection-params.der`;

const PARCEL_DELIVERY_HEADERS = new Headers();
PARCEL_DELIVERY_HEADERS.set('Content-Type', 'application/vnd.awala.parcel');

export async function getConnectionParams(): Promise<NodeConnectionParams> {
  const connParamsResponse = await fetch(CONNECTION_PARAMS_URL);
  if (!connParamsResponse.ok) {
    throw new Error(`Failed to get connection params: ${connParamsResponse.statusText}`);
  }
  return NodeConnectionParams.deserialize(await connParamsResponse.arrayBuffer());
}

export async function postParcel(expiredParcelSerialised: ArrayBuffer) {
  return fetch(POHTTP_SERVER_URL, {
    method: 'POST',
    body: expiredParcelSerialised,
    headers: PARCEL_DELIVERY_HEADERS,
  });
}

export async function postEventToPohttpClient(event: CloudEvent<unknown>): Promise<Response> {
  const message = HTTP.binary(event);

  return fetch(POHTTP_CLIENT_URL, {
    method: 'POST',
    headers: message.headers as HeadersInit,
    body: message.body as string,
  });
}
