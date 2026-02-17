# Kangaroo Rooms Backend API

Production-ready REST API for the Kangaroo Rooms rental platform. Built with Node.js, TypeScript, Express, Prisma, and PostgreSQL.

## 🚀 Features

- **Clean Architecture**: Layered architecture with controllers, services, and repositories
- **Type Safety**: Full TypeScript implementation with strict mode
- **Database**: PostgreSQL with Prisma ORM for type-safe database access
- **Authentication**: JWT-based authentication with bcrypt password hashing
- **Security**: Helmet, CORS, rate limiting, and input validation
- **Logging**: Structured logging with Pino
- **API Documentation**: Interactive Swagger/OpenAPI documentation
- **Pagination**: Efficient pagination for all list endpoints
- **Testing**: Jest setup with unit and integration tests
- **Docker**: Multi-stage Dockerfile and docker-compose for easy deployment
- **CI/CD**: GitHub Actions workflow for automated testing

## 📋 Prerequisites

- Node.js >= 18.0.0
- npm >= 9.0.0
- PostgreSQL >= 15 (or use Docker)

## 🛠️ Installation

### Local Development

1. **Clone the repository**
   ```bash
   git clone <repository-url>
   cd backend
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Set up environment variables**
   ```bash
   cp .env.example .env
   ```
   
   Edit `.env` and configure:
   - `DATABASE_URL`: Your PostgreSQL connection string
   - `JWT_SECRET`: A secure random string for JWT signing
   - `CORS_ORIGIN`: Your frontend URL(s)

4. **Run database migrations**
   ```bash
   npx prisma migrate dev
   ```

5. **Seed the database** (optional)
   ```bash
   npm run seed
   ```

6. **Start development server**
   ```bash
   npm run dev
   ```

   The API will be available at `http://localhost:3001`

### Using Docker

1. **Build and start containers**
   ```bash
   docker-compose up --build
   ```

   This will:
   - Start PostgreSQL container
   - Build and start the API container
   - Run migrations automatically
   - Seed the database with sample data

2. **Stop containers**
   ```bash
   docker-compose down
   ```

3. **View logs**
   ```bash
   docker-compose logs -f api
   ```

## 📚 API Documentation

Once the server is running, visit:
- **Swagger UI**: http://localhost:3001/api-docs
- **Health Check**: http://localhost:3001/health

### Authentication

Most endpoints require JWT authentication. Include the token in the Authorization header:

```
Authorization: Bearer <your-jwt-token>
```

### Test Credentials (after seeding)

**Owner Account:**
- Email: `owner1@kangaroo.com`
- Password: `owner123`

**Tenant Account:**
- Email: `tenant1@kangaroo.com`
- Password: `tenant123`

## 🔑 API Endpoints

### Authentication
- `POST /api/auth/register` - Register new user
- `POST /api/auth/login` - Login and get JWT token

### Rooms
- `GET /api/rooms` - List rooms (with filters and pagination)
- `GET /api/rooms/:id` - Get room details
- `POST /api/rooms` - Create room (owner only)
- `PUT /api/rooms/:id` - Update room (owner only)
- `DELETE /api/rooms/:id` - Delete room (owner only)
- `PATCH /api/rooms/:id/toggle-status` - Toggle room active status

### Bookings
- `POST /api/bookings` - Create booking request
- `GET /api/bookings/tenant` - Get tenant's bookings (paginated)
- `GET /api/bookings/owner` - Get owner's bookings (paginated)
- `PATCH /api/bookings/:id/status` - Update booking status (owner only)

### Owner Dashboard
- `GET /api/owner/dashboard` - Get owner dashboard summary

### Profile
- `GET /api/profile` - Get current user profile
- `PUT /api/profile` - Update user profile

### Health
- `GET /health` - Health check endpoint

## 🧪 Testing

### Run all tests
```bash
npm test
```

### Run tests in watch mode
```bash
npm run test:watch
```

### Generate coverage report
```bash
npm run test:coverage
```

## 📦 Database Management

### Generate Prisma Client
```bash
npm run prisma:generate
```

### Create a new migration
```bash
npm run prisma:migrate
```

### Deploy migrations (production)
```bash
npm run prisma:migrate:deploy
```

### Open Prisma Studio (database GUI)
```bash
npm run prisma:studio
```

### Seed database
```bash
npm run seed
```

## 🏗️ Project Structure

