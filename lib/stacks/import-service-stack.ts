import * as cdk from 'aws-cdk-lib';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as apigateway from 'aws-cdk-lib/aws-apigateway';
import * as s3n from 'aws-cdk-lib/aws-s3-notifications';
import * as path from 'path';
import * as sqs from 'aws-cdk-lib/aws-sqs';
import { Construct } from 'constructs';
import { AuthorizationServiceStack } from './authorization-service-stack';

interface ImportServiceStackProps extends cdk.StackProps {
  catalogItemsQueue: sqs.Queue;
  // basicAuthorizer: lambda.Function;
  authorizerLambdaArn: string;
}

export class ImportServiceStack extends cdk.Stack {
  public readonly productsBucket: s3.Bucket;

  constructor(scope: Construct, id: string, props: ImportServiceStackProps) {
    super(scope, id, props);

    // 创建 S3 Bucket（禁用版本控制和加密以符合免费层）
    this.productsBucket = new s3.Bucket(this, 'ProductsBucket', {
      bucketName: `products-import-bucket-${this.account}`,
      cors: [
        {
          allowedMethods: [s3.HttpMethods.PUT], // 允许 PUT 方法
          allowedOrigins: ['http://localhost:3000'], // 允许本地开发环境
          allowedHeaders: ['*'], // 允许所有头
          exposedHeaders: ['ETag'],
        },
      ],
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL, // 禁止公共访问
      removalPolicy: cdk.RemovalPolicy.DESTROY, // 删除堆栈时自动删除桶
    });

    // 创建 Lambda 函数
    const importProductsLambda = new lambda.Function(this, 'ImportProductsFile', {
      runtime: lambda.Runtime.NODEJS_18_X,
      handler: 'importProductsFile.handler',
      code: lambda.Code.fromAsset(path.join(__dirname, '../lambda/import-service')),
      environment: {
        BUCKET_NAME: this.productsBucket.bucketName,
      },
      timeout: cdk.Duration.seconds(15),
      memorySize: 256, // 免费层上限
    });

    // 授权 Lambda 写入 S3
    this.productsBucket.grantPut(importProductsLambda);

    // 创建 API Gateway
    const api = new apigateway.RestApi(this, 'ImportApi', {
      restApiName: 'Product Import Service',
      description: 'API for importing product CSV files',
      defaultCorsPreflightOptions: {
        allowOrigins: apigateway.Cors.ALL_ORIGINS,
        allowMethods: apigateway.Cors.ALL_METHODS,
      },
    });

     // 这个写法会导致隐式资源引用从而导致两个stack之间的循环依赖
    //  const authStack = new AuthorizationServiceStack(this, 'AuthorizationServiceStack', {
    //     env: { region: 'us-east-1' },
    //  });
    //  const authorizer = new apigateway.TokenAuthorizer(this, 'BasicAuthorizer', {
    //    handler: props.basicAuthorizer,
    //  });

    //改用arn导入Lambda
    const authorizerLambda = lambda.Function.fromFunctionAttributes(this, 'ImportedAuthorizer', {
      functionArn: props.authorizerLambdaArn,
      sameEnvironment: true, // 新增此参数
    });

    const authorizer = new apigateway.TokenAuthorizer(this, 'BasicAuthorizer', {
      handler: authorizerLambda,
    });

    // 添加 GET /import 方法
    const importResource = api.root.addResource('import');
    importResource.addMethod('GET', new apigateway.LambdaIntegration(importProductsLambda), {
      requestParameters: {
        'method.request.querystring.name': true, // 强制要求 name 参数
      },
      authorizer
    });

    // 创建 importFileParser Lambda
    const importFileParserLambda = new lambda.Function(this, 'ImportFileParser', {
      runtime: lambda.Runtime.NODEJS_18_X,
      handler: 'importFileParser.handler',
      code: lambda.Code.fromAsset(path.join(__dirname, '../lambda/import-service')),
      environment: {
        BUCKET_NAME: this.productsBucket.bucketName,
      },
      timeout: cdk.Duration.seconds(30),
      memorySize: 256,
    });

    // 授权 Lambda 读取/删除 S3 对象
    this.productsBucket.grantRead(importFileParserLambda);
    this.productsBucket.grantDelete(importFileParserLambda);

    // 添加 S3 事件触发
    this.productsBucket.addEventNotification(
      s3.EventType.OBJECT_CREATED,
      new s3n.LambdaDestination(importFileParserLambda),
      { prefix: 'uploaded/' } // 仅监听 uploaded/ 目录
    );

    importFileParserLambda.addEnvironment('SQS_QUEUE_URL', props.catalogItemsQueue.queueUrl);
    props.catalogItemsQueue.grantSendMessages(importFileParserLambda);
  }
}
