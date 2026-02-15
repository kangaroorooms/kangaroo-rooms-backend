/**
 * Cloudinary Configuration Test Script
 * Run this to verify your Cloudinary setup is working
 * 
 * Usage: node test-cloudinary.js
 */

require('dotenv').config();
const {
  v2: cloudinary
} = require('cloudinary');
console.log('\n🔍 Testing Cloudinary Configuration...\n');

// Check environment variables
console.log('1️⃣ Checking environment variables:');
const cloudName = process.env.CLOUDINARY_CLOUD_NAME;
const apiKey = process.env.CLOUDINARY_API_KEY;
const apiSecret = process.env.CLOUDINARY_API_SECRET;
if (!cloudName || !apiKey || !apiSecret) {
  console.error('❌ Missing Cloudinary credentials in .env file');
  console.log('Required variables:');
  console.log('  - CLOUDINARY_CLOUD_NAME');
  console.log('  - CLOUDINARY_API_KEY');
  console.log('  - CLOUDINARY_API_SECRET');
  process.exit(1);
}
console.log(`✅ CLOUDINARY_CLOUD_NAME: ${cloudName}`);
console.log(`✅ CLOUDINARY_API_KEY: ${apiKey.substring(0, 6)}***`);
console.log(`✅ CLOUDINARY_API_SECRET: ${apiSecret.substring(0, 6)}***`);

// Configure Cloudinary
console.log('\n2️⃣ Configuring Cloudinary SDK:');
cloudinary.config({
  cloud_name: cloudName,
  api_key: apiKey,
  api_secret: apiSecret,
  secure: true
});
console.log('✅ Cloudinary SDK configured');

// Test signature generation
console.log('\n3️⃣ Testing signature generation:');
try {
  const timestamp = Math.floor(Date.now() / 1000);
  const paramsToSign = {
    timestamp,
    folder: 'test-folder'
  };
  const signature = cloudinary.utils.api_sign_request(paramsToSign, apiSecret);
  console.log('✅ Signature generated successfully');
  console.log(`   Timestamp: ${timestamp}`);
  console.log(`   Signature: ${signature.substring(0, 20)}...`);
  console.log(`   Folder: test-folder`);
} catch (error) {
  console.error('❌ Failed to generate signature:', error.message);
  process.exit(1);
}

// Test API connectivity
console.log('\n4️⃣ Testing Cloudinary API connectivity:');
cloudinary.api.ping().then(() => {
  console.log('✅ Successfully connected to Cloudinary API');
  console.log('\n🎉 All tests passed! Your Cloudinary setup is working correctly.\n');
  console.log('Next steps:');
  console.log('  1. Start your backend server: npm run dev');
  console.log('  2. Test the /api/cloudinary/signature endpoint');
  console.log('  3. Try uploading an image from the frontend');
  console.log('\nFor detailed testing instructions, see: CLOUDINARY_SETUP.md\n');
}).catch((error) => {
  console.error('❌ Failed to connect to Cloudinary API:', error.message);
  console.log('\nPossible issues:');
  console.log('  - Check your internet connection');
  console.log('  - Verify your Cloudinary credentials are correct');
  console.log('  - Check if your Cloudinary account is active');
  process.exit(1);
});