import { PrismaClient } from "@prisma/client";
import { hashPassword } from "../src/utils/password";
const prisma = new PrismaClient();
async function main() {
  console.log("🌱 Starting database seed...");

  // Create test users with proper bcrypt hashing
  const testPassword = await hashPassword("Test@123");

  // Admin User (PRODUCTION-READY)
  const adminUser = await prisma.user.upsert({
    where: {
      email: "admin@kangaroorooms.com"
    },
    update: {},
    create: {
      name: "Admin User",
      email: "admin@kangaroorooms.com",
      password: await hashPassword("admin123"),
      phone: "+91-9999999999",
      city: "jaipur",
      role: "ADMIN"
    }
  });
  console.log("✅ Created admin user: admin@kangaroorooms.com / admin123");

  // Test Tenant User (CRITICAL FOR TESTING)
  const testTenant = await prisma.user.upsert({
    where: {
      email: "tenant@test.com"
    },
    update: {},
    create: {
      name: "Test Tenant",
      email: "tenant@test.com",
      password: testPassword,
      phone: "+91-9876511111",
      city: "jaipur",
      role: "TENANT"
    }
  });
  console.log("✅ Created test tenant: tenant@test.com / Test@123");

  // Create sample owners
  const ownerPassword = await hashPassword("owner123");
  const owner1 = await prisma.user.upsert({
    where: {
      email: "owner1@kangaroo.com"
    },
    update: {},
    create: {
      name: "Rajesh Kumar",
      email: "owner1@kangaroo.com",
      password: ownerPassword,
      phone: "+91-9876543210",
      city: "jaipur",
      role: "OWNER"
    }
  });
  const owner2 = await prisma.user.upsert({
    where: {
      email: "owner2@kangaroo.com"
    },
    update: {},
    create: {
      name: "Priya Sharma",
      email: "owner2@kangaroo.com",
      password: ownerPassword,
      phone: "+91-9876543211",
      city: "bangalore",
      role: "OWNER"
    }
  });
  console.log("✅ Created owner users");

  // Create Jaipur properties (12 properties for testing 10-property limit)
  const jaipurProperties = [{
    title: "Luxury 2BHK in C-Scheme",
    description: "Premium 2BHK apartment in the heart of Jaipur. Modern amenities, close to shopping centers and restaurants.",
    city: "jaipur",
    location: "C-Scheme",
    landmark: "Near Gaurav Tower",
    pricePerMonth: 22000,
    roomType: "2BHK",
    idealFor: ["Working Professionals"],
    amenities: ["WiFi", "AC", "Attached Bathroom", "Kitchen", "Parking", "Security"],
    images: ["https://images.unsplash.com/photo-1522708323590-d24dbb6b0267"],
    rating: 4.7,
    reviewsCount: 34,
    isPopular: true,
    isActive: true,
    ownerId: owner1.id
  }, {
    title: "Spacious 1BHK in Malviya Nagar",
    description: "Well-furnished 1BHK perfect for students and working professionals. Near metro station.",
    city: "jaipur",
    location: "Malviya Nagar",
    landmark: "Near Jawahar Circle",
    pricePerMonth: 15000,
    roomType: "1BHK",
    idealFor: ["Students", "Working Professionals"],
    amenities: ["WiFi", "AC", "Kitchen", "Security", "Power Backup"],
    images: ["https://images.unsplash.com/photo-1502672260266-1c1ef2d93688"],
    rating: 4.5,
    reviewsCount: 28,
    isPopular: true,
    isActive: true,
    ownerId: owner1.id
  }, {
    title: "Premium PG in Vaishali Nagar",
    description: "High-quality PG accommodation with meals included. Safe and secure environment for students.",
    city: "jaipur",
    location: "Vaishali Nagar",
    landmark: "Near Celebration Mall",
    pricePerMonth: 10000,
    roomType: "PG",
    idealFor: ["Students"],
    amenities: ["WiFi", "AC", "Attached Bathroom", "Security"],
    images: ["https://images.unsplash.com/photo-1555854877-bab0e564b8d5"],
    rating: 4.3,
    reviewsCount: 56,
    isPopular: false,
    isActive: true,
    ownerId: owner1.id
  }, {
    title: "Modern Studio in Mansarovar",
    description: "Compact studio apartment with all modern amenities. Perfect for solo professionals.",
    city: "jaipur",
    location: "Mansarovar",
    landmark: "Near Gaurav Path",
    pricePerMonth: 12000,
    roomType: "Studio",
    idealFor: ["Working Professionals"],
    amenities: ["WiFi", "AC", "Kitchen", "Parking"],
    images: ["https://images.unsplash.com/photo-1560448204-e02f11c3d0e2"],
    rating: 4.4,
    reviewsCount: 19,
    isPopular: false,
    isActive: true,
    ownerId: owner1.id
  }, {
    title: "Family 2BHK in Raja Park",
    description: "Spacious 2BHK ideal for small families. Quiet neighborhood with good connectivity.",
    city: "jaipur",
    location: "Raja Park",
    landmark: "Near SMS Hospital",
    pricePerMonth: 18000,
    roomType: "2BHK",
    idealFor: ["Families"],
    amenities: ["WiFi", "Kitchen", "Parking", "Security", "Power Backup"],
    images: ["https://images.unsplash.com/photo-1502005229762-cf1b2da7c5d6"],
    rating: 4.6,
    reviewsCount: 42,
    isPopular: true,
    isActive: true,
    ownerId: owner1.id
  }, {
    title: "Affordable Room in Pratap Nagar",
    description: "Budget-friendly single room with basic amenities. Good for students on a tight budget.",
    city: "jaipur",
    location: "Pratap Nagar",
    landmark: "Near Sanganer Airport",
    pricePerMonth: 8000,
    roomType: "Single",
    idealFor: ["Students"],
    amenities: ["WiFi", "Security"],
    images: ["https://images.unsplash.com/photo-1598928506311-c55ded91a20c"],
    rating: 4.0,
    reviewsCount: 23,
    isPopular: false,
    isActive: true,
    ownerId: owner1.id
  }, {
    title: "Executive Suite in Bani Park",
    description: "Premium executive suite with modern furnishings. Close to railway station.",
    city: "jaipur",
    location: "Bani Park",
    landmark: "Near Railway Station",
    pricePerMonth: 25000,
    roomType: "1BHK",
    idealFor: ["Working Professionals"],
    amenities: ["WiFi", "AC", "Attached Bathroom", "Kitchen", "TV", "Fridge"],
    images: ["https://images.unsplash.com/photo-1505691938895-1758d7feb511"],
    rating: 4.8,
    reviewsCount: 31,
    isPopular: true,
    isActive: true,
    ownerId: owner1.id
  }, {
    title: "Shared Room in Gopalpura",
    description: "Affordable shared accommodation for students. Friendly environment and good facilities.",
    city: "jaipur",
    location: "Gopalpura",
    landmark: "Near Bypass Road",
    pricePerMonth: 6000,
    roomType: "Shared",
    idealFor: ["Students"],
    amenities: ["WiFi", "Kitchen", "Security"],
    images: ["https://images.unsplash.com/photo-1529408686214-b48b8532f72c"],
    rating: 4.1,
    reviewsCount: 45,
    isPopular: false,
    isActive: true,
    ownerId: owner1.id
  }, {
    title: "Luxury 2BHK in Jagatpura",
    description: "High-end 2BHK apartment with premium amenities. Gated community with security.",
    city: "jaipur",
    location: "Jagatpura",
    landmark: "Near Mahindra SEZ",
    pricePerMonth: 28000,
    roomType: "2BHK",
    idealFor: ["Working Professionals"],
    amenities: ["WiFi", "AC", "Attached Bathroom", "Kitchen", "Parking", "Security", "TV", "Washing Machine"],
    images: ["https://images.unsplash.com/photo-1484154218962-a1c002085d2f"],
    rating: 4.9,
    reviewsCount: 38,
    isPopular: true,
    isActive: true,
    ownerId: owner1.id
  }, {
    title: "Cozy 1BHK in Tonk Road",
    description: "Well-maintained 1BHK with good connectivity. Suitable for working professionals.",
    city: "jaipur",
    location: "Tonk Road",
    landmark: "Near Sitapura Industrial Area",
    pricePerMonth: 14000,
    roomType: "1BHK",
    idealFor: ["Working Professionals"],
    amenities: ["WiFi", "AC", "Kitchen", "Parking", "Security"],
    images: ["https://images.unsplash.com/photo-1554995207-c18c203602cb"],
    rating: 4.4,
    reviewsCount: 27,
    isPopular: false,
    isActive: true,
    ownerId: owner1.id
  }, {
    title: "Premium PG in Civil Lines",
    description: "Top-quality PG with excellent food and facilities. Safe for students and professionals.",
    city: "jaipur",
    location: "Civil Lines",
    landmark: "Near Secretariat",
    pricePerMonth: 11000,
    roomType: "PG",
    idealFor: ["Students"],
    amenities: ["WiFi", "AC", "Attached Bathroom", "Security", "Power Backup"],
    images: ["https://images.unsplash.com/photo-1595526114035-0d45ed16cfbf"],
    rating: 4.6,
    reviewsCount: 52,
    isPopular: true,
    isActive: true,
    ownerId: owner1.id
  }, {
    title: "Spacious 2BHK in Nirman Nagar",
    description: "Large 2BHK apartment with balcony. Family-friendly neighborhood with parks nearby.",
    city: "jaipur",
    location: "Nirman Nagar",
    landmark: "Near Ajmer Road",
    pricePerMonth: 20000,
    roomType: "2BHK",
    idealFor: ["Families"],
    amenities: ["WiFi", "AC", "Kitchen", "Parking", "Security", "Power Backup"],
    images: ["https://images.unsplash.com/photo-1560185127-6ed189bf02f4"],
    rating: 4.7,
    reviewsCount: 36,
    isPopular: true,
    isActive: true,
    ownerId: owner1.id
  }];
  const createdRooms = [];
  for (const property of jaipurProperties) {
    const created = await prisma.room.create({
      data: property
    });
    createdRooms.push(created);
  }
  console.log(`✅ Created ${jaipurProperties.length} Jaipur properties`);

  // Create additional properties in other cities
  const otherCityProperties = [{
    title: "Spacious 2BHK in Bandra West",
    description: "Beautiful 2BHK apartment with modern amenities, close to Bandra station.",
    city: "mumbai",
    location: "Bandra West",
    landmark: "Near Bandra Station",
    pricePerMonth: 35000,
    roomType: "2BHK",
    idealFor: ["Working Professionals", "Small Family"],
    amenities: ["WiFi", "AC", "Parking", "Security", "Power Backup"],
    images: ["https://images.unsplash.com/photo-1522708323590-d24dbb6b0267"],
    rating: 4.5,
    reviewsCount: 12,
    isPopular: true,
    isActive: true,
    ownerId: owner2.id
  }, {
    title: "Cozy 1BHK in Koramangala",
    description: "Fully furnished 1BHK in the heart of Koramangala. Walking distance to restaurants.",
    city: "bangalore",
    location: "Koramangala",
    landmark: "Near Forum Mall",
    pricePerMonth: 22000,
    roomType: "1BHK",
    idealFor: ["Working Professionals", "Students"],
    amenities: ["WiFi", "Furnished", "Gym", "Security"],
    images: ["https://images.unsplash.com/photo-1502672260266-1c1ef2d93688"],
    rating: 4.2,
    reviewsCount: 8,
    isPopular: true,
    isActive: true,
    ownerId: owner2.id
  }];
  for (const property of otherCityProperties) {
    await prisma.room.create({
      data: property
    });
  }
  console.log("✅ Created properties in other cities");

  // Seed City Pricing
  const cityPricing = [{
    city: "jaipur",
    plan: "FREE",
    price: 0
  }, {
    city: "jaipur",
    plan: "GOLD",
    price: 99
  }, {
    city: "jaipur",
    plan: "PLATINUM",
    price: 199
  }, {
    city: "kota",
    plan: "FREE",
    price: 0
  }, {
    city: "kota",
    plan: "GOLD",
    price: 79
  }, {
    city: "kota",
    plan: "PLATINUM",
    price: 149
  }, {
    city: "bangalore",
    plan: "FREE",
    price: 0
  }, {
    city: "bangalore",
    plan: "GOLD",
    price: 149
  }, {
    city: "bangalore",
    plan: "PLATINUM",
    price: 299
  }, {
    city: "mumbai",
    plan: "FREE",
    price: 0
  }, {
    city: "mumbai",
    plan: "GOLD",
    price: 199
  }, {
    city: "mumbai",
    plan: "PLATINUM",
    price: 399
  }, {
    city: "delhi",
    plan: "FREE",
    price: 0
  }, {
    city: "delhi",
    plan: "GOLD",
    price: 149
  }, {
    city: "delhi",
    plan: "PLATINUM",
    price: 299
  }];
  for (const pricing of cityPricing) {
    await prisma.cityPricing.upsert({
      where: {
        city_plan: {
          city: pricing.city,
          plan: pricing.plan
        }
      },
      update: {
        price: pricing.price
      },
      create: pricing
    });
  }
  console.log("✅ Created city pricing");

  // Seed Plan Limits (database-driven contact limit system)
  const planLimits = [{
    plan: "FREE",
    city: null,
    contactLimit: 10
  },
  // Global FREE: 10 unlocks per city
  {
    plan: "GOLD",
    city: null,
    contactLimit: null
  },
  // Global GOLD: unlimited
  {
    plan: "PLATINUM",
    city: null,
    contactLimit: null
  } // Global PLATINUM: unlimited
  ];
  for (const limit of planLimits) {
    const existing = await prisma.planLimit.findFirst({
      where: {
        plan: limit.plan,
        city: limit.city
      }
    });
    if (!existing) {
      await prisma.planLimit.create({
        data: {
          plan: limit.plan,
          city: limit.city,
          contactLimit: limit.contactLimit
        }
      });
    }
  }
  console.log("✅ Created plan limits (FREE=10, GOLD=unlimited, PLATINUM=unlimited)");
  console.log("🎉 Database seed completed successfully!");
  console.log("\n📋 Test Credentials:");
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log("👑 ADMIN:");
  console.log("   Email: admin@kangaroorooms.com");
  console.log("   Password: admin123");
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log("🧪 TEST TENANT (for subscription testing):");
  console.log("   Email: tenant@test.com");
  console.log("   Password: Test@123");
  console.log("   City: Jaipur");
  console.log("   Plan: FREE (default)");
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log("👤 Owner: owner1@kangaroo.com / owner123");
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log(`\n📊 Seeded Data Summary:`);
  console.log(`   - ${jaipurProperties.length} properties in Jaipur`);
  console.log(`   - ${otherCityProperties.length} properties in other cities`);
  console.log(`   - ${cityPricing.length} city pricing entries`);
  console.log(`   - ${planLimits.length} plan limit entries`);
}
main().catch((e) => {
  console.error("❌ Seed failed:", e);
  process.exit(1);
}).finally(async () => {
  await prisma.$disconnect();
});