/**
 * This file is currently dead code. Eric would like to pursue this direction later.
 *
 * The code here can start an interactive session,
 * but Eric could not figure out how to parse the SSH connection details
 * (username, password, port) from the subprocess logs. The logs containing
 * that information did not show up when monitoring the stdout of
 * `clearml-session --attach <task id>` after starting it from NodeJS.
 *
 * I thought hard about the prompt for this file:
 *
 * Here's the ChatGPT record: https://chat.openai.com/share/6c35b505-0d8e-4eb7-9ef7-22087b8d4228
 */

import { spawn, ChildProcess } from 'child_process';
import * as fs from 'fs';

type OnConnectCallback = (username: string, port: number, password: string) => void;
type OnSshConnectRetryCallback = (
  targetIpAddress: string,
  targetSshPort: number,
  retryCount: number,
  retryWaitTimeSeconds: number,
  abortProcess: () => void
) => void;

/**
 * Start the s subprocess with specific arguments and handle SSH connection details and retries.
 */
export async function startClearmlSessionSubprocess(
  interpreterPath: string,
  sessionId: string
  // onConnectCallback: OnConnectCallback,
  // onSshConnectRetryCallback: OnSshConnectRetryCallback
): Promise<{ subprocessPid: number }> {
  const args = [
    '-m',
    'clearml_session',
    '--attach',
    sessionId,
    '|',
    'tee',
    '/Users/ericriddoch/repos/extra/hello-world-vscode-ext/clearml-session-manager/log.log',
  ];

  const onConnectCallback = (username: string, port: number, password: string) => {
    console.log('onConnectCallback', username, port, password);
  };

  const onSshConnectRetryCallback = (
    targetIpAddress: string,
    targetSshPort: number,
    retryCount: number,
    retryWaitTimeSeconds: number,
    abortProcess: () => void
  ) => {
    console.log('onSshConnectRetryCallback', targetIpAddress, targetSshPort, retryCount, retryWaitTimeSeconds);
  };

  const logFn = (msg: string) => {
    console.log('Start Batch:\n\n', msg, '\n\nEnd Batch\n\n');
  };

  return startDetachedSubprocessWithCallbacks(
    interpreterPath,
    args,
    onConnectCallback,
    onSshConnectRetryCallback,
    logFn
  );
}

/**
 * Parse the SSH connection details from the log message.
 */
function parseSshConnectionDetails(logMessage: string): { username: string; port: number; password: string } | null {
  const match = logMessage.match(/SSH: ssh (\w+)@localhost -p (\d+) \[password: (\w+)\]/);
  if (match) {
    return { username: match[1], port: parseInt(match[2]), password: match[3] };
  }
  return null;
}

/**
 * Parse the SSH retry details from the log message.
 */
function parseSshRetryDetails(
  logMessage: string
): { targetIpAddress: string; targetSshPort: number; retryWaitTimeSeconds: number } | null {
  const match = logMessage.match(
    /Starting SSH tunnel to root@(\d+\.\d+\.\d+\.\d+), port (\d+).*retrying in (\d+) seconds/
  );
  if (match) {
    return {
      targetIpAddress: match[1],
      targetSshPort: parseInt(match[2]),
      retryWaitTimeSeconds: parseInt(match[3]),
    };
  }
  return null;
}

/**
 * Start a bash command as a detached subprocess, react to logs as they come in, and handle non-zero exit status.
 */
export function startDetachedSubprocessWithCallbacks(
  cmd: string,
  args: string[],
  onConnect: OnConnectCallback,
  onSshConnectRetry: OnSshConnectRetryCallback,
  logFn: (msg: string) => void = console.log,
  errorLogFn: (msg: string) => void = console.error,
  onNonZeroExit: (exitCode: number, subprocess: ChildProcess) => void = (exitCode, subprocess) => {}
): Promise<{ subprocessPid: number }> {
  let retryCount = 0;

  const _cmd = [cmd, ...args].join(' ');
  const subprocess = spawn(_cmd, {
    // detached: true,
    stdio: ['ignore', 'pipe', 'pipe', 'pipe'],
    shell: true,
  });

  const handleStream = (stream: NodeJS.ReadableStream, customLogFunction: (msg: string) => void) => {
    stream.on('data', (data) => {
      const message = data.toString();
      // customLogFunction(message);
      logFn(message);

      // Handle SSH connection details
      const sshDetails = parseSshConnectionDetails(message);
      if (sshDetails) {
        onConnect(sshDetails.username, sshDetails.port, sshDetails.password);
      }

      // Handle SSH retry details
      const retryDetails = parseSshRetryDetails(message);
      if (retryDetails) {
        retryCount++;
        onSshConnectRetry(
          retryDetails.targetIpAddress,
          retryDetails.targetSshPort,
          retryCount,
          retryDetails.retryWaitTimeSeconds,
          () => subprocess.kill()
        );
      }
    });
  };

  // handleStream(subprocess.stdout, logFn);
  // handleStream(subprocess.stderr, errorLogFn);

  // Redirect subprocess stdout and stderr to a file
  // const logFile = fs.createWriteStream('/Users/ericriddoch/repos/extra/hello-world-vscode-ext/clearml-session-manager/subprocess.log');
  // subprocess.stdout?.pipe(logFile);
  // subprocess.stderr?.pipe(logFile);
  // subprocess.stdio[1]?.pipe(logFile)
  // subprocess.stdio[3]?.pipe(logFile)
  // subprocess.stdio[4]?.pipe(logFile)

  subprocess.on('exit', (exitCode) => {
    if (exitCode !== 0) {
      onNonZeroExit(exitCode!, subprocess);
    }
  });

  return Promise.resolve({ subprocessPid: subprocess.pid as number });
}

// given a PID, check the logs of a process
// if the logs contain a certain string, then we know the process is done
