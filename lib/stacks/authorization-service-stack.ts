import * as cdk from 'aws-cdk-lib';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import { Construct } from 'constructs';
import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config({ path: path.join(__dirname, '../lambda/authorization-service/.env') });

export class AuthorizationServiceStack extends cdk.Stack {
  public readonly basicAuthorizer: lambda.Function;

  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // 从 .env 加载凭据
    const credentials = process.env;
    const envVariables: { [key: string]: string } = {};
    for (const [key, value] of Object.entries(credentials)) {
      // 仅保留符合 AWS 规则的键名：以字母开头，仅包含字母、数字、下划线
      if (value && /^[A-Za-z][A-Za-z0-9_]*$/.test(key) && key.startsWith('MY_KEY_')) {
        envVariables[key] = value;
      } else {
        console.warn(`Skipping invalid environment variable key: ${key}`);
      }
    }

    // 创建 Lambda
    this.basicAuthorizer = new lambda.Function(this, 'BasicAuthorizer', {
      functionName: 'BasicAuthorizerFunction', // 显式设置物理名称
      runtime: lambda.Runtime.NODEJS_18_X,
      handler: 'basicAuthorizer.handler',
      code: lambda.Code.fromAsset(path.join(__dirname, '../lambda/authorization-service')),
      environment: envVariables,
      timeout: cdk.Duration.seconds(30),
    });

    new cdk.CfnOutput(this, 'AuthorizerArn', {
      value: this.basicAuthorizer.functionArn,
    });
  }
}
