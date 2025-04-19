import * as cdk from "aws-cdk-lib";
import * as lambda from "aws-cdk-lib/aws-lambda";
import * as apigateway from "aws-cdk-lib/aws-apigateway";
import * as path from "path";
import { Construct } from "constructs";

export class ProductServiceStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // 创建 Lambda 函数
    const productLambda = new lambda.Function(this, "ProductHandler", {
      runtime: lambda.Runtime.NODEJS_18_X,
      handler: "index.handler",
      code: lambda.Code.fromAsset(
        path.join(__dirname, "../lambda/product-service")
      ),
      environment: {
        NODE_OPTIONS: "--enable-source-maps",
      },
      timeout: cdk.Duration.seconds(15),
      memorySize: 256,
    });

    // 创建 API Gateway
    const api = new apigateway.RestApi(this, "ProductApi", {
      restApiName: "EPAM Product Service",
      description: "API for product management",
      defaultCorsPreflightOptions: {
        allowOrigins: apigateway.Cors.ALL_ORIGINS,
        allowMethods: apigateway.Cors.ALL_METHODS,
        allowHeaders: ["Content-Type", "Authorization"],
      },
    });

    // 添加 /products 资源
    const products = api.root.addResource("products");
    // /products/available
    const available = products.addResource("available");
    available.addMethod(
      "GET",
      new apigateway.LambdaIntegration(productLambda, {
        proxy: false,
        requestTemplates: {
          "application/json": `{
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
    const product = products.addResource("{id}");
    product.addMethod(
      "GET",
      new apigateway.LambdaIntegration(productLambda, {
        proxy: false,
        requestTemplates: {
          "application/json": `{
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
    product.addMethod(
      "DELETE",
      new apigateway.LambdaIntegration(productLambda, {
        proxy: false,
        requestTemplates: {
          "application/json": `{
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

    // /products (PUT)
    products.addMethod(
      "PUT",
      new apigateway.LambdaIntegration(productLambda, {
        proxy: false,
        requestTemplates: {
          "application/json": `{
          "httpMethod": "$context.httpMethod",
          "path": "$context.resourcePath",
          "body": $input.json('$')
        }`,
        },
        integrationResponses: commonIntegrationResponses,
      }),
      {
        methodResponses: commonMethodResponses,
      }
    );
  }
}

const commonIntegrationResponses = [
  {
    statusCode: "200",
    responseTemplates: {
      "application/json": `$util.parseJson($input.json('$.body'))`,
    },
    responseParameters: {
      "method.response.header.Content-Type": "'application/json'",
      "method.response.header.Access-Control-Allow-Origin": "'*'",
    },
  },
  {
    statusCode: "400",
    selectionPattern: ".*\\[BadRequest\\].*",
    responseParameters: {
      "method.response.header.Content-Type": "'application/json'",
      "method.response.header.Access-Control-Allow-Origin": "'*'",
    },
  },
];

const commonMethodResponses = [
  {
    statusCode: "200",
    responseParameters: {
      "method.response.header.Content-Type": true,
      "method.response.header.Access-Control-Allow-Origin": true,
    },
  },
  {
    statusCode: "400",
    responseParameters: {
      "method.response.header.Content-Type": true,
      "method.response.header.Access-Control-Allow-Origin": true,
    },
  },
];
