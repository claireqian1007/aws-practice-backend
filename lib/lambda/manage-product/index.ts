import { APIGatewayProxyResult } from "aws-lambda";
import { DynamoDBClient, PutItemCommand, GetItemCommand } from "@aws-sdk/client-dynamodb";
import { v4 as uuidv4 } from "uuid";

const client = new DynamoDBClient({ region: "us-east-1" });

export const handler = async (
  event: any
): Promise<APIGatewayProxyResult> => {
  // 处理 CORS 预检请求
  if (event.httpMethod === "OPTIONS") {
    return {
      statusCode: 200,
      body: "",
      headers: getCorsHeaders() // 确保 CORS 头被保留
    };
  }

  try {
    const route = `${event.httpMethod} ${event.path}`;
    switch (route) {
      case "POST /products":
        try {
          const product = typeof event.body === 'string' ? JSON.parse(event.body) : event.body;
          const { title, description, price, count } = product;

          // 验证必填字段
          if (!title || !price) {
            return badRequest("Missing required fields: title or price");
          }

          const id = uuidv4();

          // 写入 products 表
          await client.send(
            new PutItemCommand({
              TableName: process.env.PRODUCTS_TABLE,
              Item: {
                id: { S: id },
                title: { S: title },
                description: { S: description || "" },
                price: { N: price.toString() },
              },
            })
          );

          await client.send(
            new PutItemCommand({
              TableName: process.env.STOCK_TABLE,
              Item: {
                product_id: { S: id },
                count: { N: count?.toString() || "0" }, // 默认库存为 0
              },
            })
          );
          return {
            statusCode: 201,
            headers: getCorsHeaders(),
            body: JSON.stringify({
              id,
              title,
              description: description || "",
              price: Number(price),
              count: count || 0
            }),
          };
        } catch (error) {
          return serverError(error);
        }

      case "DELETE /products/{id}":
        // 删除逻辑...
        return successResponse({ deletedId: event.id });
      default:
        return notFound();
    }
  } catch (error) {
    return serverError(error);
  }
};


const getCorsHeaders = () => ({
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
});

const successResponse = (data: any) => ({
  statusCode: 200,
  body: JSON.stringify(data)
});

const notFound = () => ({
  statusCode: 404,
  body: JSON.stringify({ message: 'Not Found' })
});

const serverError = (error: unknown) => ({
  statusCode: 500,
  body: JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' })
});

const badRequest = (message: string) => ({
  statusCode: 400,
  headers: getCorsHeaders(),
  body: JSON.stringify({ message }),
});