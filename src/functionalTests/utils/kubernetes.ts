/* eslint-disable no-console */
import { spawn } from 'node:child_process';

import getPort from 'get-port';

const COMMAND_TIMEOUT_SECONDS = 3000;

type Command = (port: number) => Promise<void>;

export async function connectToClusterService(
  serviceName: string,
  servicePort: number,
  command: Command,
): Promise<unknown> {
  const localPort = await getPort();

  const kubectlArgs = ['port-forward', `svc/${serviceName}`, `${localPort}:${servicePort}`];

  // eslint-disable-next-line promise/avoid-new
  return new Promise<void>((resolve, reject) => {
    console.log(new Date(), `BADGER port-forward ${serviceName}, starting`);
    const kubectlPortForward = spawn('kubectl', kubectlArgs, {
      timeout: COMMAND_TIMEOUT_SECONDS,
    });

    let stderr = '';
    kubectlPortForward.stderr.on('data', (data: Buffer) => {
      console.log(new Date(), `BADGER port-forward ${serviceName}`);
      stderr += data.toString();
    });

    kubectlPortForward.once('error', (error) => {
      reject(new Error(`Failed to start port-forward ${serviceName}: ${error.message}\n${stderr}`));
    });

    kubectlPortForward.once('close', (exitCode) => {
      console.log(new Date(), `BADGER port-forward ${serviceName}, close ${exitCode!}`);
      if (exitCode !== null && 0 < exitCode) {
        reject(
          new Error(`Port forwarder for ${serviceName} exited with code ${exitCode}:\n${stderr}`),
        );
      }
    });

    kubectlPortForward.once('spawn', () => {
      console.log(new Date(), `BADGER port-forward ${serviceName}, spawn`);
      // eslint-disable-next-line promise/catch-or-return
      command(localPort)
        // eslint-disable-next-line promise/prefer-await-to-then
        .then(resolve, reject)
        // eslint-disable-next-line promise/prefer-await-to-then
        .finally(() => {
          kubectlPortForward.kill();
        });
    });
  });
}
