import type { SNSEvent } from 'aws-lambda';
import { LambdaClient, PutFunctionConcurrencyCommand } from '@aws-sdk/client-lambda';

const lambda = new LambdaClient({});

/**
 * Budget kill-switch. Invoked by SNS when the monthly budget is breached;
 * reserves zero concurrency on every API function so API Gateway can no
 * longer invoke them. Setting the same value again is a no-op, so SNS
 * redeliveries and retries are safe.
 */
export async function handler(event: SNSEvent): Promise<void> {
  const self = process.env.AWS_LAMBDA_FUNCTION_NAME;
  const functionNames = (process.env.API_FUNCTION_NAMES ?? '')
    .split(',')
    .map((name) => name.trim())
    // Never throttle the kill-switch itself, even if misconfigured
    .filter((name) => name && name !== self);

  if (functionNames.length === 0) {
    throw new Error('API_FUNCTION_NAMES is empty — nothing to disable');
  }

  console.log('Budget kill-switch triggered:', {
    subjects: event.Records?.map((record) => record.Sns.Subject) ?? [],
    functionNames,
  });

  // Attempt every function even if one fails — a partial stop beats none
  const results = await Promise.allSettled(
    functionNames.map((name) =>
      lambda.send(
        new PutFunctionConcurrencyCommand({
          FunctionName: name,
          ReservedConcurrentExecutions: 0,
        }),
      ),
    ),
  );

  const failed: string[] = [];
  results.forEach((result, i) => {
    if (result.status === 'fulfilled') {
      console.log(`Reserved concurrency set to 0: ${functionNames[i]}`);
    } else {
      failed.push(functionNames[i]);
      console.error(`Failed to set reserved concurrency: ${functionNames[i]}`, result.reason);
    }
  });

  if (failed.length > 0) {
    throw new Error(`Budget kill-switch failed for: ${failed.join(', ')}`);
  }
}
