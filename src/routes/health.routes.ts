import { Router, Request, Response } from 'express';
const router = Router();

/**
 * @swagger
 * /health:
 *   get:
 *     summary: Health check endpoint
 *     tags: [Health]
 *     responses:
 *       200:
 *         description: Service is healthy
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: string
 *                   example: ok
 *                 uptime:
 *                   type: number
 *                   example: 12345.67
 *                 timestamp:
 *                   type: string
 *                   format: date-time
 *                 storage:
 *                   type: string
 *                   example: in-memory
 */
router.get('/', async (req: Request, res: Response) => {
  const health = {
    status: 'ok',
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
    storage: 'in-memory'
  };
  res.status(200).json(health);
});
export default router;