```
backend/
├── prisma/
│   ├── schema.prisma          # Database schema
│   └── seed.ts                # Database seeding script
├── src/
│   ├── config/
│   │   └── env.ts             # Environment configuration
│   ├── controllers/           # Request handlers
│   ├── middleware/            # Express middleware
│   ├── models/                # Domain models
│   ├── repositories/          # Data access layer
│   │   ├── interfaces.ts      # Repository interfaces
│   │   ├── PrismaUserRepository.ts
│   │   ├── PrismaRoomRepository.ts
│   │   └── PrismaBookingRepository.ts
│   ├── routes/                # API routes
│   ├── services/              # Business logic
│   ├── utils/                 # Utility functions
│   │   ├── logger.ts          # Structured logging
│   │   ├── prisma.ts          # Prisma client
│   │   ├── jwt.ts             # JWT utilities
│   │   └── password.ts        # Password hashing
│   ├── swagger.ts             # API documentation
│   └── index.ts               # Application entry point
├── tests/
│   ├── unit/                  # Unit tests
│   └── integration/           # Integration tests
├── Dockerfile                 # Docker configuration
├── docker-compose.yml         # Docker Compose configuration
└── package.json
```

## 🔒 Security Features

- **Helmet**: Sets security-related HTTP headers
- **CORS**: Configurable cross-origin resource sharing
- **Rate Limiting**: 
  - General: 100 requests per 15 minutes
  - Auth endpoints: 5 requests per 15 minutes
- **JWT Authentication**: Secure token-based authentication
- **Password Hashing**: bcrypt with salt rounds
- **Input Validation**: Zod schema validation on all inputs
- **SQL Injection Protection**: Prisma's parameterized queries

## 📊 Monitoring & Logging

- **Structured Logging**: JSON logs in production, pretty logs in development
- **Request Logging**: All requests logged with timing information
- **Error Logging**: Detailed error logs with stack traces
- **Health Checks**: `/health` endpoint for monitoring services

## 🚢 Deployment

### Environment Variables (Production)

Ensure these are set in your production environment:

```env
NODE_ENV=production
PORT=3001
DATABASE_URL=postgresql://user:password@host:5432/database
JWT_SECRET=<strong-random-secret>
JWT_EXPIRES_IN=7d
CORS_ORIGIN=https://yourdomain.com
ENABLE_SWAGGER=false
```

### Deployment Platforms

This backend is ready to deploy on:
- **Railway**: Connect GitHub repo, set env vars, deploy
- **Render**: Create web service, add PostgreSQL, deploy
- **Heroku**: Add Heroku Postgres addon, deploy
- **AWS/GCP/Azure**: Use Docker image with managed PostgreSQL

### Database Migrations

Always run migrations before starting the application:

```bash
npx prisma migrate deploy
```

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## 📝 License

This project is licensed under the MIT License.

## 🆘 Support

For issues and questions:
- Open an issue on GitHub
- Email: support@kangaroorooms.com

## 🔄 CI/CD

GitHub Actions workflow runs on every push and PR:
- Installs dependencies
- Runs database migrations
- Builds the application
- Runs all tests
- Generates coverage report

See `.github/workflows/ci.yml` for details.

## Admin Panel Integration

### ✅ Admin Functionality - Fully Integrated

The backend includes complete admin panel functionality for property approval and user management.

**Note:** The separate `adminPannelBackend` folder is deprecated. All admin functionality is available through this main backend.

### Admin API Endpoints

All admin routes require authentication and ADMIN role:

#### Property Management
- `GET /api/admin/properties/pending` - Get properties awaiting approval
- `PUT /api/admin/properties/:id/approve` - Approve a property
- `PUT /api/admin/properties/:id/reject` - Reject a property

#### User Management  
- `GET /api/admin/users` - Get all users with stats
- `PUT /api/admin/users/:id/status` - Update user status (active/inactive)

#### Analytics
- `GET /api/admin/stats/properties` - Property statistics
- `GET /api/admin/stats/revenue` - Revenue statistics

### Admin Approval Workflow

1. **Owner adds property** → Room created with `status: PENDING`
2. **Admin reviews** → Calls `GET /api/admin/properties/pending`
3. **Admin approves/rejects** → Calls `PUT /api/admin/properties/:id/approve` or `reject`
4. **Property goes live** → Room status updated to `APPROVED` (visible to tenants)

### Authentication & Authorization

Admin routes use two middleware layers:
```typescript
router.get('/properties/pending', authenticateToken, requireAdmin, AdminController.getPendingProperties);
```

1. `authenticateToken` - Verifies JWT token
2. `requireAdmin` - Checks `user.role === 'ADMIN'`

### Database Schema

```prisma
model Room {
  status RoomStatus @default(PENDING)
  // ... other fields
}

enum RoomStatus {
  PENDING
  APPROVED
  REJECTED
}

model User {
  role Role @default(TENANT)
  // ... other fields
}

enum Role {
  ADMIN
  OWNER
  TENANT
}
```