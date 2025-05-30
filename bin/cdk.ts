#!/usr/bin/env node
import * as cdk from 'aws-cdk-lib';
import { ProductServiceStack } from '../lib/stacks/product-service-stack';
import { ImportServiceStack } from '../lib/stacks/import-service-stack';
import { AuthorizationServiceStack } from '../lib/stacks/authorization-service-stack';

const app = new cdk.App();

const authStack = new AuthorizationServiceStack(app, 'AuthorizationServiceStack', {
  env: {
    region: 'us-east-1',
  },
});
const productStack = new ProductServiceStack(app, 'ProductServiceStack', {
  env: {
    region: 'us-east-1',
  },
  description: 'EPAM CloudX Serverless API Assignment Stack',
});

const importStack = new ImportServiceStack(app, 'ImportServiceStack', {
  catalogItemsQueue: productStack.catalogItemsQueue,
  env: {
    region: 'us-east-1',
  },
  // basicAuthorizer: authStack.basicAuthorizer,
  authorizerLambdaArn: authStack.basicAuthorizer.functionArn,
});

importStack.addDependency(authStack);
