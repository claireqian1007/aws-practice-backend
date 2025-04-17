import { APIGatewayProxyResult } from "aws-lambda";
import { mockProducts } from "./mockData";

export const handler = async (
  event: any
): Promise<APIGatewayProxyResult> => {
  // 处理 CORS 预检请求
  if (event.httpMethod === "OPTIONS") {
    return {
      statusCode: 200,
      body: "",
    };
  }
  try {
    const route = `${event.httpMethod} ${event.path}`;
    switch (route) {
      case "GET /products/available":
        return successResponse(mockProducts);
  
      case "GET /products/{id}":
        const productId = event.id;
        const product = mockProducts.find((p) => p.id === productId);
        return product ? successResponse(product) : notFound();
  
      case "PUT /products":
        const body = JSON.parse(event.body || "{}");
        // 更新逻辑...
        return successResponse(body);
  
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