import { APIGatewayAuthorizerResult, APIGatewayTokenAuthorizerEvent } from 'aws-lambda';

export const handler = async (event: APIGatewayTokenAuthorizerEvent) => {
  try {
    // 1. 验证 Authorization 头是否存在
    const authToken = event.authorizationToken;
    if (!authToken || !authToken.startsWith('Basic ')) {
      return generatePolicy('user', 'Deny', event.methodArn, 401);
    }

    // 2. 解析 Basic Token
    const encodedCreds = authToken.split(' ')[1]; // 去除Basic 前缀
    const decodedCreds = Buffer.from(encodedCreds, 'base64').toString('utf-8');
    const [username, password] = decodedCreds.split(':');

    // 3. 验证凭据
    const storedPassword = process.env[username];
    if (!storedPassword || storedPassword !== password) {
      return generatePolicy('user', 'Deny', event.methodArn, 403);
    }

    // 4. 验证通过
    return generatePolicy(username, 'Allow', event.methodArn);
  } catch (error) {
    return generatePolicy('user', 'Deny', event.methodArn, 403);
  }
};

// 生成 IAM 策略
const generatePolicy = (
  principalId: string,
  effect: 'Allow' | 'Deny',
  resource: string,
  statusCode?: number
): APIGatewayAuthorizerResult => {
  const policy: APIGatewayAuthorizerResult = {
    principalId,
    policyDocument: {
      Version: '2012-10-17',
      Statement: [{
        Action: 'execute-api:Invoke',
        Effect: effect,
        Resource: resource,
      }],
    },
  };

  // 添加自定义上下文或状态码（可选）
  if (statusCode) {
    policy.context = { statusCode: statusCode.toString() };
  }

  return policy;
};