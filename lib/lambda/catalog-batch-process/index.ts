import { SQSHandler } from 'aws-lambda';
import { DynamoDBClient, PutItemCommand } from '@aws-sdk/client-dynamodb';
import { SNSClient, PublishCommand } from '@aws-sdk/client-sns';

const ddbClient = new DynamoDBClient({});
const snsClient = new SNSClient({});
const productsTable = process.env.PRODUCTS_TABLE!;
const snsTopicArn = process.env.SNS_TOPIC_ARN!;

export const handler: SQSHandler = async (event) => {
  for (const record of event.Records) {
    const product = JSON.parse(record.body);

    // 写入DynamoDB
    await ddbClient.send(
      new PutItemCommand({
        TableName: productsTable,
        Item: {
          id: { S: product.id },
          title: { S: product.title },
          description: { S: product.description },
          price: { N: product.price.toString() },
        },
      })
    );

    // 发送SNS通知
    await snsClient.send(
      new PublishCommand({
        TopicArn: snsTopicArn,
        Message: `Product ${product.id} created successfully.`,
        Subject: 'Product Creation Notification',
      })
    );
  }
};
