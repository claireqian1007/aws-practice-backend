import * as cdk from 'aws-cdk-lib';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as apigateway from 'aws-cdk-lib/aws-apigateway';
import * as path from 'path';
import { Construct } from 'constructs';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as sqs from 'aws-cdk-lib/aws-sqs';
import * as lambdaEventSources from 'aws-cdk-lib/aws-lambda-event-sources';
import * as sns from 'aws-cdk-lib/aws-sns';
import * as subscriptions from 'aws-cdk-lib/aws-sns-subscriptions';
export class ProductServiceStack extends cdk.Stack {
  public readonly catalogItemsQueue: sqs.Queue; // 导出队列
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // 创建 Layer
    const commonLayer = new lambda.LayerVersion(this, 'CommonLayer', {
      code: lambda.Code.fromAsset(path.join(__dirname, '../lambda/layers/common')),
      compatibleRuntimes: [lambda.Runtime.NODEJS_18_X],
      description: 'common dependencies',
    });

    // 引用已存在的 DynamoDB 表
    const productsTable = dynamodb.Table.fromTableName(this, 'ProductsTable', 'products');
    const stockTable = dynamodb.Table.fromTableName(this, 'StockTable', 'stock');

    // 创建 Lambda 函数
    const productLambda = new lambda.Function(this, 'ProductHandler', {
      layers: [commonLayer],
      runtime: lambda.Runtime.NODEJS_18_X,
      handler: 'index.handler',
      code: lambda.Code.fromAsset(
        path.join(__dirname, '../lambda/get-product') // 新目录
      ),
      environment: {
        NODE_OPTIONS: '--enable-source-maps',
        PRODUCTS_TABLE: productsTable.tableName, // 环境变量
        STOCK_TABLE: stockTable.tableName,
      },
      timeout: cdk.Duration.seconds(15),
      memorySize: 256,
    });

    // 授权 Lambda 读取表数据
    productsTable.grantReadData(productLambda);
    stockTable.grantReadData(productLambda);

    // 创建 API Gateway
    const api = new apigateway.RestApi(this, 'ProductApi', {
      restApiName: 'EPAM Product Service',
      description: 'API for product management',
      defaultCorsPreflightOptions: {
        allowOrigins: apigateway.Cors.ALL_ORIGINS,
        allowMethods: apigateway.Cors.ALL_METHODS,
        allowHeaders: ['Content-Type', 'Authorization'],
      },
    });

    // 添加 /products 资源
    const products = api.root.addResource('products');
    // /products/available
    const available = products.addResource('available');
    available.addMethod(
      'GET',
      new apigateway.LambdaIntegration(productLambda, {
        proxy: false,
        requestTemplates: {
          'application/json': `{
          "httpMethod": "$context.httpMethod",
          "path": "$context.resourcePath"
        }`,
        },
        integrationResponses: commonIntegrationResponses,
      }),
      {
        methodResponses: commonMethodResponses,
      }
    );

    // /products/{id}
    const product = products.addResource('{id}');
    product.addMethod(
      'GET',
      new apigateway.LambdaIntegration(productLambda, {
        proxy: false,
        requestTemplates: {
          'application/json': `{
          "httpMethod": "$context.httpMethod",
          "path": "$context.resourcePath",
          "id": "$input.params('id')"
        }`,
        },
        integrationResponses: commonIntegrationResponses,
      }),
      {
        methodResponses: commonMethodResponses,
      }
    );
    // product.addMethod(
    //   "DELETE",
    //   new apigateway.LambdaIntegration(productLambda, {
    //     proxy: false,
    //     requestTemplates: {
    //       "application/json": `{
    //         "httpMethod": "$context.httpMethod",
    //         "path": "$context.resourcePath",
    //         "id": "$input.params('id')"
    //       }`,
    //     },
    //     integrationResponses: commonIntegrationResponses,
    //   }),
    //   {
    //     methodResponses: commonMethodResponses,
    //   }
    // );

