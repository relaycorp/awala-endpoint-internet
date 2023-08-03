import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

/**
 * Get an output from the description of a Knative service.
 * @throws {Error} if the service is not found or `kn` is not installed.
 */
async function getServiceOutput(serviceName: string, output: string) {
  const args = ['service', 'describe', serviceName, '-o', output];
  const { stdout } = await execFileAsync('kn', args);
  const stdoutSanitised = stdout.trim();
  if (stdoutSanitised === '') {
    throw new Error(`Could not get output "${output}" for Knative service ${serviceName}`);
  }
  return stdoutSanitised;
}

export async function getServiceUrl(serviceName: string): Promise<string> {
  const output = 'url';
  return getServiceOutput(serviceName, output);
}
