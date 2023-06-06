import { NodeConnectionParams } from '@relaycorp/relaynet-core';

import { getServiceUrl } from '../knative.js';

const POHTTP_SERVER_URL = await getServiceUrl('awala-endpoint-pohttp-server');

const CONNECTION_PARAMS_URL = `${POHTTP_SERVER_URL}/connection-params.der`;

const ENDPOINT_URL = POHTTP_SERVER_URL;

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
  return fetch(ENDPOINT_URL, {
    method: 'POST',
    body: expiredParcelSerialised,
    headers: PARCEL_DELIVERY_HEADERS,
  });
}
