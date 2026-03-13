import type { APIGatewayProxyResultV2 } from 'aws-lambda';

export function jsonResponse(
  statusCode: number,
  body: Record<string, unknown>,
): APIGatewayProxyResultV2 {
  return {
    statusCode,
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  };
}

export function errorResponse(statusCode: number, message: string): APIGatewayProxyResultV2 {
  return jsonResponse(statusCode, { error: message });
}
