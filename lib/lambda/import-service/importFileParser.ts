import { S3Client, GetObjectCommand, CopyObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { Readable } from 'stream';
import { SQSClient, SendMessageCommand } from '@aws-sdk/client-sqs';
import * as csvParser from 'csv-parser';

const s3 = new S3Client({ region: process.env.AWS_REGION });
const sqs = new SQSClient({ region: process.env.AWS_REGION });
const queueUrl = process.env.SQS_QUEUE_URL!;

export const handler = async (event: any): Promise<void> => {
  for (const record of event.Records) {
    const bucket = record.s3.bucket.name;
    const key = decodeURIComponent(record.s3.object.key.replace(/\+/g, ' '));

    // 只处理 uploaded/ 目录下的文件
    if (!key.startsWith('uploaded/')) return;

    const getCommand = new GetObjectCommand({ Bucket: bucket, Key: key });
    const response = await s3.send(getCommand);

    // 流式处理 CSV
    const stream = response.Body as Readable;
    // 封装流处理为Promise
    await new Promise((resolve, reject) => {
      stream
        .pipe(csvParser())
        .on('data', async (data) => {
          // 发送消息到SQS
          try {
            await sqs.send(
              new SendMessageCommand({
                QueueUrl: queueUrl,
                MessageBody: JSON.stringify(data),
              })
            );
          } catch (error) {
            console.error('Failed to send message to SQS:', error);
            reject(error);
          }
        })
        .on('end', async () => {
          // // 移动文件到 parsed/ 目录
          // const newKey = key.replace('uploaded/', 'parsed/');
          // await s3.send(new CopyObjectCommand({
          //   Bucket: bucket,
          //   CopySource: `${bucket}/${key}`,
          //   Key: newKey,
          // }));

          // // 删除原文件
          // await s3.send(new DeleteObjectCommand({
          //   Bucket: bucket,
          //   Key: key,
          // }));
          console.log('CSV processing completed');
          resolve(true);
        })
        .on('error', (error) => {
          console.error('CSV parsing error:', error);
          reject(error);
        });
    });
    // 移动并删除文件
    const newKey = key.replace('uploaded/', 'parsed/');
    await s3.send(
      new CopyObjectCommand({
        Bucket: bucket,
        CopySource: `${bucket}/${key}`,
        Key: newKey,
      })
    );
    await s3.send(
      new DeleteObjectCommand({
        Bucket: bucket,
        Key: key,
      })
    );
  }
};
