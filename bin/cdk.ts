#!/usr/bin/env node
import * as cdk from 'aws-cdk-lib';
import { ProductServiceStack } from '../lib/stacks/product-service-stack';
import { ImportServiceStack } from '../lib/stacks/import-service-stack';

const app = new cdk.App();

new ProductServiceStack(app, 'ProductServiceStack', {
  env: {
    region:'us-east-1'
  },
  description: "EPAM CloudX Serverless API Assignment Stack"
});

new ImportServiceStack(app, 'ImportServiceStack', {
  env: {
    region:'us-east-1'
  },
})