    const manageProductLambda = new lambda.Function(this, 'CreateProductHandler', {
      layers: [commonLayer],
      runtime: lambda.Runtime.NODEJS_18_X,
      handler: 'index.handler',
      code: lambda.Code.fromAsset(path.join(__dirname, '../lambda/manage-product')),
      environment: {
        PRODUCTS_TABLE: productsTable.tableName,
        STOCK_TABLE: stockTable.tableName, // 如果需要操作 stock 表
        NODE_OPTIONS: '--enable-source-maps',
      },
      timeout: cdk.Duration.seconds(15),
      memorySize: 256,
    });

    productsTable.grantWriteData(manageProductLambda);
    stockTable.grantWriteData(manageProductLambda);

    // /products (post)
    products.addMethod(
      'POST',
      new apigateway.LambdaIntegration(manageProductLambda, {
        proxy: false,
        requestTemplates: {
          'application/json': `{
          "httpMethod": "$context.httpMethod",
          "path": "$context.resourcePath",
          "body": $input.body
        }`,
        },
        integrationResponses: commonIntegrationResponses,
      }),
      {
        methodResponses: commonMethodResponses,
      }
    );
    const createProductTopic = new sns.Topic(this, 'CreateProductTopic', {
      topicName: 'createProductTopic',
    });

    createProductTopic.addSubscription(new subscriptions.EmailSubscription('chenyun.qian@outlook.com'));

    // 创建 SQS 队列
    this.catalogItemsQueue = new sqs.Queue(this, 'CatalogItemsQueue', {
      queueName: 'catalogItemsQueue',
      visibilityTimeout: cdk.Duration.seconds(300), // 与Lambda超时时间匹配
    });

    const catalogBatchProcessLambda = new lambda.Function(this, 'CatalogBatchProcess', {
      functionName: 'catalogBatchProcess',
      runtime: lambda.Runtime.NODEJS_18_X,
      code: lambda.Code.fromAsset(path.join(__dirname, '../lambda/catalog-batch-process')),
      handler: 'index.handler',
      environment: {
        PRODUCTS_TABLE: productsTable.tableName,
        SNS_TOPIC_ARN: createProductTopic.topicArn, // Task 6.3中创建的SNS主题
      },
    });
    // 添加SQS事件源，批量处理5条消息
    catalogBatchProcessLambda.addEventSource(
      new lambdaEventSources.SqsEventSource(this.catalogItemsQueue, {
        batchSize: 5,
        reportBatchItemFailures: true,
      })
    );

    // 授权Lambda读取SQS队列
    this.catalogItemsQueue.grantConsumeMessages(catalogBatchProcessLambda);
    productsTable.grantWriteData(catalogBatchProcessLambda);

    // 授权Lambda发布SNS消息
    createProductTopic.grantPublish(catalogBatchProcessLambda);
  }
}

const commonIntegrationResponses = [
  {
    statusCode: '200',
    responseTemplates: {
      'application/json': `$util.parseJson($input.json('$.body'))`,
    },
    responseParameters: {
      'method.response.header.Content-Type': "'application/json'",
      'method.response.header.Access-Control-Allow-Origin': "'*'",
    },
  },
  {
    statusCode: '400',
    selectionPattern: '.*\\[BadRequest\\].*',
    responseParameters: {
      'method.response.header.Content-Type': "'application/json'",
      'method.response.header.Access-Control-Allow-Origin': "'*'",
    },
  },
];

const commonMethodResponses = [
  {
    statusCode: '200',
    responseParameters: {
      'method.response.header.Content-Type': true,
      'method.response.header.Access-Control-Allow-Origin': true,
    },
  },
  {
    statusCode: '400',
    responseParameters: {
      'method.response.header.Content-Type': true,
      'method.response.header.Access-Control-Allow-Origin': true,
    },
  },
];
