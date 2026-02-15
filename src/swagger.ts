import swaggerJsdoc from 'swagger-jsdoc';
import swaggerUi from 'swagger-ui-express';
import { Express } from 'express';
import { env } from './config/env';
const options: swaggerJsdoc.Options = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'Kangaroo Rooms API',
      version: '1.0.0',
      description: 'Production-ready REST API for Kangaroo Rooms rental platform',
      contact: {
        name: 'API Support',
        email: 'support@kangaroorooms.com'
      }
    },
    servers: [{
      url: `http://localhost:${env.PORT}`,
      description: 'Development server'
    }, {
      url: 'https://api.kangaroorooms.com',
      description: 'Production server'
    }],
    components: {
      securitySchemes: {
        bearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
          description: 'Enter your JWT token in the format: Bearer <token>'
        }
      },
      schemas: {
        User: {
          type: 'object',
          properties: {
            id: {
              type: 'string',
              format: 'uuid'
            },
            name: {
              type: 'string'
            },
            email: {
              type: 'string',
              format: 'email'
            },
            phone: {
              type: 'string'
            },
            city: {
              type: 'string'
            },
            role: {
              type: 'string',
              enum: ['OWNER', 'TENANT']
            },
            createdAt: {
              type: 'string',
              format: 'date-time'
            },
            updatedAt: {
              type: 'string',
              format: 'date-time'
            }
          }
        },
        Room: {
          type: 'object',
          properties: {
            id: {
              type: 'string',
              format: 'uuid'
            },
            title: {
              type: 'string'
            },
            description: {
              type: 'string'
            },
            city: {
              type: 'string'
            },
            location: {
              type: 'string'
            },
            landmark: {
              type: 'string'
            },
            pricePerMonth: {
              type: 'number'
            },
            roomType: {
              type: 'string'
            },
            idealFor: {
              type: 'array',
              items: {
                type: 'string'
              }
            },
            amenities: {
              type: 'array',
              items: {
                type: 'string'
              }
            },
            images: {
              type: 'array',
              items: {
                type: 'string'
              }
            },
            rating: {
              type: 'number'
            },
            reviewsCount: {
              type: 'number'
            },
            isPopular: {
              type: 'boolean'
            },
            isVerified: {
              type: 'boolean'
            },
            isActive: {
              type: 'boolean'
            },
            ownerId: {
              type: 'string',
              format: 'uuid'
            },
            createdAt: {
              type: 'string',
              format: 'date-time'
            },
            updatedAt: {
              type: 'string',
              format: 'date-time'
            }
          }
        },
        Booking: {
          type: 'object',
          properties: {
            id: {
              type: 'string',
              format: 'uuid'
            },
            roomId: {
              type: 'string',
              format: 'uuid'
            },
            ownerId: {
              type: 'string',
              format: 'uuid'
            },
            tenantId: {
              type: 'string',
              format: 'uuid',
              nullable: true
            },
            tenantName: {
              type: 'string'
            },
            tenantEmail: {
              type: 'string',
              format: 'email'
            },
            tenantPhone: {
              type: 'string'
            },
            moveInDate: {
              type: 'string',
              format: 'date'
            },
            message: {
              type: 'string',
              nullable: true
            },
            status: {
              type: 'string',
              enum: ['PENDING', 'APPROVED', 'REJECTED']
            },
            createdAt: {
              type: 'string',
              format: 'date-time'
            },
            updatedAt: {
              type: 'string',
              format: 'date-time'
            }
          }
        },
        PaginationMeta: {
          type: 'object',
          properties: {
            page: {
              type: 'number',
              example: 1
            },
            limit: {
              type: 'number',
              example: 20
            },
            total: {
              type: 'number',
              example: 100
            }
          }
        },
        Error: {
          type: 'object',
          properties: {
            success: {
              type: 'boolean',
              example: false
            },
            message: {
              type: 'string'
            }
          }
        }
      },
      parameters: {
        PageParam: {
          in: 'query',
          name: 'page',
          schema: {
            type: 'integer',
            minimum: 1,
            default: 1
          },
          description: 'Page number for pagination'
        },
        LimitParam: {
          in: 'query',
          name: 'limit',
          schema: {
            type: 'integer',
            minimum: 1,
            maximum: 100,
            default: 20
          },
          description: 'Number of items per page'
        }
      }
    },
    security: [{
      bearerAuth: []
    }]
  },
  apis: ['./src/routes/*.ts', './src/controllers/*.ts']
};
const swaggerSpec = swaggerJsdoc(options);
export function setupSwagger(app: Express): void {
  app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec, {
    customCss: '.swagger-ui .topbar { display: none }',
    customSiteTitle: 'Kangaroo Rooms API Docs'
  }));
}