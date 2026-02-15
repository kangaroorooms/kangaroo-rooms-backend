import { Router } from 'express';
import { Request, Response } from 'express';
const router = Router();

// Cities metadata
const cities = [{
  id: 'jaipur',
  name: 'Jaipur',
  state: 'Rajasthan',
  totalListings: 156
}, {
  id: 'kota',
  name: 'Kota',
  state: 'Rajasthan',
  totalListings: 89
}, {
  id: 'bangalore',
  name: 'Bangalore',
  state: 'Karnataka',
  totalListings: 145
}, {
  id: 'mumbai',
  name: 'Mumbai',
  state: 'Maharashtra',
  totalListings: 89
}, {
  id: 'delhi',
  name: 'Delhi',
  state: 'Delhi',
  totalListings: 112
}, {
  id: 'pune',
  name: 'Pune',
  state: 'Maharashtra',
  totalListings: 67
}, {
  id: 'hyderabad',
  name: 'Hyderabad',
  state: 'Telangana',
  totalListings: 94
}];

// Amenities list
const amenitiesList = ['WiFi', 'AC', 'Attached Bathroom', 'Kitchen', 'Parking', 'Power Backup', 'TV', 'Fridge', 'Washing Machine', 'Security'];

/**
 * @route   GET /api/metadata/cities
 * @desc    Get all cities
 * @access  Public
 */
router.get('/cities', (req: Request, res: Response) => {
  res.json({
    success: true,
    data: cities
  });
});

/**
 * @route   GET /api/metadata/amenities
 * @desc    Get all available amenities
 * @access  Public
 */
router.get('/amenities', (req: Request, res: Response) => {
  res.json({
    success: true,
    data: amenitiesList
  });
});
export default router;