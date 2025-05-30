import { APIGatewayProxyResult } from "aws-lambda";
import { DynamoDBClient, ScanCommand, GetItemCommand } from "@aws-sdk/client-dynamodb";
import { unmarshall } from "@aws-sdk/util-dynamodb";

const client = new DynamoDBClient({ region: "eu-north-1" }); 

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
      case "GET /products/available":
        // 查询 products 和 stock 表并合并
        const [products, stock] = await Promise.all([
          client.send(new ScanCommand({ TableName: process.env.PRODUCTS_TABLE })),
          client.send(new ScanCommand({ TableName: process.env.STOCK_TABLE }))
        ]);

        const mergedProducts = products?.Items?.map(productItem => {
          const product = unmarshall(productItem);
          const stockItem = stock?.Items?.find(s => s.product_id.S === product.id);
          return {
            ...product,
            count: stockItem ? parseInt(stockItem?.count?.N || '0') : 0
          };
        });

        return successResponse(mergedProducts);

      case "GET /products/{id}":
        const productId = event.id;
        // 查询 product
        const productResponse = await client.send(
          new GetItemCommand({
            TableName: process.env.PRODUCTS_TABLE,
            Key: { id: { S: productId } }
          })
        );

        if (!productResponse.Item) return notFound();

        // 查询 stock
        const stockResponse = await client.send(
          new GetItemCommand({
            TableName: process.env.STOCK_TABLE,
            Key: { product_id: { S: productId } }
          })
        );

        const productData = unmarshall(productResponse.Item);
        const stockData = stockResponse.Item ? unmarshall(stockResponse.Item) : { count: 0 };

        return successResponse({
          ...productData,
          count: stockData.count
        });
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