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
    const kubectlPortForward = spawn('kubectl', kubectlArgs, {
      timeout: COMMAND_TIMEOUT_SECONDS,
    });

    let stderr = '';
    kubectlPortForward.stderr.on('data', (data: Buffer) => {
      stderr += data.toString();
    });

    kubectlPortForward.once('error', (error) => {
      reject(new Error(`Failed to start port-forward ${serviceName}: ${error.message}\n${stderr}`));
    });

    let commandError: Error | undefined;

    kubectlPortForward.once('close', (exitCode) => {
      if (exitCode !== null && 0 < exitCode) {
        reject(
          new Error(`Port forwarder for ${serviceName} exited with code ${exitCode}:\n${stderr}`),
        );
      } else if (commandError === undefined) {
        resolve();
      } else {
        reject(commandError);
      }
    });

    kubectlPortForward.once('spawn', () => {
      command(localPort)
        // eslint-disable-next-line promise/prefer-await-to-then
        .catch((error: unknown) => {
          commandError = error as Error;
        })
        // eslint-disable-next-line promise/prefer-await-to-then
        .finally(() => {
          kubectlPortForward.kill();
        });
    });
  });
}
