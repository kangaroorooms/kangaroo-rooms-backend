export interface ApiResponse<T = any> {
  success: boolean;
  message?: string;
  data?: T;
  meta?: any;
  error?: string;
  details?: any;
}
export function successResponse<T>(data: T, message?: string, meta?: any): ApiResponse<T> {
  const response: ApiResponse<T> = {
    success: true,
    data
  };
  if (message) {
    response.message = message;
  }
  if (meta) {
    response.meta = meta;
  }
  return response;
}
export function errorResponse(message: string, details?: any): ApiResponse {
  return {
    success: false,
    error: message,
    details
  };
}